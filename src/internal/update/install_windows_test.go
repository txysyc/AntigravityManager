package update

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/txysyc/AntigravityManager/src/internal/storage"
)

const (
	fixtureOld  = "1.2.0"
	fixtureNew  = "1.3.0"
	fixtureTail = "verified-update-test-new-build"
	fixtureRun  = "--test-start-update"
)

func TestMain(m *testing.M) {
	if len(os.Args) > 1 {
		if run, err := runFixture(os.Args[1:]); run {
			if err != nil {
				_, _ = fmt.Fprintln(os.Stderr, err)
				os.Exit(1)
			}
			os.Exit(0)
		}
	}
	os.Exit(m.Run())
}

func runFixture(args []string) (bool, error) {
	switch args[0] {
	case ApplyFlag:
		err := Apply(os.Getenv("AM_UPDATE_TEST_PUBLIC"), fixtureOld, args[1:])
		if err != nil {
			_ = os.WriteFile(os.Getenv("AM_UPDATE_TEST_ERROR"), []byte(err.Error()), 0600)
		}
		return true, err
	case fixtureRun:
		target, err := os.Executable()
		if err != nil {
			return true, err
		}
		return true, (&Staged{dir: args[1], version: fixtureNew}).Launch(target, args[2:])
	case ReadyFlag:
		return true, fixtureReady(args[1:])
	default:
		return false, nil
	}
}

func fixtureReady(args []string) error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	data, err := os.ReadFile(exe)
	if err != nil {
		return err
	}
	version := fixtureOld
	if bytes.HasSuffix(data, []byte(fixtureTail)) {
		version = fixtureNew
		if os.Getenv("AM_UPDATE_TEST_CRASH") == "1" {
			return fmt.Errorf("模拟新版启动失败")
		}
	}
	appArgs, started, err := RelaunchArgs(version, args)
	if err != nil {
		return err
	}
	if len(appArgs) != 2 || appArgs[1] != "argument with spaces 中文" {
		return fmt.Errorf("重启参数丢失：%q", appArgs)
	}
	if err := started(); err != nil {
		return err
	}
	dir := args[1]
	for range 100 {
		if _, err := os.Stat(dir); os.IsNotExist(err) {
			return os.WriteFile(appArgs[0], []byte(version), 0600)
		}
		time.Sleep(40 * time.Millisecond)
	}
	return fmt.Errorf("更新临时目录未清理：%s", dir)
}

func TestWindowsUpdateRelaunchAndRollback(t *testing.T) {
	self, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	old, err := os.ReadFile(self)
	if err != nil {
		t.Fatal(err)
	}
	newBinary := append(bytes.Clone(old), fixtureTail...)
	pub, key, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	publicKey := hex.EncodeToString(pub)
	for _, tc := range []struct {
		name, crash, expected string
		tamper                bool
	}{
		{"更新后重启", "0", fixtureNew, false},
		{"启动故障回退", "1", fixtureOld, false},
		{"拒绝已变化的暂存文件", "0", fixtureOld, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			dir := t.TempDir()
			target := filepath.Join(dir, "Manager 应用.exe")
			if err := os.WriteFile(target, old, 0700); err != nil {
				t.Fatal(err)
			}
			before, err := storage.HashFile(target)
			if err != nil {
				t.Fatal(err)
			}
			release, meta := signedFixture(t, key, fixtureNew, newBinary)
			client := New(publicKey)
			client.http.Transport = fixtureHTTP{downloadURL(meta.Version, meta.File): newBinary}
			s, err := client.Download(t.Context(), release, target, nil)
			if err != nil {
				t.Fatal(err)
			}
			if tc.tamper {
				if err := os.WriteFile(filepath.Join(s.dir, packageFile), []byte("tampered"), 0600); err != nil {
					t.Fatal(err)
				}
			}
			result := filepath.Join(dir, "restarted")
			errorLog := filepath.Join(dir, "apply-error")
			ctx, cancel := context.WithTimeout(t.Context(), 15*time.Second)
			defer cancel()
			cmd := exec.CommandContext(ctx, target, fixtureRun, s.dir, result, "argument with spaces 中文")
			cmd.Env = append(os.Environ(), "AM_UPDATE_TEST_PUBLIC="+publicKey, "AM_UPDATE_TEST_CRASH="+tc.crash, "AM_UPDATE_TEST_ERROR="+errorLog)
			if output, err := cmd.CombinedOutput(); err != nil {
				t.Fatalf("cannot start update: %v %s", err, output)
			}
			for ctx.Err() == nil {
				got, err := os.ReadFile(result)
				if err == nil && len(got) > 0 {
					if string(got) != tc.expected {
						t.Fatalf("started version: %q, want %q", got, tc.expected)
					}
					want := meta.SHA256
					if tc.expected == fixtureOld {
						want = before
					}
					if hash, err := storage.HashFile(target); err != nil || hash != want {
						t.Fatalf("installed executable: %s %v", hash, err)
					}
					return
				}
				time.Sleep(40 * time.Millisecond)
			}
			detail, _ := os.ReadFile(errorLog)
			t.Fatalf("manager did not restart and clean up: %s", detail)
		})
	}
}
