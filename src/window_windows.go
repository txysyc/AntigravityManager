package main

import (
	"bytes"
	"errors"
	"fmt"
	"image/png"
	"path/filepath"
	"strings"

	"github.com/egoist/mygo"
	"github.com/egoist/mygo/ui"
	resources "github.com/txysyc/AntigravityManager"
	"github.com/txysyc/AntigravityManager/src/internal/localization"
	"github.com/txysyc/AntigravityManager/src/internal/storage"
)

type window struct {
	win                                 *mygo.Window
	engine                              *localization.Manager
	settings                            storage.Settings
	data, destination, page, message    string
	snapshot                            localization.Snapshot
	hasSnapshot, busy, dark             bool
	backups                             []localization.Backup
	history                             []localization.Task
	comparison                          []localization.Comparison
	baseline, smoke, version, supported string
}

func runGUI(engine *localization.Manager, settings storage.Settings, smoke string) error {
	w := &window{engine: engine, settings: settings, data: engine.Store.Data, page: "界面汉化", dark: settings.Theme == "Dark", smoke: smoke, version: managerVersion(), supported: strings.Join(engine.Versions(), " / ")}
	var startup error
	mygo.App.WhenReady(func() {
		w.win = mygo.NewWindow(mygo.WindowOptions{Title: "Antigravity Manager", Width: 920, Height: 650, MinWidth: 790, MinHeight: 500, Content: ui.View(w.view)})
		if w.win == nil {
			startup = fmt.Errorf("无法创建原生窗口")
			mygo.App.Quit()
			return
		}
		if icon, err := resources.Files.ReadFile("assets/branding/app-icon.png"); err == nil {
			_ = w.win.SetIcon(icon)
		}
		w.win.OnClose(func(e *mygo.CloseEvent) {
			if w.busy {
				e.PreventDefault()
			}
		})
		w.check(false)
	})
	if err := mygo.App.Run(); err != nil {
		return err
	}
	return startup
}

func (w *window) work(label string, run func() func()) {
	if w.busy {
		return
	}
	w.busy = true
	w.message = label + "…"
	go func() {
		done := run()
		w.win.Update(func() { w.busy = false; done() })
	}()
}

func (w *window) check(compare bool) {
	app := strings.TrimSpace(w.settings.ApplicationDirectory)
	w.hasSnapshot = false
	w.comparison = nil
	w.work("正在检查应用", func() func() {
		var s localization.Snapshot
		var err error
		var baseline string
		var rows []localization.Comparison
		if compare {
			s, baseline, rows, err = w.engine.Compare(app)
		} else {
			s, err = w.engine.Inspect(app)
		}
		return func() {
			w.showSnapshot(s, err)
			w.baseline, w.comparison = baseline, rows
			if w.smoke != "" {
				visible := w.win.NativeHandle() != 0 && w.win.IsVisible()
				err = errors.Join(err, w.renderSmoke())
				if err == nil && !visible {
					err = errors.New("未创建可见的原生窗口")
				}
				value := map[string]any{"success": err == nil, "nativeWindow": visible, "snapshot": s, "message": w.message}
				if err != nil {
					value["error"] = err.Error()
				}
				_ = storage.WriteJSON(w.smoke, value)
				mygo.App.Quit()
			}
		}
	})
}

func (w *window) renderSmoke() error {
	before, page := w.dark, w.page
	defer func() { w.dark, w.page = before, page }()
	for _, dark := range []bool{false, true} {
		w.dark = dark
		theme := "light"
		if dark {
			theme = "dark"
		}
		for _, item := range []struct{ page, filename string }{{"界面汉化", "localization"}, {"设置", "settings"}} {
			w.page = item.page
			var image bytes.Buffer
			if err := png.Encode(&image, ui.Render(w.view, 920, 650, 1)); err != nil {
				return err
			}
			if err := storage.Write(filepath.Join(filepath.Dir(w.smoke), item.filename+"-"+theme+".png"), image.Bytes(), true, nil); err != nil {
				return err
			}
		}
	}
	return nil
}

func (w *window) showSnapshot(s localization.Snapshot, err error) {
	w.snapshot = s
	w.hasSnapshot = err == nil
	switch {
	case err != nil:
		w.message = err.Error()
	case s.CompatibilityIssue != "":
		w.message = s.CompatibilityIssue
	case s.Status == "patched":
		w.message = "已安装汉化补丁。"
	default:
		w.message = "原版文件已通过兼容检查，可以安装汉化。"
	}
}

func (w *window) change(op, label string) {
	app := strings.TrimSpace(w.settings.ApplicationDirectory)
	w.work(label, func() func() {
		answer, err := mygo.Dialog.Message(mygo.MessageOptions{Parent: w.win, Type: mygo.MessageQuestion, Title: label, Message: label + "？", Detail: "请先完全退出 Antigravity。目标目录：\n" + app, Buttons: []string{"取消", "继续"}})
		if err != nil {
			return func() { w.message = "无法打开确认窗口：" + err.Error() }
		}
		if answer.Button != 1 {
			return func() { w.message = "操作已取消。" }
		}
		s, err := w.engine.Change(op, app)
		return func() {
			w.comparison = nil
			w.showSnapshot(s, err)
			if err == nil && s.CompatibilityIssue == "" {
				w.message = label + "完成。"
			}
		}
	})
}

func (w *window) browse(migrate bool) {
	path := w.settings.ApplicationDirectory
	title := "选择 Antigravity 安装目录"
	if migrate {
		path = w.data
		title = "选择新的数据目录"
	}
	w.work(title, func() func() {
		list, err := mygo.Dialog.Open(mygo.OpenDialogOptions{Parent: w.win, Title: title, DefaultPath: path, Directory: true, CreateDirectories: migrate})
		return func() {
			if err != nil {
				w.message = "无法选择目录：" + err.Error()
				return
			}
			if len(list) == 0 {
				w.message = "未更改目录。"
				return
			}
			if migrate {
				w.destination = list[0]
				w.message = "已选中目标，确认后开始迁移。"
				return
			}
			w.settings.ApplicationDirectory = list[0]
			w.check(false)
		}
	})
}

func (w *window) lists(page string) {
	w.page = page
	w.work("正在读取"+page, func() func() {
		if page == "备份" {
			items, err := w.engine.Backups()
			return func() {
				w.backups = items
				w.message = "原始备份已检查。"
				if err != nil {
					w.message = err.Error()
				}
			}
		}
		items, err := w.engine.History()
		return func() {
			w.history = items
			w.message = "操作记录已读取。"
			if err != nil {
				w.message = err.Error()
			}
		}
	})
}

func (w *window) save() {
	settings := w.settings
	settings.ApplicationDirectory = strings.TrimSpace(settings.ApplicationDirectory)
	settings.Theme = "Light"
	if w.dark {
		settings.Theme = "Dark"
	}
	w.work("正在保存设置", func() func() {
		var err error
		if !filepath.IsAbs(settings.ApplicationDirectory) {
			err = fmt.Errorf("请选择完整的 Antigravity 安装目录")
		} else {
			err = w.engine.Store.Save(settings)
		}
		return func() {
			w.message = "设置已保存。"
			if err != nil {
				w.message = err.Error()
			}
		}
	})
}

func (w *window) migrate() {
	path := strings.TrimSpace(w.destination)
	w.work("正在迁移数据", func() func() {
		err := w.engine.Store.Migrate(path)
		data := w.engine.Store.Data
		return func() {
			if err != nil {
				w.message = err.Error()
				return
			}
			w.data, w.destination = data, ""
			w.message = "迁移完成，原目录已保留。"
		}
	})
}

func (w *window) view(c *ui.Context) {
	theme := ui.LightTheme()
	if w.dark {
		theme = ui.DarkTheme()
	}
	c.SetTheme(theme)
	ui.Column(c).Fill().Padding(24).Gap(16).Background(theme.Background).Children(func() {
		ui.Column(c).Gap(5).Children(func() {
			ui.Text(c, "Antigravity Manager").FontSize(29).Bold()
			ui.Text(c, "Windows 维护工具   /   管理器 "+w.version+"   /   汉化补丁 "+w.engine.PatchVersion()).TextColor(theme.TextMuted)
		})
		ui.Row(c).Gap(8).Children(func() {
			for _, page := range []string{"界面汉化", "备份", "操作记录", "设置", "许可"} {
				if page == "许可" && len(notices) < 1024 {
					continue
				}
				b := ui.Button
				if page == w.page {
					b = ui.PrimaryButton
				}
				if b(c, page).Disabled(w.busy).Clicked() {
					if page == "备份" || page == "操作记录" {
						w.lists(page)
					} else {
						w.page = page
					}
				}
			}
		})
		ui.Scroll(c).Grow(1).Children(func() {
			ui.Column(c).Gap(12).Padding(12).Children(func() {
				switch w.page {
				case "设置":
					w.settingsView(c)
				case "备份":
					ui.Text(c, "原始备份").FontSize(22).Bold()
					if len(w.backups) == 0 {
						ui.Text(c, "没有备份。")
					}
					for _, item := range w.backups {
						state := "校验失败"
						if item.Valid {
							state = "校验通过"
						}
						ui.Text(c, item.Version+"  ·  "+state).Bold()
						ui.Text(c, item.Path).Wrap()
					}
				case "操作记录":
					ui.Text(c, "操作记录").FontSize(22).Bold()
					if len(w.history) == 0 {
						ui.Text(c, "没有操作记录。")
					}
					for _, item := range w.history {
						ui.Text(c, item.Time+"  "+item.Operation+"  "+item.Result+"  "+item.Message).Wrap()
					}
				case "许可":
					ui.Text(c, "项目与第三方许可").FontSize(22).Bold()
					ui.TextArea(c, &notices).ReadOnly(true).Height(310)
				default:
					w.localizationView(c)
				}
			})
		})
		ui.Text(c, w.message).Wrap().TextColor(theme.TextMuted)
	})
}

func (w *window) localizationView(c *ui.Context) {
	ui.Text(c, "界面汉化").FontSize(22).Bold()
	ui.Text(c, "支持 Windows 版本："+w.supported)
	ui.Text(c, "应用目录："+w.settings.ApplicationDirectory).Wrap()
	current := strings.TrimSpace(w.settings.ApplicationDirectory)
	checked := w.hasSnapshot && strings.EqualFold(filepath.Clean(current), w.snapshot.AppDirectory)
	if checked {
		state := map[string]string{"unsupported": "未适配", "unpatched": "未安装汉化", "patched": "已安装汉化"}[w.snapshot.Status]
		patch := w.snapshot.PatchVersion
		if patch == "" && w.snapshot.Status == "patched" {
			patch = "历史补丁（版本未知）"
		}
		if patch == "" {
			patch = "—"
		}
		ui.Text(c, "应用 "+w.snapshot.Version+"   /   "+state+"   /   已安装补丁 "+patch).Bold()
		ui.Text(c, "SHA-256  "+w.snapshot.Fingerprint).Wrap()
	}
	ui.Row(c).Gap(8).Children(func() {
		if ui.Button(c, "检查").Disabled(w.busy).Clicked() {
			w.check(false)
		}
		if ui.Button(c, "版本比较").Disabled(w.busy).Clicked() {
			w.check(true)
		}
		if ui.PrimaryButton(c, "安装或修复").Disabled(w.busy || !checked || !w.snapshot.CanInstall).Clicked() {
			w.change("install", "安装汉化")
		}
		if ui.Button(c, "恢复原版").Disabled(w.busy || !checked || !w.snapshot.CanRestore).Clicked() {
			w.change("restore", "恢复原版")
		}
	})
	if len(w.comparison) > 0 {
		ui.Text(c, "参考版本 "+w.baseline+"。仅比较资源和锚点，不批准兼容性。").Wrap()
		for _, r := range w.comparison {
			ui.Text(c, fmt.Sprintf("%s  %s  %d/%d", r.Path, r.Status, r.Matched, r.Expected)).Wrap()
		}
	}
}

func (w *window) settingsView(c *ui.Context) {
	ui.Text(c, "设置").FontSize(22).Bold()
	ui.Text(c, "Antigravity 安装目录")
	ui.Row(c).Gap(8).Children(func() {
		ui.TextInput(c, &w.settings.ApplicationDirectory).Grow(1).MinWidth(420).Disabled(w.busy)
		if ui.Button(c, "浏览").Disabled(w.busy).Clicked() {
			w.browse(false)
		}
	})
	ui.Checkbox(c, &w.dark, "深色主题").Disabled(w.busy)
	if ui.Button(c, "保存设置").Disabled(w.busy).Clicked() {
		w.save()
	}
	ui.Text(c, "数据目录").FontSize(18).Bold()
	ui.Text(c, w.data).Wrap()
	ui.Row(c).Gap(8).Children(func() {
		ui.TextInput(c, &w.destination).Grow(1).MinWidth(420).Placeholder("新的空数据目录").Disabled(w.busy)
		if ui.Button(c, "选择").Disabled(w.busy).Clicked() {
			w.browse(true)
		}
		if ui.Button(c, "迁移").Disabled(w.busy || strings.TrimSpace(w.destination) == "").Clicked() {
			w.migrate()
		}
	})
}
