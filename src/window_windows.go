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
	"github.com/txysyc/AntigravityManager/src/internal/update"
)

// 窗口尺寸只影响界面呈现，启动参数与业务行为保持不变。
const (
	windowWidth     = 1040
	windowHeight    = 720
	comparisonTitle = "汉化文件诊断"
	licenseTitle    = "许可与声明"
)

// pageTransition 是页面切换的转场：短促上移淡入，无回弹；离开只淡出。
var pageTransition = ui.ElementTransition{
	Duration:     120 * time.Millisecond,
	ExitDuration: 80 * time.Millisecond,
	Enter:        &ui.Motion{Y: 4, Opacity: 0},
	Exit:         &ui.Motion{Opacity: 0},
}

type window struct {
	win                                 *mygo.Window
	engine                              *localization.Manager
	settings                            storage.Settings
	data, destination, page, message    string
	snapshot                            localization.Snapshot
	hasSnapshot, busy, dark             bool
	showComparison, showLicense         bool
	backups                             []localization.Backup
	history                             []localization.Task
	comparison                          []localization.Comparison
	baseline, smoke, version, supported string
	themeSel                            int
	icon                                ui.ImageSource
	helpMenu                            *mygo.MenuItem
	updates                             updatePanel
}

func runGUI(engine *localization.Manager, settings storage.Settings, smoke string, args []string, startupReady func() error) error {
	w := &window{engine: engine, settings: settings, data: engine.Store.Data, page: "界面汉化", dark: settings.Theme == "Dark", smoke: smoke, version: managerVersion(), supported: strings.Join(engine.Versions(), " / ")}
	w.updates = updatePanel{client: update.New(updatePublicKey), args: args, autoCheck: !settings.DisableUpdateCheck}
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
		w.setMenu()
		w.win.OnClose(func(e *mygo.CloseEvent) {
			if w.busy {
				e.PreventDefault()
			} else if !w.closeUpdates() {
				e.PreventDefault()
			}
		})
		if startupReady != nil {
			if startup = startupReady(); startup != nil {
				mygo.App.Quit()
				return
			}
		}
		w.check(false)
		if smoke == "" && startupReady == nil && w.updates.autoCheck && w.updates.client.CanVerify() {
			w.checkUpdates(false)
		}
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
	w.helpMenu.SetEnabled(false)
	w.message = label + "…"
	go func() {
		done := run()
		w.win.Update(func() {
			w.busy = false
			w.helpMenu.SetEnabled(true)
			done()
		})
	}()
}

func (w *window) setMenu() {
	items := []*mygo.MenuItem{{Label: "检查更新", Click: func(_ *mygo.MenuItem, _ *mygo.Window) {
		w.openUpdates()
	}}, {Label: comparisonTitle, Click: func(_ *mygo.MenuItem, _ *mygo.Window) {
		if w.busy {
			return
		}
		w.updates.open = false
		w.showLicense = false
		w.showComparison = true
		w.check(true)
		w.win.Invalidate()
	}}}
	if len(notices) >= 1024 {
		items = append(items, &mygo.MenuItem{Label: licenseTitle, Click: func(_ *mygo.MenuItem, _ *mygo.Window) {
			if w.busy {
				return
			}
			w.updates.open = false
			w.showComparison = false
			w.showLicense = true
			w.win.Invalidate()
		}})
	}
	w.helpMenu = &mygo.MenuItem{Label: "帮助", Submenu: items}
	w.win.SetMenu(mygo.NewMenu([]*mygo.MenuItem{w.helpMenu}))
}

func (w *window) check(compare bool) {
	app := strings.TrimSpace(w.settings.ApplicationDirectory)
	w.hasSnapshot = false
	w.comparison = nil
	label := "正在检查应用"
	if compare {
		label = "正在比较汉化相关文件"
	}
	w.work(label, func() func() {
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
	settings.DisableUpdateCheck = !w.updates.autoCheck
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
			} else {
				w.settings.DisableUpdateCheck = settings.DisableUpdateCheck
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

// compact 由当前内容宽度决定：820 DIP 最小窗口下，并排双卡会挤成窄条，
// 因此侧栏之外不足 700 DIP 时改为单列并收紧页边距与标题字号。
func compactWidth(width float32) bool { return width-sidebarWidth < 700 }

func pagePaddingFor(compact bool) float32 {
	if compact {
		return pagePaddingCompact
	}
	return pagePadding
}

func titleSizeFor(compact bool) float32 {
	if compact {
		return textTitleCompact
	}
	return textTitle
}

func metricSizeFor(compact bool) float32 {
	if compact {
		return textMetricCompact
	}
	return textMetric
}

func (w *window) view(c *ui.Context) {
	s := w.style()
	c.SetTheme(s.t)
	width, height := c.Size()
	compact := compactWidth(width)
	ui.Row(c).Fill().Children(func() {
		w.sidebarView(c, s)
		w.contentView(c, s, compact)
	})
	w.comparisonDialog(c, s, height)
	w.licenseDialog(c, s, height)
	w.updateDialog(c, s)
}

type navEntry struct {
	page string
	icon *ui.SVG
}

// sidebarView 是左侧导航：品牌在上，下面是 48 DIP 胶囊条目。
// 侧栏与内容共用整窗基底，不再画右侧分隔线。
func (w *window) sidebarView(c *ui.Context, s style) {
	ui.Column(c).Width(sidebarWidth).Shrink(0).FillHeight().
		Padding(spaceXL, spaceM, spaceXL, spaceM).Gap(space2XL).Children(func() {
		ui.Row(c).Gap(spaceM).AlignItems(ui.Center).Padding(spaceXS, spaceS).Children(func() {
			if w.icon != nil {
				ui.Image(c, w.icon).Size(30, 30).Shrink(0)
			}
			ui.Column(c).Grow(1).Gap(1).Children(func() {
				// 品牌只留产品名，管理器与版本交给下一行，避免在 212 DIP 侧栏里被截断。
				ui.Text(c, "Antigravity").FontSize(textCard).FontWeight(700).TextColor(s.p.text).SingleLine()
				ui.Text(c, "管理器 "+w.version).FontSize(textCaption).TextColor(s.p.textMuted).SingleLine()
			})
		})
		ui.Column(c).Gap(navItemGap).Children(func() {
			entries := []navEntry{
				{"界面汉化", iconLocalization},
				{"备份", iconBackup},
				{"操作记录", iconHistory},
				{"设置", iconSettings},
			}
			for _, entry := range entries {
				w.navItem(c, s, entry.icon, entry.page)
			}
		})
	})
}

// navItem 是 48 DIP 胶囊导航：选中时用清淡的同色系填充加 1 DIP 细描边，
// 悬浮叠一层品牌色淡底，按压沿用原生按钮反馈，不做满宽高饱和色块。
func (w *window) navItem(c *ui.Context, s style, icon *ui.SVG, page string) {
	active := w.page == page
	item := ui.ButtonBase(c.Key(page)).Height(navItemHeight).Padding(0, spaceL).
		Radius(navItemHeight / 2).Gap(spaceM).Label(page).Disabled(w.busy).DimDisabled(false)
	// 常态预留 1 DIP 描边，选中时只换颜色，避免切换页面时文字位移。
	item.Border(1, ui.Transparent)
	fg, iconColor, weight := s.p.text, s.p.textMuted, 500
	switch {
	case active:
		item.Background(s.p.selectionBG).BorderColor(s.p.accent)
		fg, iconColor, weight = s.p.selectionText, s.p.selectionIcon, 600
		if item.Hovered() && !w.busy {
			item.BorderColor(s.p.accentHover)
		}
	case item.Hovered() && !w.busy:
		item.Background(s.p.hoverTint)
	}
	if w.busy {
		fg, iconColor = s.p.textMuted, s.p.textMuted
	}
	item.TextColor(fg).FontWeight(weight)
	item.Children(func() {
		ui.Icon(c, icon).FontSize(19).TextColor(iconColor)
		ui.Text(c, page).FontSize(textNav).SingleLine().Grow(1)
	})
	if item.Clicked() {
		if page == "备份" || page == "操作记录" {
			w.lists(page)
		} else {
			w.page = page
		}
	}
}

// contentView 是右侧内容区：悬浮页头、限宽的阅读列和底部悬浮托盘。
func (w *window) contentView(c *ui.Context, s style, compact bool) {
	pad := pagePaddingFor(compact)
	headerHeight := float32(contentHeaderHeight)
	if compact {
		headerHeight = compactHeaderHeight
	}
	ui.Column(c).Grow(1).FillHeight().Gap(spaceS).Children(func() {
		ui.Box(c).Grow(1).FillHeight().Children(func() {
			// 每页独立的滚动容器，切换页面时回到顶部；正文滚过页头时淡出。
			ui.Scroll(c.Key(w.page)).Fill().ScrollbarInsets(headerHeight, 0, 0).Children(func() {
				body := ui.Column(c.Key(w.page)).Padding(headerHeight+spaceXS, pad, spaceM, pad)
				body.Transition(pageTransition)
				body.Children(func() {
					ui.Column(c).MaxWidth(contentMaxWidth).Gap(spaceXL).Children(func() {
						w.pageView(c, s, compact)
					})
				})
			})
			// 玻璃只用于页头这一小块，其余区域保持实色。
			ui.Box(c).Absolute().Top(0).Left(0).Right(0).Height(headerHeight).PassThrough().
				Material(glass.ScrollEdge{})
			ui.Column(c).Absolute().Top(spaceL).Left(pad).Right(pad).Gap(2).PassThrough().Children(func() {
				ui.Text(c, w.page).FontSize(titleSizeFor(compact)).FontWeight(700).TextColor(s.p.text)
				if subtitle := w.subtitle(); subtitle != "" {
					ui.Text(c, subtitle).FontSize(textSmall).TextColor(s.p.textMuted).Wrap()
				}
			})
		})
		w.statusTray(c, s, pad)
	})
}

// statusTray 是带外边距的圆角悬浮托盘：与页面对齐，用阴影浮在基底之上。
func (w *window) statusTray(c *ui.Context, s style, pad float32) {
	ui.Box(c).Shrink(0).Padding(0, pad, statusTrayMargin, pad).Children(func() {
		ui.Row(c).Padding(12, spaceL).Gap(spaceS).AlignItems(ui.Center).
			Radius(18).Background(s.p.surface).Border(1, s.p.border).
			Shadow(0, 4, 16, 0, s.p.shadow).Children(func() {
			if w.busy {
				ui.Spinner(c)
			}
			message := w.message
			if message == "" {
				message = "就绪。"
			}
			ui.Text(c, message).FontSize(textSmall).TextColor(s.p.textMuted).Wrap().Grow(1)
			w.updateNotice(c, s)
			ui.Text(c, "补丁 "+w.engine.PatchVersion()).FontSize(textCaption).TextColor(s.p.textMuted).Shrink(0)
		})
	})
}

func (w *window) pageView(c *ui.Context, s style, compact bool) {
	switch w.page {
	case "设置":
		w.settingsView(c, s)
	case "备份":
		w.backupsView(c, s)
	case "操作记录":
		w.historyView(c, s)
	default:
		w.localizationView(c, s, compact)
	}
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
	}
	return ""
}

// ---- 界面汉化 ----

// localizationView 把主页分成并列的两块真实内容：概览与维护操作。
// 概览突出应用版本与兼容状态，操作卡集中呈现日常维护动作。
func (w *window) localizationView(c *ui.Context, s style, compact bool) {
	current := strings.TrimSpace(w.settings.ApplicationDirectory)
	checked := w.hasSnapshot && strings.EqualFold(filepath.Clean(current), w.snapshot.AppDirectory)
	if compact {
		ui.Column(c).Gap(spaceL).Children(func() {
			w.overviewCard(c, s, current, checked, compact)
			w.operationsCard(c, s, checked, compact)
		})
	} else {
		ui.Row(c).Gap(spaceL).AlignItems(ui.Stretch).Children(func() {
			w.overviewCard(c, s, current, checked, compact).Grow(1)
			w.operationsCard(c, s, checked, compact).Grow(1)
		})
	}
}

// overviewCard 是概览卡：版本号最大，其次是兼容状态，最后才是路径与补丁细节。
func (w *window) overviewCard(c *ui.Context, s style, current string, checked, compact bool) ui.Element {
	return s.card(c, func() {
		s.eyebrow(c, "当前应用")
		version := "—"
		if checked && w.snapshot.Version != "" {
			version = w.snapshot.Version
		}
		ui.Row(c).Gap(spaceM).AlignItems(ui.End).Children(func() {
			ui.Text(c, version).FontSize(metricSizeFor(compact)).FontWeight(700).
				TextColor(s.p.text).SingleLine()
			ui.Spacer(c)
			w.snapshotChip(c, s, checked)
		})
		if checked && w.snapshot.CompatibilityIssue != "" {
			ui.Text(c, w.snapshot.CompatibilityIssue).FontSize(textSmall).
				TextColor(s.p.textMuted).Wrap().Padding(spaceS, 0, 0, 0)
		}
		ui.Column(c).Padding(spaceL, 0, 0, 0).Children(func() {
			s.hairline(c)
		})
		ui.Column(c).Padding(spaceM, 0, 0, 0).Gap(spaceM).Children(func() {
			s.detailRow(c, "应用目录", func() {
				if current == "" {
					s.caption(c, "尚未选择，请在设置中指定安装目录。")
					return
				}
				s.monoValue(c, current)
			})
			w.patchDetails(c, s, checked, compact)
			if checked && w.snapshot.Fingerprint != "" {
				s.detailRow(c, "文件指纹", func() {
					ui.Row(c).Gap(spaceS).AlignItems(ui.Center).Children(func() {
						ui.Text(c, w.snapshot.Fingerprint).Font("Consolas").FontSize(textCaption).
							TextColor(s.p.textMuted).SingleLine().Ellipsis("…").
							Tooltip(w.snapshot.Fingerprint).Selectable().Grow(1)
						if s.textButton(c, "复制", true).Clicked() {
							c.WriteClipboard(w.snapshot.Fingerprint)
							w.message = "已复制文件指纹。"
						}
					})
				})
			}
		})
	})
}

func (w *window) patchDetails(c *ui.Context, s style, checked, compact bool) {
	installed := func() {
		s.detailRow(c, "已装补丁", func() {
			if !checked {
				s.caption(c, "尚未检查")
				return
			}
			patch := w.snapshot.PatchVersion
			if patch == "" && w.snapshot.Status == "patched" {
				patch = "历史补丁（版本未知）"
			}
			if patch == "" {
				patch = "—"
			}
			ui.Text(c, patch).FontSize(textSmall).TextColor(s.p.text)
		})
	}
	available := func() {
		s.detailRow(c, "可用补丁", func() {
			ui.Text(c, w.engine.PatchVersion()).FontSize(textSmall).TextColor(s.p.text)
		})
	}
	if compact {
		ui.Row(c).Gap(spaceL).Children(func() {
			ui.Column(c).Grow(1).Children(installed)
			ui.Column(c).Grow(1).Children(available)
		})
		return
	}
	installed()
	available()
}

// snapshotChip 用淡色同系胶囊表达兼容状态，替代旧版整行状态字段。
func (w *window) snapshotChip(c *ui.Context, s style, checked bool) {
	if !checked {
		s.chip(c, "尚未检查", s.p.textMuted)
		return
	}
	switch w.snapshot.Status {
	case "patched":
		s.chip(c, "已安装汉化", s.p.success)
	case "unpatched":
		s.chip(c, "未安装汉化", s.p.warning)
	case "unsupported":
		s.chip(c, "兼容检查未通过", s.p.danger)
	default:
		s.chip(c, w.snapshot.Status, s.p.textMuted)
	}
}

// 写入操作成组排列，宽度不足时把整组移到下一行。
func (w *window) operationsCard(c *ui.Context, s style, checked, compact bool) ui.Element {
	actionPadding := float32(spaceL)
	if compact {
		actionPadding = spaceS
	}
	return s.card(c, func() {
		s.cardTitle(c, "维护操作")
		s.caption(c, "检查会确认当前应用能否安装或恢复汉化。执行安装、修复或恢复前，请完全退出 Antigravity。")
		ui.Spacer(c)
		ui.Row(c).Wrap().Gap(spaceS).Padding(actionPadding, 0, 0, 0).Children(func() {
			if s.secondaryButton(c, "检查兼容性", !w.busy).Shrink(0).Clicked() {
				w.check(false)
			}
			ui.Row(c).Gap(spaceS).Shrink(0).Children(func() {
				if s.secondaryButton(c, "恢复原版", !w.busy && checked && w.snapshot.CanRestore).Clicked() {
					w.change("restore", "恢复原版")
				}
				if s.primaryButton(c, "安装或修复", !w.busy && checked && w.snapshot.CanInstall).Clicked() {
					w.change("install", "安装汉化")
				}
			})
		})
		s.caption(c, w.operationsHint(checked))
	})
}

// operationsHint 用一句话解释按钮当前是否可用，不重复概览卡里的兼容性原文。
func (w *window) operationsHint(checked bool) string {
	switch {
	case !checked:
		return "尚未完成检查，安装与恢复暂不可用。"
	case w.snapshot.CanInstall && w.snapshot.CanRestore:
		return "可以修复已安装的汉化，也可以恢复原版。"
	case w.snapshot.CanInstall:
		return "兼容检查已通过，可以安装汉化。"
	case w.snapshot.CanRestore:
		return "安装暂不可用，可以使用匹配的备份恢复原版。"
	case w.snapshot.Status == "patched":
		return "缺少匹配的完整备份，暂无法修复或恢复。"
	default:
		return "当前应用未通过兼容检查。"
	}
}

func (w *window) comparisonDialog(c *ui.Context, s style, height float32) {
	ui.Modal(c, &w.showComparison, func() {
		s.cardTitle(c, comparisonTitle)
		if w.busy {
			s.caption(c, "正在读取当前应用的汉化相关文件…")
		} else if !w.hasSnapshot {
			s.caption(c, w.message)
		} else {
			ui.Row(c).Gap(spaceXL).Children(func() {
				s.eyebrow(c, "当前应用 "+w.snapshot.Version)
				s.eyebrow(c, "参考原版 "+w.baseline)
			})
			s.caption(c, "每行对照当前安装与参考原版中的同名文件。「内容有变化」表示两份文件的内容不同。")
			if w.snapshot.Status == "patched" {
				s.caption(c, "当前安装已应用汉化补丁。例如，补丁给安装向导加上中文并保留英文，所以向导文件会显示「内容有变化」。")
			}
			s.caption(c, "能否安装或恢复，请看主页的「检查兼容性」。")
			if len(w.comparison) == 0 {
				s.caption(c, "参考原版没有可比较的文件记录。")
			} else {
				w.comparisonRows(c, s, min(282, height-250))
			}
		}
		w.dialogClose(c, s, &w.showComparison)
	}).Label(comparisonTitle).Width(680).Radius(cardRadius).Background(s.p.surface)
}

func (w *window) comparisonRows(c *ui.Context, s style, maxHeight float32) {
	ui.Scroll(c).MaxHeight(maxHeight).Children(func() {
		ui.Column(c).Padding(0, spaceM, 0, 0).Children(func() {
			for _, row := range w.comparison {
				s.hairline(c)
				s.listRow(c, func() {
					s.mono(c, row.Path).Grow(1)
					switch row.Status {
					case "相同":
						s.quietStatus(c, "内容一致", s.p.success)
					case "缺失":
						s.status(c, "文件缺失", s.p.danger)
					default:
						s.quietStatus(c, "内容有变化", s.p.accent)
					}
				})
			}
		})
	})
}

// ---- 设置 ----

// settingsView 把外观做成两张可交互的预览卡，目录编辑与数据迁移各自独立成卡。
func (w *window) settingsView(c *ui.Context, s style) {
	// 设置页用比页面默认更紧的节间距，让默认 720 DIP 窗口一屏放下三块内容。
	ui.Column(c).Gap(spaceL).Children(func() {
		ui.Column(c).Gap(spaceS).Children(func() {
			w.themeSel = 0
			if w.dark {
				w.themeSel = 1
			}
			choices := ui.SegmentedBase(c, &w.themeSel, 2)
			choices.Track.Label("外观").Gap(spaceL).AlignItems(ui.Stretch).Disabled(w.busy).DimDisabled(false)
			choices.Track.Children(func() {
				w.appearanceCard(c, s, choices.Segment(0), false)
				w.appearanceCard(c, s, choices.Segment(1), true)
			})
			if choices.Track.Changed() && !w.busy {
				w.dark = w.themeSel == 1
				c.Invalidate()
			}
			s.caption(c, "选择后立即预览；点击“保存设置”后写入设置文件。")
		})
		w.updateSettings(c, s)
		s.card(c, func() {
			s.cardTitle(c, "Antigravity 安装目录")
			s.caption(c, "保存后主题、更新偏好与应用目录一并写入设置。")
			ui.Row(c).Gap(spaceS).Padding(spaceM, 0, 0, 0).Children(func() {
				ui.TextInput(c, &w.settings.ApplicationDirectory).Grow(1).Padding(8, 12).
					Radius(controlRadius).Background(s.p.surfaceHover).Border(1, s.p.border).
					Placeholder("选择 Antigravity 安装目录").Disabled(w.busy)
				if s.secondaryButton(c, "浏览…", !w.busy).Clicked() {
					w.browse(false)
				}
			})
			ui.Row(c).Padding(spaceS, 0, 0, 0).Children(func() {
				ui.Spacer(c)
				if s.primaryButton(c, "保存设置", !w.busy).Clicked() {
					w.save()
				}
			})
		})
		s.card(c, func() {
			s.cardTitle(c, "数据目录")
			ui.Column(c).Padding(spaceS, 0, 0, 0).Children(func() {
				s.detailRow(c, "当前位置", func() { s.monoValue(c, w.data) })
			})
			ui.Row(c).Gap(spaceS).Padding(spaceM, 0, 0, 0).Children(func() {
				ui.TextInput(c, &w.destination).Grow(1).Padding(8, 12).
					Radius(controlRadius).Background(s.p.surfaceHover).Border(1, s.p.border).
					Placeholder("新的空数据目录").Disabled(w.busy)
				if s.secondaryButton(c, "选择", !w.busy).Clicked() {
					w.browse(true)
				}
				if s.secondaryButton(c, "迁移", !w.busy && strings.TrimSpace(w.destination) != "").Clicked() {
					w.migrate()
				}
			})
			ui.Text(c, "迁移会逐文件复制并校验，完成后保留原目录；目标必须为空目录。").
				FontSize(textCaption).TextColor(s.p.textMuted).Wrap().Padding(spaceS, 0, 0, 0)
		})
	})
}

// appearanceCard 是一张外观预览卡：用原生几何块画出该主题的基底、导航胶囊与卡片，
// 整卡是可聚焦的单选项，点击或用方向键选择后即时预览。
func (w *window) appearanceCard(c *ui.Context, s style, card ui.Element, dark bool) {
	pl := lightPalette()
	label, desc := "浅色", "淡蓝基底 · 白色卡片"
	if dark {
		pl = darkPalette()
		label, desc = "深色", "深蓝基底 · 深色卡片"
	}
	selected := w.dark == dark
	// 预览里的卡片块在深色下需要比表面再亮一档，才能在深蓝基底上看出层级。
	previewCard := pl.surface
	if dark {
		previewCard = pl.surfaceHover
	}
	card.Label(label).Padding(spaceM).Radius(20).
		Background(s.p.surface).Border(1, s.p.border).DimDisabled(false).Grow(1)
	if selected {
		// 1 DIP 细选中描边，与导航胶囊保持一致。
		card.BorderColor(s.p.accent)
	} else if card.Hovered() {
		card.Background(s.p.surfaceHover)
	}
	card.Children(func() {
		ui.Column(c).WidthPercent(100).Children(func() {
			// 预览用绝对定位的原生块绘制：基底、导航胶囊、两张卡片与卡内文字条，
			// 位置固定，窄窗口下只跟着卡片宽度缩放。
			ui.Box(c).Height(96).Radius(previewRadius).Background(pl.background).Children(func() {
				ui.Box(c).Absolute().Top(14).Left(12).Width(44).Height(9).Radius(4.5).
					Background(pl.selectionBG).Border(1, pl.accent)
				ui.Box(c).Absolute().Top(28).Left(12).Width(44).Height(9).Radius(4.5).
					Background(pl.accent.Alpha(0.10))
				ui.Box(c).Absolute().Top(42).Left(12).Width(44).Height(9).Radius(4.5).
					Background(pl.accent.Alpha(0.10))
				ui.Box(c).Absolute().Top(12).Left(66).Right(12).Height(44).Radius(8).
					Background(previewCard).Border(1, pl.border)
				ui.Box(c).Absolute().Top(22).Left(76).Width(64).Height(6).Radius(3).
					Background(pl.controlTrack)
				ui.Box(c).Absolute().Top(33).Left(76).Width(92).Height(6).Radius(3).
					Background(pl.controlTrack)
				ui.Box(c).Absolute().Top(62).Left(66).Right(12).Height(22).Radius(8).
					Background(previewCard).Border(1, pl.border)
			})
			ui.Row(c).Gap(spaceS).AlignItems(ui.Center).Padding(spaceM, 2, 0, 2).Children(func() {
				ui.Text(c, label).FontSize(textCard).FontWeight(600).TextColor(s.p.text)
				ui.Spacer(c)
				// 始终占位，选中与否只换颜色，两张预览卡的高度保持一致。
				dot := ui.Box(c).Size(8, 8).Radius(4).Shrink(0).Background(ui.Transparent)
				if selected {
					dot.Background(s.p.accent)
				}
			})
			ui.Text(c, desc).FontSize(textCaption).TextColor(s.p.textMuted).Padding(2, 2, 0, 2)
		})
	})
}

// ---- 备份与记录 ----

func (w *window) backupsView(c *ui.Context, s style) {
	s.card(c, func() {
		if len(w.backups) == 0 {
			s.empty(c, "没有备份。")
			return
		}
		for i, item := range w.backups {
			if i > 0 {
				s.hairline(c)
			}
			s.listRow(c, func() {
				ui.Column(c).Grow(1).Gap(2).Children(func() {
					ui.Text(c, item.Version).FontSize(textBody).FontWeight(500).TextColor(s.p.text)
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
}

func (w *window) historyView(c *ui.Context, s style) {
	s.card(c, func() {
		if len(w.history) == 0 {
			s.empty(c, "没有操作记录。")
			return
		}
		for i, item := range w.history {
			if i > 0 {
				s.hairline(c)
			}
			ui.Column(c).Padding(rowPaddingY, 0).Gap(spaceXS).Children(func() {
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
		return comparisonTitle
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

func (w *window) licenseDialog(c *ui.Context, s style, height float32) {
	ui.Modal(c, &w.showLicense, func() {
		s.cardTitle(c, licenseTitle)
		s.caption(c, "Antigravity Manager 与所用第三方组件的许可原文。")
		ui.Scroll(c).Label("许可原文").Height(min(420, height-160)).
			Background(s.p.surfaceHover).Border(1, s.p.border).Radius(controlRadius).
			Children(func() {
				ui.Text(c, notices).FontSize(textSmall).TextColor(s.p.text).Padding(spaceM).
					Wrap().Selectable()
			})
		w.dialogClose(c, s, &w.showLicense)
	}).Label(licenseTitle).Width(680).Radius(cardRadius).Background(s.p.surface)
}

func (w *window) dialogClose(c *ui.Context, s style, open *bool) {
	ui.Row(c).Justify(ui.End).Children(func() {
		if s.secondaryButton(c, "关闭", true).AutoFocus().Clicked() {
			*open = false
		}
	})
}
