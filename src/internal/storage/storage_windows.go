package storage

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"
)

type Location struct{ DataDirectory string }
type Settings struct{ ApplicationDirectory, Theme string }
type Store struct{ Bootstrap, Data string }

func Open(override string) (*Store, error) {
	local := os.Getenv("LOCALAPPDATA")
	if override != "" {
		root, err := filepath.Abs(override)
		if err != nil {
			return nil, err
		}
		boot := root + ".bootstrap"
		data, err := readLocation(boot, root)
		return &Store{boot, data}, err
	}
	if !filepath.IsAbs(local) {
		return nil, errors.New("无法确定 Windows 本地数据目录")
	}
	boot := filepath.Join(local, "AntigravityManager")
	data, err := readLocation(boot, boot)
	return &Store{boot, data}, err
}

func readLocation(boot, fallback string) (string, error) {
	var loc Location
	err := ReadJSON(filepath.Join(boot, "location.json"), &loc)
	if errors.Is(err, fs.ErrNotExist) {
		return fallback, nil
	}
	if err == nil && filepath.IsAbs(loc.DataDirectory) {
		if info, err := os.Stat(loc.DataDirectory); err == nil && info.IsDir() {
			return filepath.Clean(loc.DataDirectory), nil
		}
	}
	return "", errors.New("已配置的数据目录不可用，请恢复目录或检查 location.json")
}

func ReadJSON(path string, dest any) error {
	b, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return json.Unmarshal(b, dest)
}

func (s *Store) Lock() (func(), error) {
	if err := os.MkdirAll(s.Bootstrap, 0700); err != nil {
		return nil, err
	}
	name, err := syscall.UTF16PtrFromString(filepath.Join(s.Bootstrap, ".manager.lock"))
	if err != nil {
		return nil, err
	}
	h, err := syscall.CreateFile(name, syscall.GENERIC_READ|syscall.GENERIC_WRITE, 0, nil, syscall.OPEN_ALWAYS, syscall.FILE_ATTRIBUTE_NORMAL, 0)
	if err != nil {
		return nil, fmt.Errorf("无法锁定数据目录：%w", err)
	}
	close := func() { _ = syscall.CloseHandle(h) }
	data, err := readLocation(s.Bootstrap, s.Data)
	if err != nil || !strings.EqualFold(data, s.Data) {
		close()
		if err != nil {
			return nil, err
		}
		return nil, errors.New("数据目录已被其他管理器切换，请重新打开管理器")
	}
	return close, nil
}

func Exclusive(path string) (func(), error) {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return nil, err
	}
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return nil, fmt.Errorf("无法取得独占操作锁：%w", err)
	}
	return func() { _ = f.Close(); _ = os.Remove(path) }, nil
}

var moveFile = syscall.NewLazyDLL("kernel32.dll").NewProc("MoveFileExW")

func move(from, to string, replace bool) error {
	a, err := syscall.UTF16PtrFromString(from)
	if err != nil {
		return err
	}
	b, err := syscall.UTF16PtrFromString(to)
	if err != nil {
		return err
	}
	flags := uintptr(8) // MOVEFILE_WRITE_THROUGH
	if replace {
		flags |= 1
	}
	result, _, err := moveFile.Call(uintptr(unsafe.Pointer(a)), uintptr(unsafe.Pointer(b)), flags)
	if result == 0 {
		return err
	}
	return nil
}

// Write uses a sibling temp file. before runs immediately before committing.
func Write(path string, data []byte, replace bool, before func() error) error {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	f, err := os.CreateTemp(filepath.Dir(path), ".antigravity-manager-*")
	if err != nil {
		return err
	}
	defer os.Remove(f.Name())
	_, err = f.Write(data)
	if err == nil {
		err = f.Sync()
	}
	if closeErr := f.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	if before != nil {
		if err := before(); err != nil {
			return err
		}
	}
	return move(f.Name(), path, replace)
}

func WriteJSON(path string, v any) error {
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	return Write(path, b, true, nil)
}

func HashFile(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err = io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

func DefaultApp() string {
	if path := os.Getenv("ANTIGRAVITY_APP_DIR"); path != "" {
		return path
	}
	return filepath.Join(os.Getenv("LOCALAPPDATA"), "Programs", "antigravity")
}

func (s *Store) Load() Settings {
	settings := Settings{DefaultApp(), "Light"}
	_ = ReadJSON(filepath.Join(s.Data, "settings.json"), &settings)
	return settings
}

func (s *Store) Save(settings Settings) error {
	close, err := s.Lock()
	if err != nil {
		return err
	}
	defer close()
	return WriteJSON(filepath.Join(s.Data, "settings.json"), settings)
}

func CheckPath(path string) error {
	for {
		p, err := syscall.UTF16PtrFromString(path)
		if err != nil {
			return err
		}
		attr, err := syscall.GetFileAttributes(p)
		if err == nil {
			if attr&syscall.FILE_ATTRIBUTE_REPARSE_POINT != 0 {
				return fmt.Errorf("路径经过链接或重解析点：%s", path)
			}
		} else if !errors.Is(err, fs.ErrNotExist) && err != syscall.ERROR_PATH_NOT_FOUND {
			return err
		}
		next := filepath.Dir(path)
		if next == path {
			return nil
		}
		path = next
	}
}

func contains(parent, child string) bool {
	prefix := strings.TrimRight(strings.ToLower(parent), `\/`) + `\`
	return strings.HasPrefix(strings.ToLower(child), prefix)
}

func (s *Store) Migrate(dest string) error {
	if !filepath.IsAbs(dest) {
		return errors.New("请选择完整的数据目录路径")
	}
	dest = filepath.Clean(dest)
	if strings.EqualFold(s.Data, dest) {
		return nil
	}
	if filepath.Dir(dest) == dest || contains(s.Data, dest) || contains(dest, s.Data) || strings.EqualFold(s.Bootstrap, dest) || contains(dest, s.Bootstrap) {
		return errors.New("请选择独立的数据子目录，新旧目录不能相互包含")
	}
	close, err := s.Lock()
	if err != nil {
		return err
	}
	defer close()
	if err := CheckPath(dest); err != nil {
		return err
	}
	if err := CheckPath(s.Data); err != nil {
		return err
	}
	entries, err := os.ReadDir(dest)
	exists := err == nil
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	if len(entries) > 0 {
		return errors.New("目标目录非空，拒绝覆盖已有数据")
	}
	release, err := Exclusive(filepath.Join(s.Data, "localization.lock"))
	if err != nil {
		return err
	}
	defer release()
	parent := filepath.Dir(dest)
	if err := os.MkdirAll(parent, 0700); err != nil {
		return err
	}
	stage, err := os.MkdirTemp(parent, ".manager-migration-")
	if err != nil {
		return err
	}
	if err := filepath.WalkDir(s.Data, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(s.Data, path)
		if err != nil {
			return err
		}
		if rel == "." {
			return nil
		}
		if strings.EqualFold(path, filepath.Join(s.Data, "localization.lock")) || strings.EqualFold(path, filepath.Join(s.Bootstrap, "location.json")) || strings.EqualFold(path, filepath.Join(s.Bootstrap, ".manager.lock")) {
			return nil
		}
		if err := CheckPath(path); err != nil {
			return err
		}
		out := filepath.Join(stage, rel)
		if d.IsDir() {
			return os.Mkdir(out, 0700)
		}
		return copyVerified(path, out)
	}); err != nil {
		return fmt.Errorf("迁移未完成，原始数据已保留：%w", err)
	}
	if exists {
		if err := syscall.RemoveDirectory(syscall.StringToUTF16Ptr(dest)); err != nil {
			return err
		}
	}
	if err := move(stage, dest, false); err != nil {
		return err
	}
	if err := WriteJSON(filepath.Join(s.Bootstrap, "location.json"), Location{dest}); err != nil {
		return err
	}
	s.Data = dest
	return nil
}

func copyVerified(source, target string) error {
	in, err := os.Open(source)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return err
	}
	h := sha256.New()
	_, err = io.Copy(io.MultiWriter(out, h), in)
	if err == nil {
		err = out.Sync()
	}
	if closeErr := out.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	got, err := HashFile(target)
	if err != nil {
		return err
	}
	if got != hex.EncodeToString(h.Sum(nil)) {
		return fmt.Errorf("迁移副本校验失败：%s", source)
	}
	return nil
}
