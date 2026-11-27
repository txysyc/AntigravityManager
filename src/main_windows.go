package main

import (
	_ "embed"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"strings"
	"syscall"
	"unsafe"

	resources "github.com/txysyc/AntigravityManager"
	"github.com/txysyc/AntigravityManager/src/internal/localization"
	"github.com/txysyc/AntigravityManager/src/internal/storage"
	"github.com/txysyc/AntigravityManager/src/internal/update"
)

//go:embed notices.txt
var notices string

// The release build embeds only the public key.
var updatePublicKey string

func main() {
	args := os.Args[1:]
	var startupReady func() error
	if len(args) > 0 {
		switch args[0] {
		case update.ApplyFlag:
			if err := update.Apply(updatePublicKey, managerVersion(), args[1:]); err != nil {
				errorBox("管理器更新失败", err.Error())
				os.Exit(1)
			}
			return
		case update.ReadyFlag:
			var err error
			args, startupReady, err = update.RelaunchArgs(managerVersion(), args[1:])
			if err != nil {
				// 更新进程会处理重启失败，避免在失败的子进程里阻塞回退。
				os.Exit(1)
			}
		}
	}
	var opt struct{ data, app, operation, smoke string }
	flag.StringVar(&opt.data, "data-dir", "", "隔离数据目录")
	flag.StringVar(&opt.app, "app-dir", "", "Antigravity 安装目录")
	flag.StringVar(&opt.operation, "operation", "", "执行一项操作并输出 JSON")
	flag.StringVar(&opt.smoke, "smoke-output", "", "隔离启动检查结果文件")
	_ = flag.CommandLine.Parse(args)
	if opt.operation == "notices" {
		fmt.Println(notices)
		return
	}
	err := func() error {
		if opt.smoke != "" && opt.data == "" {
			return fmt.Errorf("启动验证必须指定隔离的 --data-dir")
		}
		store, err := storage.Open(opt.data)
		if err != nil {
			return err
		}
		engine, err := localization.New(store)
		if err != nil {
			return err
		}
		settings := store.Load()
		if opt.app != "" {
			settings.ApplicationDirectory = opt.app
		}
		if opt.operation != "" {
			return runOperation(engine, settings.ApplicationDirectory, opt.operation)
		}
		return runGUI(engine, settings, opt.smoke, args, startupReady)
	}()
	if err != nil {
		if opt.smoke != "" {
			_ = storage.WriteJSON(opt.smoke, map[string]any{"success": false, "error": err.Error()})
		}
		if opt.operation != "" {
			_ = json.NewEncoder(os.Stdout).Encode(map[string]any{"success": false, "message": err.Error()})
		} else if opt.smoke == "" && startupReady == nil {
			startupError(err)
		}
		os.Exit(1)
	}
}

func startupError(err error) {
	errorBox("Antigravity Manager", "无法启动管理器\n\n"+err.Error())
}

func errorBox(caption, message string) {
	text, _ := syscall.UTF16PtrFromString(message)
	title, _ := syscall.UTF16PtrFromString(caption)
	box := syscall.NewLazyDLL("user32.dll").NewProc("MessageBoxW")
	box.Call(0, uintptr(unsafe.Pointer(text)), uintptr(unsafe.Pointer(title)), 0x10)
}

func managerVersion() string {
	var v struct{ Version string }
	b, _ := resources.Files.ReadFile("package.json")
	_ = json.Unmarshal(b, &v)
	return v.Version
}

func runOperation(engine *localization.Manager, app, operation string) error {
	var value any
	var err error
	switch strings.ToLower(operation) {
	case "inspect":
		value, err = engine.Inspect(app)
	case "compare":
		s, b, rows, e := engine.Compare(app)
		value, err = map[string]any{"snapshot": s, "baseline": b, "modules": rows}, e
	case "install", "restore":
		value, err = engine.Change(strings.ToLower(operation), app)
	case "backups":
		value, err = engine.Backups()
	case "history":
		value, err = engine.History()
	default:
		return fmt.Errorf("未知操作：%s", operation)
	}
	if err != nil {
		return err
	}
	return json.NewEncoder(os.Stdout).Encode(map[string]any{"success": true, "result": value})
}
