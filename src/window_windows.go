package main

import (
	"bytes"
	"errors"
	"fmt"
	"image/png"
	"path/filepath"
	"strings"
	"time"

	"github.com/egoist/mygo"
	"github.com/egoist/mygo/plugins/glass"
	"github.com/egoist/mygo/ui"
	resources "github.com/txysyc/AntigravityManager"
	"github.com/txysyc/AntigravityManager/src/internal/localization"
	"github.com/txysyc/AntigravityManager/src/internal/storage"
)

// 窗口尺寸只影响界面呈现，启动参数与业务行为保持不变。
const (
	windowWidth  = 1040
	windowHeight = 720
)

// pageTransition 是页面切换的转场：进入时略微上移并淡入，离开时只淡出。
var pageTransition = ui.ElementTransition{
	Duration:     180 * time.Millisecond,
	ExitDuration: 120 * time.Millisecond,
	Enter:        &ui.Motion{Y: 8, Opacity: 0},
	Exit:         &ui.Motion{Opacity: 0},
}

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
	// themeSel 是主题分段控件的选中下标，仅用于界面绑定；
	// 保存设置时仍以 dark 为准写入 Theme。
	themeSel int
	icon     ui.ImageSource
}

func runGUI(engine *localization.Manager, settings storage.Settings, smoke string) error {
	w := &window{engine: engine, settings: settings, data: engine.Store.Data, page: "界面汉化", dark: settings.Theme == "Dark", smoke: smoke, version: managerVersion(), supported: strings.Join(engine.Versions(), " / ")}
	if b, err := resources.Files.ReadFile("assets/branding/app-icon.png"); err == nil {
		if icon, err := ui.DecodeImage(b); err == nil {
			w.icon = icon
		}
	}
	var startup error
	mygo.App.WhenReady(func() {
		w.win = mygo.NewWindow(mygo.WindowOptions{Title: "Antigravity Manager", Width: windowWidth, Height: windowHeight, MinWidth: 820, MinHeight: 560, Content: ui.View(w.view)})
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
			if err := png.Encode(&image, ui.Render(w.view, windowWidth, windowHeight, 1)); err != nil {
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
		w.message = "检查完成。"
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
	s := w.style()
	c.SetTheme(s.t)
	ui.Row(c).Fill().Children(func() {
		w.sidebarView(c, s)
		w.contentView(c, s)
	})
}

type navEntry struct {
	page string
	icon *ui.SVG
}

// sidebarView 是左侧导航：品牌在上，下面是按模块分组的条目。
func (w *window) sidebarView(c *ui.Context, s style) {
	ui.Column(c).Width(sidebarWidth).Shrink(0).FillHeight().
		Background(s.p.sidebar).BorderWidth(0, 1, 0, 0).BorderColor(s.p.border).
		Padding(spaceL, spaceM, spaceL, spaceM).Gap(spaceL).Children(func() {
		ui.Row(c).Gap(spaceS).AlignItems(ui.Center).Padding(0, spaceXS, 0, spaceXS).Children(func() {
			if w.icon != nil {
				ui.Image(c, w.icon).Size(26, 26).Shrink(0)
			}
			ui.Column(c).Grow(1).Gap(1).Children(func() {
				ui.Text(c, "Antigravity Manager").FontSize(textBody).FontWeight(600).TextColor(s.p.text).SingleLine()
				ui.Text(c, "管理器 "+w.version).FontSize(textCaption).TextColor(s.p.textMuted).SingleLine()
			})
		})
		ui.Column(c).Gap(spaceL).Children(func() {
			w.navGroup(c, s, "汉化", []navEntry{{"界面汉化", iconLocalization}})
			entries := []navEntry{{"备份", iconBackup}, {"操作记录", iconHistory}, {"设置", iconSettings}}
			if len(notices) >= 1024 {
				entries = append(entries, navEntry{"许可", iconLicense})
			}
			w.navGroup(c, s, "管理器", entries)
		})
	})
}

func (w *window) navGroup(c *ui.Context, s style, title string, entries []navEntry) {
	ui.Column(c).Gap(2).Children(func() {
		ui.Text(c, title).FontSize(textCaption).FontWeight(600).TextColor(s.p.textMuted).
			Padding(0, spaceS, spaceXS, spaceS)
		for _, entry := range entries {
			w.navItem(c, s, entry.icon, entry.page)
		}
	})
}

// navItem 是 36 DIP 高的导航项：选中时浅靛蓝底加靛蓝文字，而不是满宽高饱和色块。
func (w *window) navItem(c *ui.Context, s style, icon *ui.SVG, page string) {
	active := w.page == page
	item := ui.ButtonBase(c).Key(page).Padding(8, 10).Radius(controlRadius).Gap(spaceS).
		Label(page).Disabled(w.busy).DimDisabled(false)
	fg, iconColor, weight := s.p.text, s.p.textMuted, 400
	switch {
	case active:
		item.Background(s.p.selectionBG)
		fg, iconColor, weight = s.p.selectionText, s.p.selectionIcon, 500
	case item.Hovered() && !w.busy:
		item.Background(s.p.surfaceHover)
	}
	if w.busy {
		fg, iconColor = s.p.textMuted, s.p.textMuted
	}
	item.TextColor(fg).FontWeight(weight)
	item.Children(func() {
		ui.Icon(c, icon).FontSize(17).TextColor(iconColor)
		ui.Text(c, page).FontSize(textBody).SingleLine().Grow(1)
	})
	if item.Clicked() {
		if page == "备份" || page == "操作记录" {
			w.lists(page)
		} else {
			w.page = page
		}
	}
}

// contentView 是右侧内容区：悬浮页头、限宽的阅读列和底部状态栏。
func (w *window) contentView(c *ui.Context, s style) {
	ui.Column(c).Grow(1).FillHeight().Children(func() {
		ui.Box(c).Grow(1).FillHeight().Children(func() {
			// 每页独立的滚动容器，切换页面时回到顶部；正文滚过页头时淡出。
			ui.Scroll(c).Key(w.page).Fill().ScrollbarInsets(contentHeaderHeight, 0, 0).Children(func() {
				body := ui.Column(c).Key(w.page).Padding(contentHeaderHeight, spaceXL, spaceXL, spaceXL)
				body.Transition(pageTransition)
				body.Children(func() {
					ui.Column(c).MaxWidth(contentMaxWidth).Gap(spaceXL).Children(func() {
						switch w.page {
						case "设置":
							w.settingsView(c, s)
						case "备份":
							w.backupsView(c, s)
						case "操作记录":
							w.historyView(c, s)
						case "许可":
							w.licenseView(c, s)
						default:
							w.localizationView(c, s)
						}
					})
				})
			})
			ui.Box(c).Absolute().Top(0).Left(0).Right(0).Height(contentHeaderHeight).PassThrough().
				Material(glass.ScrollEdge{})
			ui.Column(c).Absolute().Top(spaceXL + 2).Left(spaceXL).Right(spaceXL).Gap(spaceXS).
				PassThrough().Children(func() {
				ui.Text(c, w.page).FontSize(textTitle).FontWeight(600).TextColor(s.p.text)
				if subtitle := w.subtitle(); subtitle != "" {
					ui.Text(c, subtitle).FontSize(textSmall).TextColor(s.p.textMuted).Wrap()
				}
			})
		})
		w.statusView(c, s)
	})
}

func (w *window) subtitle() string {
	switch w.page {
	case "界面汉化":
		return "支持的 Windows 版本：" + w.supported
	case "备份":
		return "安装或修复前保存的原始文件，可核对完整性。"
	case "操作记录":
		return "最近的操作结果，失败时保留原始诊断。"
	case "设置":
		return "外观、Antigravity 安装目录与数据位置。"
	case "许可":
		return "项目与第三方组件许可原文。"
	}
	return ""
}

func (w *window) statusView(c *ui.Context, s style) {
	ui.Row(c).Padding(spaceM, spaceXL).Gap(spaceS).AlignItems(ui.Center).
		BorderWidth(1, 0, 0, 0).BorderColor(s.p.border).Children(func() {
		if w.busy {
			ui.Spinner(c)
		}
		message := w.message
		if message == "" {
			message = "就绪。"
		}
		ui.Text(c, message).FontSize(textCaption).TextColor(s.p.textMuted).Wrap().Grow(1)
		ui.Text(c, "补丁 "+w.engine.PatchVersion()).FontSize(textCaption).TextColor(s.p.textMuted).Shrink(0)
	})
}

func (w *window) localizationView(c *ui.Context, s style) {
	current := strings.TrimSpace(w.settings.ApplicationDirectory)
	checked := w.hasSnapshot && strings.EqualFold(filepath.Clean(current), w.snapshot.AppDirectory)
	s.section(c, "应用", func() {
		s.container(c, func() {
			s.fieldRow(c, "安装目录", func() {
				if current == "" {
					s.small(c, "尚未选择，请在设置中指定 Antigravity 安装目录。")
					return
				}
				s.monoLine(c, current)
			})
			s.hairline(c)
			s.fieldRow(c, "应用版本", func() {
				switch {
				case !checked:
					s.small(c, "尚未检查")
				case w.snapshot.Version == "":
					s.small(c, "—")
				default:
					ui.Text(c, w.snapshot.Version).FontSize(textBody).TextColor(s.p.text)
				}
			})
			s.hairline(c)
			s.fieldRow(c, "文件指纹", func() {
				fingerprint := w.snapshot.Fingerprint
				if !checked || fingerprint == "" {
					s.small(c, "尚未检查")
					return
				}
				ui.Row(c).Gap(spaceS).AlignItems(ui.Center).Children(func() {
					ui.Text(c, fingerprint).Font("Consolas").FontSize(textCaption).
						TextColor(s.p.textMuted).SingleLine().Ellipsis("…").
						Tooltip(fingerprint).Selectable().Grow(1)
					if s.textButton(c, "复制", true).Clicked() {
						c.WriteClipboard(fingerprint)
						w.message = "已复制文件指纹。"
					}
				})
			})
		})
	})
	s.section(c, "汉化", func() {
		s.container(c, func() {
			s.fieldRow(c, "状态", func() { w.snapshotStatus(c, s, checked) })
			s.hairline(c)
			s.fieldRow(c, "已安装补丁", func() {
				patch := w.snapshot.PatchVersion
				if !checked {
					s.small(c, "尚未检查")
					return
				}
				if patch == "" && w.snapshot.Status == "patched" {
					patch = "历史补丁（版本未知）"
				}
				if patch == "" {
					patch = "—"
				}
				ui.Text(c, patch).FontSize(textBody).TextColor(s.p.text)
			})
			if checked && w.snapshot.CompatibilityIssue != "" {
				s.hairline(c)
				s.fieldRow(c, "兼容性", func() {
					// 状态圆点已表达失败语义，说明文字用正文色，避免重复上色。
					ui.Text(c, w.snapshot.CompatibilityIssue).FontSize(textSmall).TextColor(s.p.text).Wrap()
				})
			}
			s.hairline(c)
			ui.Row(c).Padding(spaceM, spaceL).Gap(spaceS).AlignItems(ui.Center).Children(func() {
				if s.secondaryButton(c, "检查", !w.busy).Clicked() {
					w.check(false)
				}
				if s.textButton(c, "版本比较", !w.busy).Clicked() {
					w.check(true)
				}
				ui.Spacer(c)
				if s.secondaryButton(c, "恢复原版", !w.busy && checked && w.snapshot.CanRestore).Clicked() {
					w.change("restore", "恢复原版")
				}
				if s.primaryButton(c, "安装或修复", !w.busy && checked && w.snapshot.CanInstall).Clicked() {
					w.change("install", "安装汉化")
				}
			})
			s.hairline(c)
			ui.Text(c, "安装或恢复前请完全退出 Antigravity。").
				FontSize(textCaption).TextColor(s.p.textMuted).Wrap().Padding(spaceS, spaceL, spaceM, spaceL)
		})
	})
	if len(w.comparison) > 0 {
		s.section(c, "版本比较", func() {
			s.container(c, func() {
				ui.Text(c, "参考版本 "+w.baseline+"。仅比较资源和锚点，不批准兼容性。").
					FontSize(textCaption).TextColor(s.p.textMuted).Wrap().Padding(spaceM, spaceL)
				for i, row := range w.comparison {
					if i > 0 {
						s.hairline(c)
					}
					s.listRow(c, func() {
						ui.Text(c, row.Path).Font("Consolas").FontSize(textCaption).
							TextColor(s.p.textMuted).Grow(1).Wrap()
						switch row.Status {
						case "相同":
							s.quietStatus(c, row.Status, s.p.success)
						case "缺失":
							s.status(c, row.Status, s.p.danger)
						default:
							s.status(c, row.Status, s.p.warning)
						}
						ui.Text(c, fmt.Sprintf("%d/%d", row.Matched, row.Expected)).
							Font("Consolas").FontSize(textCaption).TextColor(s.p.textMuted).Shrink(0)
					})
				}
			})
		})
	}
}

// snapshotStatus 用语义色圆点表达安装状态，避免重复的彩色胶囊。
func (w *window) snapshotStatus(c *ui.Context, s style, checked bool) {
	if !checked {
		s.small(c, "尚未检查")
		return
	}
	switch w.snapshot.Status {
	case "patched":
		s.status(c, "已安装汉化", s.p.success)
	case "unpatched":
		s.status(c, "未安装汉化", s.p.warning)
	case "unsupported":
		s.status(c, "未适配版本", s.p.danger)
	default:
		s.small(c, w.snapshot.Status)
	}
}

func (w *window) settingsView(c *ui.Context, s style) {
	s.section(c, "外观", func() {
		s.container(c, func() {
			// 分段控件绑定整数下标，主题真值仍是 w.dark；保存设置时据此写入。
			w.themeSel = 0
			if w.dark {
				w.themeSel = 1
			}
			ui.Row(c).Padding(spaceM, spaceL).Gap(spaceL).AlignItems(ui.Center).Children(func() {
				ui.Text(c, "主题").FontSize(textSmall).TextColor(s.p.textMuted).Width(104).Shrink(0)
				seg := ui.SegmentedBase(c, &w.themeSel, 2)
				seg.Track.Padding(2).Radius(controlRadius).Gap(2).
					Background(s.p.controlTrack).Border(1, s.p.border).Disabled(w.busy).DimDisabled(false)
				seg.Track.Children(func() {
					for i, label := range []string{"浅色", "深色"} {
						segment := seg.Segment(i).Padding(5, 16).Radius(6).Disabled(w.busy).DimDisabled(false)
						if i == w.themeSel {
							segment.Background(s.p.controlRaised).TextColor(s.p.text)
						} else {
							segment.TextColor(s.p.textMuted)
							if segment.Hovered() && !w.busy {
								segment.Background(s.p.surfaceHover)
							}
						}
						segment.Children(func() {
							ui.Text(c, label).FontSize(textSmall)
						})
					}
				})
				if seg.Track.Changed() {
					w.dark = w.themeSel == 1
				}
				ui.Spacer(c)
			})
		})
	})
	s.section(c, "Antigravity", func() {
		s.container(c, func() {
			ui.Row(c).Padding(spaceM, spaceL).Gap(spaceS).Children(func() {
				ui.TextInput(c, &w.settings.ApplicationDirectory).Grow(1).Padding(7, 10).
					Radius(controlRadius).Placeholder("选择 Antigravity 安装目录").Disabled(w.busy)
				if s.secondaryButton(c, "浏览…", !w.busy).Clicked() {
					w.browse(false)
				}
			})
			s.hairline(c)
			ui.Row(c).Padding(spaceM, spaceL).Gap(spaceL).AlignItems(ui.Center).Children(func() {
				ui.Text(c, "保存后写入设置文件，主题与应用目录一并生效。").
					FontSize(textCaption).TextColor(s.p.textMuted).Wrap().Grow(1)
				if s.primaryButton(c, "保存设置", !w.busy).Clicked() {
					w.save()
				}
			})
		})
	})
	s.section(c, "数据目录", func() {
		s.container(c, func() {
			s.fieldRow(c, "当前位置", func() { s.monoLine(c, w.data) })
			s.hairline(c)
			ui.Row(c).Padding(spaceM, spaceL).Gap(spaceS).Children(func() {
				ui.TextInput(c, &w.destination).Grow(1).Padding(7, 10).
					Radius(controlRadius).Placeholder("新的空数据目录").Disabled(w.busy)
				if s.secondaryButton(c, "选择", !w.busy).Clicked() {
					w.browse(true)
				}
				if s.secondaryButton(c, "迁移", !w.busy && strings.TrimSpace(w.destination) != "").Clicked() {
					w.migrate()
				}
			})
			s.hairline(c)
			ui.Text(c, "迁移会逐文件复制并校验，完成后保留原目录；目标必须为空目录。").
				FontSize(textCaption).TextColor(s.p.textMuted).Wrap().Padding(spaceS, spaceL, spaceM, spaceL)
		})
	})
}

func (w *window) backupsView(c *ui.Context, s style) {
	s.section(c, "原始备份", func() {
		s.container(c, func() {
			if len(w.backups) == 0 {
				ui.Text(c, "没有备份。").FontSize(textSmall).TextColor(s.p.textMuted).Padding(spaceL, spaceL)
				return
			}
			for i, item := range w.backups {
				if i > 0 {
					s.hairline(c)
				}
				s.listRow(c, func() {
					ui.Column(c).Grow(1).Gap(2).Children(func() {
						ui.Text(c, item.Version).FontSize(textBody).TextColor(s.p.text)
						s.monoLine(c, item.Path)
					})
					if item.Valid {
						s.quietStatus(c, "校验通过", s.p.success)
					} else {
						s.status(c, "校验失败", s.p.danger)
					}
				})
			}
		})
	})
}

func (w *window) historyView(c *ui.Context, s style) {
	s.section(c, "操作记录", func() {
		s.container(c, func() {
			if len(w.history) == 0 {
				ui.Text(c, "没有操作记录。").FontSize(textSmall).TextColor(s.p.textMuted).Padding(spaceL, spaceL)
				return
			}
			for i, item := range w.history {
				if i > 0 {
					s.hairline(c)
				}
				ui.Column(c).Padding(spaceM, spaceL).Gap(spaceXS).Children(func() {
					ui.Row(c).Gap(spaceM).AlignItems(ui.Center).Children(func() {
						ui.Text(c, operationLabel(item.Operation)).FontSize(textBody).FontWeight(500).
							TextColor(s.p.text).Grow(1)
						if item.Result == "失败" {
							s.status(c, item.Result, s.p.danger)
						} else {
							s.quietStatus(c, item.Result, s.p.success)
						}
					})
					message := item.Message
					tone := s.p.textMuted
					if item.Result == "失败" {
						tone = s.p.text
					}
					ui.Text(c, message).FontSize(textSmall).TextColor(tone).Wrap()
					ui.Text(c, compactTime(item.Time)).Font("Consolas").FontSize(textCaption).
						TextColor(s.p.textMuted).SingleLine().Tooltip(item.Time)
				})
			}
		})
	})
}

// operationLabel 把记录里的操作代号转成界面文案，原始代号仍保留在记录文件中。
func operationLabel(operation string) string {
	switch strings.ToLower(operation) {
	case "install":
		return "安装汉化"
	case "restore":
		return "恢复原版"
	case "inspect":
		return "检查"
	case "compare":
		return "版本比较"
	case "backups":
		return "读取备份"
	case "history":
		return "读取操作记录"
	}
	return operation
}

// compactTime 只压缩显示形式；无法解析时原样显示，完整时间在悬停提示里。
func compactTime(raw string) string {
	parsed, err := time.Parse(time.RFC3339, raw)
	if err != nil {
		return raw
	}
	return parsed.Format("2006-01-02 15:04")
}

func (w *window) licenseView(c *ui.Context, s style) {
	s.section(c, "许可原文", func() {
		s.container(c, func() {
			ui.Column(c).Padding(spaceM, spaceL).Children(func() {
				ui.TextArea(c, &notices).ReadOnly(true).Height(380).FontSize(textSmall).
					Background(ui.Transparent).Border(0, ui.Transparent)
			})
		})
	})
}
