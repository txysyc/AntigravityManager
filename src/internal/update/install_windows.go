package update

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/txysyc/AntigravityManager/src/internal/storage"
)

const (
	ApplyFlag   = "--internal-update-apply"
	ReadyFlag   = "--internal-update-relaunch"
	stagePrefix = ".antigravity-update-"
	helperFile  = "apply.exe"
	packageFile = "download.exe"
	backupFile  = "previous.exe"
	readyFile   = "started"
	waitLimit   = 45 * time.Second
)

type Staged struct {
	dir, version string
}

// Download stages a verified executable beside the current program for a
// same-volume replacement. Failed and canceled downloads remove their staging.
func (c *Client) Download(ctx context.Context, release *Release, target string, progress func(int64)) (*Staged, error) {
	m, err := verifyManifest(release.manifest, release.signature, c.key, release.Version)
	if err != nil {
		return nil, err
	}
	if err := checkExecutable(target); err != nil {
		return nil, err
	}
	dir, err := os.MkdirTemp(filepath.Dir(target), stagePrefix)
	if err != nil {
		return nil, fmt.Errorf("无法在管理器目录准备更新文件：%w", err)
	}
	staged := &Staged{dir: dir, version: m.Version}
	if err := c.download(ctx, m, filepath.Join(dir, packageFile), progress); err != nil {
		staged.Discard()
		return nil, fmt.Errorf("下载新版失败：%w", err)
	}
	for name, data := range map[string][]byte{manifestName: release.manifest, manifestName + ".sig": release.signature} {
		if err := os.WriteFile(filepath.Join(dir, name), data, 0600); err != nil {
			staged.Discard()
			return nil, fmt.Errorf("无法保存已验证的更新清单：%w", err)
		}
	}
	return staged, nil
}

func (s *Staged) Discard() { cleanStage(s.dir) }

func cleanStage(dir string) {
	if storage.CheckPath(dir) != nil {
		return
	}
	for _, name := range []string{helperFile, packageFile, manifestName, manifestName + ".sig", backupFile, readyFile} {
		_ = os.Remove(filepath.Join(dir, name))
	}
	_ = os.Remove(dir)
}

func checkExecutable(path string) error {
	if !filepath.IsAbs(path) || !strings.EqualFold(filepath.Ext(path), ".exe") {
		return errors.New("无法识别当前管理器的位置")
	}
	return storage.CheckPath(path)
}

func checkStage(dir, target string) error {
	if err := checkExecutable(target); err != nil {
		return err
	}
	if !filepath.IsAbs(dir) || filepath.Clean(dir) != dir ||
		!strings.EqualFold(filepath.Dir(dir), filepath.Dir(target)) ||
		!strings.HasPrefix(filepath.Base(dir), stagePrefix) {
		return errors.New("更新目录与管理器位置不匹配")
	}
	return storage.CheckPath(dir)
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	if _, err = io.Copy(out, in); err == nil {
		err = out.Sync()
	}
	err = errors.Join(err, out.Close())
	if err != nil {
		_ = os.Remove(dst)
	}
	return err
}

// Launch starts a copy of the trusted current program with an inherited
// process handle. The caller can then exit without racing a recycled PID.
func (s *Staged) Launch(target string, restartArgs []string) error {
	if err := checkStage(s.dir, target); err != nil {
		return err
	}
	helper := filepath.Join(s.dir, helperFile)
	if err := copyFile(target, helper); err != nil {
		return fmt.Errorf("无法准备临时更新进程：%w", err)
	}
	proc, err := startInherited(helper, ApplyFlag, append([]string{target, s.version}, restartArgs...))
	if err != nil {
		_ = os.Remove(helper)
		return fmt.Errorf("无法启动临时更新进程：%w", err)
	}
	_ = proc.Release()
	return nil
}

func startInherited(exe, mode string, tail []string) (*os.Process, error) {
	handle, err := syscall.OpenProcess(syscall.SYNCHRONIZE, true, uint32(os.Getpid()))
	if err != nil {
		return nil, err
	}
	defer syscall.CloseHandle(handle)
	args := []string{mode, strconv.FormatUint(uint64(handle), 10)}
	cmd := exec.Command(exe, append(args, tail...)...)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: mode == ApplyFlag, AdditionalInheritedHandles: []syscall.Handle{handle}}
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	return cmd.Process, nil
}

func inheritedHandle(raw string) (syscall.Handle, error) {
	n, err := strconv.ParseUint(raw, 10, strconv.IntSize)
	if err != nil || n == 0 {
		return 0, errors.New("更新进程句柄无效")
	}
	return syscall.Handle(n), nil
}

func waitForExit(handle syscall.Handle) error {
	defer syscall.CloseHandle(handle)
	result, err := syscall.WaitForSingleObject(handle, uint32(waitLimit.Milliseconds()))
	if err != nil || result != syscall.WAIT_OBJECT_0 {
		return errors.New("未能确认前一个管理器进程已退出")
	}
	return nil
}

func localFile(dir, name string, max int64) ([]byte, error) {
	path := filepath.Join(dir, name)
	if err := storage.CheckPath(path); err != nil {
		return nil, err
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	return readBounded(f, max)
}

func checkPackage(m manifest, path string) error {
	if err := storage.CheckPath(path); err != nil {
		return err
	}
	info, err := os.Stat(path)
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() || info.Size() != m.Size {
		return errors.New("更新文件大小发生变化")
	}
	hash, err := storage.HashFile(path)
	if err != nil {
		return err
	}
	if hash != m.SHA256 {
		return errors.New("更新文件的 SHA-256 发生变化")
	}
	return nil
}

func lockTarget(target string) (func(), error) {
	// Windows 文件句柄在进程退出后自动释放，无需清理失效的持久锁。
	sum := sha256.Sum256([]byte(strings.ToLower(target)))
	path := filepath.Join(filepath.Dir(target), stagePrefix+hex.EncodeToString(sum[:8])+".lock")
	if err := storage.CheckPath(path); err != nil {
		return nil, err
	}
	name, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return nil, err
	}
	const deleteAccess, deleteOnClose = 0x10000, 0x04000000
	h, err := syscall.CreateFile(name, deleteAccess|syscall.GENERIC_WRITE, 0, nil, syscall.OPEN_ALWAYS, deleteOnClose, 0)
	if err != nil {
		return nil, fmt.Errorf("无法锁定管理器以应用更新：%w", err)
	}
	return func() { _ = syscall.CloseHandle(h) }, nil
}

// Apply runs inside the staged copy. Recheck the signed package and current
// executable after the original process exits, then supervise the first start.
func Apply(publicKey, current string, args []string) error {
	if len(args) < 3 {
		return errors.New("更新进程参数不完整")
	}
	handle, err := inheritedHandle(args[0])
	if err != nil {
		return err
	}
	if err := waitForExit(handle); err != nil {
		return err
	}
	target, next, restartArgs := args[1], args[2], args[3:]
	self, err := os.Executable()
	if err != nil {
		return err
	}
	dir := filepath.Dir(self)
	if !strings.EqualFold(filepath.Base(self), helperFile) {
		return errors.New("更新进程位置无效")
	}
	if err := checkStage(dir, target); err != nil {
		return err
	}
	if slices.Compare(versionParts(next), versionParts(current)) <= 0 || versionParts(current) == nil {
		return errors.New("更新版本必须高于当前版本")
	}
	unlock, err := lockTarget(target)
	if err != nil {
		return err
	}
	defer unlock()
	selfHash, err := storage.HashFile(self)
	if err != nil {
		return err
	}
	oldHash, err := storage.HashFile(target)
	if err != nil || oldHash != selfHash {
		return errors.New("当前管理器在更新前发生变化")
	}
	restartOld := func(cause error) error {
		proc, err := launchVersion(target, dir, current, restartArgs)
		if err != nil {
			return errors.Join(cause, fmt.Errorf("无法重新打开旧版管理器：%w", err))
		}
		_ = proc.Release()
		return cause
	}

	binary := filepath.Join(dir, packageFile)
	if err := verifyStaged(publicKey, next, dir, binary); err != nil {
		return restartOld(err)
	}
	backup := filepath.Join(dir, backupFile)
	if err := copyFile(target, backup); err != nil {
		return restartOld(fmt.Errorf("无法保存旧版：%w", err))
	}
	if before, err := storage.HashFile(backup); err != nil || before != selfHash {
		return errors.New("旧版备份校验失败，未替换管理器")
	}
	if currentHash, err := storage.HashFile(target); err != nil || currentHash != selfHash {
		return errors.New("管理器在准备替换时已发生变化")
	}
	if err := storage.ReplaceFile(binary, target); err != nil {
		return restartOld(fmt.Errorf("无法替换管理器，请关闭其他实例后重试：%w", err))
	}
	proc, err := launchVersion(target, dir, next, restartArgs)
	if err == nil {
		err = awaitStartup(proc, filepath.Join(dir, readyFile), next)
	}
	if err == nil {
		return nil
	}
	if restoreErr := storage.ReplaceFile(backup, target); restoreErr != nil {
		return fmt.Errorf("重新启动失败，自动恢复旧版失败。旧版文件保存在 %s：%w", backup, errors.Join(err, restoreErr))
	}
	_ = os.Remove(filepath.Join(dir, readyFile))
	return restartOld(fmt.Errorf("新版未能完成启动，已恢复旧版：%w", err))
}

func verifyStaged(key, version, dir, binary string) error {
	raw, err := localFile(dir, manifestName, maxManifest)
	if err != nil {
		return fmt.Errorf("无法读取待应用的更新清单：%w", err)
	}
	signature, err := localFile(dir, manifestName+".sig", 64)
	if err != nil {
		return fmt.Errorf("无法读取待应用的更新签名：%w", err)
	}
	m, err := verifyManifest(raw, signature, New(key).key, version)
	if err != nil {
		return err
	}
	return checkPackage(m, binary)
}

func launchVersion(exe, dir, version string, args []string) (*os.Process, error) {
	return startInherited(exe, ReadyFlag, append([]string{dir, version}, args...))
}

func awaitStartup(proc *os.Process, marker, version string) error {
	exited := make(chan error, 1)
	go func() {
		state, err := proc.Wait()
		if err == nil {
			err = fmt.Errorf("程序退出码 %d", state.ExitCode())
		}
		exited <- err
	}()
	tick := time.NewTicker(100 * time.Millisecond)
	defer tick.Stop()
	timeout := time.NewTimer(waitLimit)
	defer timeout.Stop()
	started := func() bool {
		data, err := os.ReadFile(marker)
		return err == nil && string(data) == version
	}
	for {
		select {
		case err := <-exited:
			if started() {
				return nil
			}
			return err
		case <-tick.C:
			if started() {
				return nil
			}
		case <-timeout.C:
			if started() {
				return nil
			}
			if err := proc.Kill(); err != nil && !errors.Is(err, os.ErrProcessDone) {
				return fmt.Errorf("新版启动超时，无法结束更新启动的进程：%w", err)
			}
			<-exited
			return errors.New("新版启动超时")
		}
	}
}

// RelaunchArgs validates the private restart parameters and returns a
// callback to report successful startup, along with the original arguments.
func RelaunchArgs(current string, args []string) ([]string, func() error, error) {
	if len(args) < 3 || args[2] != current {
		return nil, nil, errors.New("重启后的管理器版本与更新清单不一致")
	}
	handle, err := inheritedHandle(args[0])
	if err != nil {
		return nil, nil, err
	}
	target, err := os.Executable()
	if err != nil {
		return nil, nil, err
	}
	dir := args[1]
	if err := checkStage(dir, target); err != nil {
		return nil, nil, err
	}
	return args[3:], func() error {
		if err := storage.Write(filepath.Join(dir, readyFile), []byte(current), false, nil); err != nil {
			return fmt.Errorf("无法确认更新后的启动：%w", err)
		}
		go func() {
			if waitForExit(handle) == nil {
				cleanStage(dir)
			}
		}()
		return nil
	}, nil
}
