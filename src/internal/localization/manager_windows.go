package localization

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"syscall"
	"time"
	"unsafe"

	"github.com/txysyc/AntigravityManager/src/internal/storage"
)

type Manager struct {
	Store    *storage.Store
	profiles []Profile
	payload  payload
	locale   []byte
}

type Snapshot struct {
	AppDirectory, Version, Fingerprint, Status, PatchVersion, CompatibilityIssue string
	CanInstall, CanRestore                                                       bool
}
type Installed struct {
	AppDirectory   string `json:"appDirectory"`
	OriginalSHA256 string `json:"originalSha256"`
	PatchedSHA256  string `json:"patchedSha256"`
	PatchVersion   string `json:"patchVersion"`
}
type Backup struct {
	Version, Path string
	Valid         bool
}
type Task struct{ Time, Operation, Result, Message string }
type Comparison struct {
	Path, Status      string
	Matched, Expected int
}

func New(s *storage.Store) (*Manager, error) {
	profiles, p, locale, err := loadAssets()
	return &Manager{s, profiles, p, locale}, err
}
func (m *Manager) PatchVersion() string { return m.payload.PatchVersion }
func (m *Manager) Versions() []string {
	out := make([]string, len(m.profiles))
	for i, p := range m.profiles {
		out[i] = p.Version
	}
	return out
}
func (m *Manager) backup(p Profile) string {
	return filepath.Join(m.Store.Data, "backups", "localization", p.Version, p.OriginalSHA256, "app.asar")
}
func (m *Manager) record() string {
	return filepath.Join(m.Store.Data, "localization", "installed.json")
}
func appFile(app string) string { return filepath.Join(app, "resources", "app.asar") }
func languageFile(app string) string {
	return filepath.Join(app, "resources", "bin", "language_server.exe")
}
func matches(path, expected string) bool {
	got, err := storage.HashFile(path)
	return err == nil && got == expected
}
func (m *Manager) original(target string, p Profile) string {
	for _, name := range []string{m.backup(p), target + ".zh-CN-original"} {
		if matches(name, p.OriginalSHA256) {
			return name
		}
	}
	return ""
}
func (m *Manager) inspect(app string) (Snapshot, *Profile, *archive, error) {
	s := Snapshot{Status: "unsupported"}
	if !filepath.IsAbs(app) {
		return s, nil, nil, errors.New("请选择完整的 Antigravity 安装目录")
	}
	s.AppDirectory = filepath.Clean(app)
	b, err := os.ReadFile(appFile(app))
	if err != nil {
		return s, nil, nil, fmt.Errorf("无法读取应用资源：%w", err)
	}
	a, err := readASAR(b)
	if err != nil {
		return s, nil, nil, fmt.Errorf("无法识别应用资源：%w", err)
	}
	s.Version, err = identity(a)
	if err != nil {
		return s, nil, a, err
	}
	s.Fingerprint = digest(b)
	var saved Installed
	_ = storage.ReadJSON(m.record(), &saved)
	for i := range m.profiles {
		p := &m.profiles[i]
		if p.Version != s.Version {
			continue
		}
		h := s.Fingerprint
		local := h == saved.PatchedSHA256 && saved.OriginalSHA256 == p.OriginalSHA256 && strings.EqualFold(saved.AppDirectory, s.AppDirectory)
		original := h == p.OriginalSHA256
		knownVersion, known := p.PatchedVersions[h]
		if h == p.PatchedSHA256 {
			known = true
			if knownVersion == "" {
				knownVersion = p.PatchVersion
			}
		}
		for _, accepted := range p.AcceptedPatchedSHA256 {
			if h == accepted {
				known = true
				break
			}
		}
		if !original && !known && !local {
			continue
		}
		server := p.LanguageServerSHA256 == "" || matches(languageFile(app), p.LanguageServerSHA256)
		if !server {
			s.CompatibilityIssue = "语言服务文件与已验证版本不匹配，安装已禁用。已知汉化文件仍可使用匹配的原始备份恢复。"
		}
		if original {
			if server {
				s.Status = "unpatched"
				s.CanInstall = true
			}
		} else {
			s.Status = "patched"
			s.CanRestore = m.original(appFile(app), *p) != ""
			s.CanInstall = server && s.CanRestore
			s.PatchVersion = knownVersion
			if s.PatchVersion == "" && local {
				s.PatchVersion = saved.PatchVersion
			}
		}
		return s, p, a, nil
	}
	s.CompatibilityIssue = "应用版本或文件指纹尚未验证，已禁用安装与恢复。"
	return s, nil, a, nil
}

func (m *Manager) Inspect(app string) (Snapshot, error) {
	s, _, _, err := m.inspect(app)
	return s, err
}

func (m *Manager) Compare(app string) (Snapshot, string, []Comparison, error) {
	s, p, a, err := m.inspect(app)
	if err != nil {
		return s, "", nil, err
	}
	if p == nil {
		p = &m.profiles[len(m.profiles)-1]
		for i := range m.profiles {
			if m.profiles[i].Version == s.Version {
				p = &m.profiles[i]
				break
			}
		}
	}
	var out []Comparison
	for file, expected := range p.BaselineModules {
		row := Comparison{Path: file, Status: "缺失", Expected: len(m.payload.NativeManifest[file])}
		if entry := a.files[file]; entry != nil {
			row.Status = "不同"
			if digest(entry.data) == expected {
				row.Status = "相同"
			}
			_, counts := applyRules(string(entry.data), m.payload.NativeManifest[file])
			for _, rule := range p.NativeChanges {
				if rule.Path == file && counts[rule.From] == rule.Count && rule.Count > 0 {
					row.Matched++
				}
			}
		}
		out = append(out, row)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Path < out[j].Path })
	return s, p.Version, out, nil
}

func (m *Manager) Backups() ([]Backup, error) {
	root := filepath.Join(m.Store.Data, "backups", "localization")
	paths, err := filepath.Glob(filepath.Join(root, "*", "*", "app.asar"))
	if err != nil {
		return nil, err
	}
	var out []Backup
	for _, path := range paths {
		hash := filepath.Base(filepath.Dir(path))
		version := filepath.Base(filepath.Dir(filepath.Dir(path)))
		if versionPattern.MatchString(version) && hashPattern.MatchString(hash) {
			out = append(out, Backup{version, path, matches(path, hash)})
		}
	}
	return out, nil
}

func (m *Manager) History() ([]Task, error) {
	var tasks []Task
	err := storage.ReadJSON(filepath.Join(m.Store.Data, "localization", "tasks.json"), &tasks)
	if errors.Is(err, fs.ErrNotExist) {
		err = storage.ReadJSON(filepath.Join(m.Store.Data, "tasks.json"), &tasks)
	}
	if errors.Is(err, fs.ErrNotExist) {
		err = nil
	}
	return tasks, err
}

func (m *Manager) Change(operation, app string) (result Snapshot, err error) {
	if operation != "install" && operation != "restore" {
		return result, errors.New("不支持的汉化操作")
	}
	if !filepath.IsAbs(app) {
		return result, errors.New("请选择完整的 Antigravity 安装目录")
	}
	app = filepath.Clean(app)
	close, err := m.Store.Lock()
	if err != nil {
		return result, err
	}
	defer close()
	release, err := storage.Exclusive(filepath.Join(m.Store.Data, "localization.lock"))
	if err != nil {
		return result, err
	}
	defer release()
	tasks, historyErr := m.History()
	if historyErr != nil {
		return result, fmt.Errorf("无法读取操作记录：%w", historyErr)
	}
	defer func() {
		entry := Task{time.Now().Format(time.RFC3339), operation, "成功", "操作完成"}
		if err != nil {
			entry.Result = "失败"
			entry.Message = err.Error()
		}
		tasks = append([]Task{entry}, tasks...)
		if writeErr := storage.WriteJSON(filepath.Join(m.Store.Data, "localization", "tasks.json"), tasks); writeErr != nil {
			err = errors.Join(err, fmt.Errorf("无法保存操作记录：%w", writeErr))
		}
	}()
	return m.change(operation, app, assertStopped)
}

func (m *Manager) change(operation, app string, checkStopped func(string) error) (Snapshot, error) {
	target := appFile(app)
	if err := storage.CheckPath(target); err != nil {
		return Snapshot{}, err
	}
	if err := checkStopped(app); err != nil {
		return Snapshot{}, err
	}
	s, p, _, err := m.inspect(app)
	if err != nil {
		return s, err
	}
	if p == nil || (operation == "install" && !s.CanInstall) || (operation == "restore" && !s.CanRestore) {
		return s, errors.New("未满足写入条件，请检查版本、文件指纹或原始备份")
	}
	var output []byte
	if operation == "restore" {
		output, err = os.ReadFile(m.original(target, *p))
		if err != nil || digest(output) != p.OriginalSHA256 {
			return s, errors.New("原始备份校验失败，已停止恢复")
		}
	} else {
		backup := m.backup(*p)
		if err := storage.CheckPath(backup); err != nil {
			return s, err
		}
		if _, err := os.Stat(backup); err == nil {
			if !matches(backup, p.OriginalSHA256) {
				return s, errors.New("原始备份校验失败，拒绝覆盖")
			}
		} else if errors.Is(err, fs.ErrNotExist) {
			source := target
			if s.Status == "patched" {
				source = m.original(target, *p)
			}
			original, err := os.ReadFile(source)
			if err != nil || digest(original) != p.OriginalSHA256 {
				return s, errors.New("无法取得当前版本的原始文件")
			}
			if err := storage.Write(backup, original, false, nil); err != nil {
				return s, err
			}
		} else {
			return s, err
		}
		original, err := os.ReadFile(backup)
		if err != nil {
			return s, err
		}
		output, err = build(original, *p, m.payload, m.locale)
		if err != nil {
			return s, err
		}
		if digest(output) == s.Fingerprint {
			return s, nil
		}
	}
	// Serialize writers even when two instances use different data directories.
	release, err := storage.Exclusive(target + ".zh-manager-new")
	if err != nil {
		return s, err
	}
	defer release()
	err = storage.Write(target, output, true, func() error {
		if err := checkStopped(app); err != nil {
			return err
		}
		if operation == "install" && p.LanguageServerSHA256 != "" && !matches(languageFile(app), p.LanguageServerSHA256) {
			return errors.New("语言服务文件在操作期间发生变化，已停止替换")
		}
		if !matches(target, s.Fingerprint) {
			return errors.New("应用文件在操作期间发生变化，已停止替换")
		}
		if operation == "install" {
			return storage.WriteJSON(m.record(), Installed{app, p.OriginalSHA256, digest(output), m.PatchVersion()})
		}
		return nil
	})
	if err != nil {
		return s, err
	}
	return m.Inspect(app)
}

var queryProcessPath = syscall.NewLazyDLL("kernel32.dll").NewProc("QueryFullProcessImageNameW")

func assertStopped(app string) error {
	h, err := syscall.CreateToolhelp32Snapshot(syscall.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return fmt.Errorf("无法检查 Antigravity 进程：%w", err)
	}
	defer syscall.CloseHandle(h)
	var entry syscall.ProcessEntry32
	entry.Size = uint32(unsafe.Sizeof(entry))
	for err = syscall.Process32First(h, &entry); err == nil; err = syscall.Process32Next(h, &entry) {
		if !strings.EqualFold(syscall.UTF16ToString(entry.ExeFile[:]), "Antigravity.exe") {
			continue
		}
		process, err := syscall.OpenProcess(0x1000, false, entry.ProcessID)
		if err != nil {
			return fmt.Errorf("无法确认 Antigravity 已退出：%w", err)
		}
		buf := make([]uint16, 32768)
		n := uint32(len(buf))
		ok, _, queryErr := queryProcessPath.Call(uintptr(process), 0, uintptr(unsafe.Pointer(&buf[0])), uintptr(unsafe.Pointer(&n)))
		_ = syscall.CloseHandle(process)
		if ok == 0 {
			return fmt.Errorf("无法确认 Antigravity 进程路径：%w", queryErr)
		}
		if strings.EqualFold(filepath.Dir(syscall.UTF16ToString(buf[:n])), app) {
			return errors.New("请完全退出 Antigravity 后再安装或恢复")
		}
	}
	if err != syscall.ERROR_NO_MORE_FILES {
		return fmt.Errorf("无法检查 Antigravity 进程：%w", err)
	}
	return nil
}
