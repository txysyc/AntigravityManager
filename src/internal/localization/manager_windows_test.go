package localization

import (
	"bytes"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/txysyc/AntigravityManager/src/internal/storage"
)

func synthetic(t *testing.T) (*Manager, string, []byte) {
	t.Helper()
	base := t.TempDir()
	app := filepath.Join(base, "隔离应用")
	makeMember := func(name, source string) *member {
		data := []byte(source)
		return &member{key: name, packed: true, data: data, meta: object{
			{"size", jsonBytes(len(data))}, {"offset", jsonBytes("0")}, {"integrity", jsonBytes(checksums(data, 4))},
		}}
	}
	a := archive{root: object{}, tree: []*member{
		makeMember("package.json", `{"name":"antigravity","version":"2.99.0"}`),
		{key: "dist", meta: object{}, dir: []*member{makeMember("main.js", `console.log("File");`), makeMember("preload.js", `"use strict";`)}},
		{key: "outside", meta: object{{"size", jsonBytes(11)}, {"unpacked", jsonBytes(true)}}},
	}}
	input := a.write()
	if err := storage.Write(appFile(app), input, false, nil); err != nil {
		t.Fatal(err)
	}
	if err := storage.Write(languageFile(app), []byte("synthetic language service"), false, nil); err != nil {
		t.Fatal(err)
	}
	s, err := storage.Open(filepath.Join(base, "data"))
	if err != nil {
		t.Fatal(err)
	}
	m := &Manager{s, []Profile{{Version: "2.99.0", OriginalSHA256: digest(input), LanguageServerSHA256: digest([]byte("synthetic language service"))}}, payload{
		PatchVersion: "0.2.0", NativeManifest: map[string][]rule{"dist/main.js": {{`"File"`, `"文件"`}}}, Preload: "\n// renderer hook\n",
	}, []byte("// locale module\n")}
	return m, app, input
}

func TestInstallRepeatRestore(t *testing.T) {
	m, app, input := synthetic(t)
	first, err := m.Change("install", app)
	if err != nil || first.Status != "patched" || first.PatchVersion != "0.2.0" || !first.CanRestore {
		t.Fatalf("%+v %v", first, err)
	}
	patched, err := os.ReadFile(appFile(app))
	if err != nil {
		t.Fatal(err)
	}
	a, err := readASAR(patched)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(a.files["dist/main.js"].data), `console.log("文件");`) || !strings.Contains(string(a.files["dist/main.js"].data), `console.log("File");`) || !strings.Contains(string(a.files["dist/preload.js"].data), "renderer hook") || a.files["dist/locale.cjs"] == nil {
		t.Fatal("缺少双语分支或注入资源")
	}
	if second, err := m.Change("install", app); err != nil || second.Fingerprint != first.Fingerprint {
		t.Fatalf("%+v %v", second, err)
	}
	if err := os.WriteFile(languageFile(app), []byte("updated"), 0600); err != nil {
		t.Fatal(err)
	}
	s, err := m.Inspect(app)
	if err != nil || s.CanInstall || !s.CanRestore {
		t.Fatalf("%+v %v", s, err)
	}
	restored, err := m.Change("restore", app)
	if err != nil || restored.Fingerprint != digest(input) {
		t.Fatalf("%+v %v", restored, err)
	}
	tasks, err := m.History()
	if err != nil || len(tasks) != 3 || tasks[0].Operation != "restore" {
		t.Fatalf("%+v %v", tasks, err)
	}
}

func TestMutationGuards(t *testing.T) {
	t.Run("未知指纹", func(t *testing.T) {
		m, app, input := synthetic(t)
		input = append(input, 0)
		if err := os.WriteFile(appFile(app), input, 0600); err != nil {
			t.Fatal(err)
		}
		if _, err := m.Change("install", app); err == nil {
			t.Fatal("允许写入未知指纹")
		}
		b, _ := os.ReadFile(appFile(app))
		if !bytes.Equal(b, input) {
			t.Fatal("未知指纹被修改")
		}
	})
	t.Run("损坏备份", func(t *testing.T) {
		m, app, input := synthetic(t)
		bad := []byte("damaged")
		if err := storage.Write(m.backup(m.profiles[0]), bad, false, nil); err != nil {
			t.Fatal(err)
		}
		if _, err := m.Change("install", app); err == nil {
			t.Fatal("允许覆盖损坏备份")
		}
		b, _ := os.ReadFile(appFile(app))
		back, _ := os.ReadFile(m.backup(m.profiles[0]))
		if !bytes.Equal(b, input) || !bytes.Equal(back, bad) {
			t.Fatal("损坏备份或原文件被覆盖")
		}
	})
	t.Run("并发更新", func(t *testing.T) {
		m, app, input := synthetic(t)
		updated := append(bytes.Clone(input), 0)
		calls := 0
		_, err := m.change("install", app, func(string) error {
			calls++
			if calls == 2 {
				return os.WriteFile(appFile(app), updated, 0600)
			}
			return nil
		})
		if err == nil || !strings.Contains(err.Error(), "操作期间发生变化") {
			t.Fatalf("%v", err)
		}
		b, _ := os.ReadFile(appFile(app))
		if !bytes.Equal(b, updated) {
			t.Fatal("并发更新被覆盖")
		}
	})
}

func TestASARWriterMatchesNode(t *testing.T) {
	_, app, input := synthetic(t)
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("需要 Node.js 对照旧引擎")
	}
	js := `const fs=require('node:fs');const a=require('./engines/localization/src/asar.cjs');process.stdout.write(a.writeAsar(a.readAsar(fs.readFileSync(process.argv[1]))));`
	cmd := exec.Command(node, "-e", js, appFile(app))
	cmd.Dir = filepath.Join("..", "..", "..")
	want, err := cmd.Output()
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(want, input) {
		t.Fatal("Go 归档输出与 Node 归档输出不同")
	}
}

func TestVerifiedFixtures(t *testing.T) {
	root := os.Getenv("ANTIGRAVITY_FIXTURES_DIRECTORY")
	if root == "" {
		t.Skip("未提供已验证的第三方原始资源")
	}
	profiles, assets, locale, err := loadAssets()
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range profiles {
		t.Run(p.Version, func(t *testing.T) {
			versionRoot := filepath.Join(root, p.Version)
			source, err := os.ReadFile(filepath.Join(versionRoot, "app.asar"))
			if err != nil {
				t.Fatal(err)
			}
			got, err := build(source, p, assets, locale)
			if err != nil {
				t.Fatal(err)
			}
			app := t.TempDir()
			if err := storage.Write(appFile(app), source, false, nil); err != nil {
				t.Fatal(err)
			}
			if p.LanguageServerSHA256 != "" {
				server, err := os.ReadFile(filepath.Join(versionRoot, "language_server.exe"))
				if err != nil {
					t.Fatal(err)
				}
				if err := storage.Write(languageFile(app), server, false, nil); err != nil {
					t.Fatal(err)
				}
			}
			output := filepath.Join(t.TempDir(), "reference")
			js := `require('./engines/localization/scripts/build.cjs').buildPatch({appDir:process.argv[1],outputDirectory:process.argv[2]});`
			cmd := exec.Command("node", "-e", js, app, output)
			cmd.Dir = filepath.Join("..", "..", "..")
			if log, err := cmd.CombinedOutput(); err != nil {
				t.Fatalf("Node 对照构建失败：%v\n%s", err, log)
			}
			legacy, err := os.ReadFile(filepath.Join(output, "app.asar"))
			if err != nil {
				t.Fatal(err)
			}
			if !bytes.Equal(got, legacy) {
				t.Fatalf("Go %s 与 Node %s 不一致", digest(got), digest(legacy))
			}
		})
	}
}
