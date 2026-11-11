package storage

import (
	"os"
	"path/filepath"
	"testing"
)

func TestMigrationPreservesExistingDataAndExcludesOtherWriters(t *testing.T) {
	base := t.TempDir()
	old := filepath.Join(base, "data")
	dest := filepath.Join(base, "迁移")
	s, err := Open(old)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Save(Settings{`C:\Example\Antigravity`, "Dark"}); err != nil {
		t.Fatal(err)
	}
	other, err := Open(old)
	if err != nil {
		t.Fatal(err)
	}
	release, err := Exclusive(filepath.Join(old, "localization.lock"))
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Migrate(dest); err == nil {
		t.Fatal("持有汉化写锁时仍然迁移")
	}
	release()
	if err := os.Mkdir(dest, 0700); err != nil {
		t.Fatal(err)
	}
	block := filepath.Join(dest, "不覆盖.txt")
	if err := os.WriteFile(block, []byte("keep"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := s.Migrate(dest); err == nil {
		t.Fatal("非空目标被接受")
	}
	if err := os.Remove(block); err != nil {
		t.Fatal(err)
	}
	if err := s.Migrate(dest); err != nil {
		t.Fatal(err)
	}
	if s.Data != dest || s.Load().Theme != "Dark" {
		t.Fatal("迁移后设置丢失")
	}
	if _, err := os.Stat(filepath.Join(old, "settings.json")); err != nil {
		t.Fatal(err)
	}
	if err := other.Save(Settings{"other", "Light"}); err == nil {
		t.Fatal("旧实例仍可写入原目录")
	}
	reopened, err := Open(old)
	if err != nil || reopened.Data != dest {
		t.Fatalf("%+v %v", reopened, err)
	}
}
