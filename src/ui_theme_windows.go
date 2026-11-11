package main

import (
	"github.com/egoist/mygo/ui"
)

// 本文件是管理器界面的设计系统：颜色、字号、间距、圆角和控件状态集中在这里。
// 各页面只组合这些组件，业务行为仍由 window_windows.go 与后端模块负责。

// 字号层级（DIP）。
const (
	textTitle   = 27 // 页面标题
	textGroup   = 15 // 分组标题
	textBody    = 14 // 正文
	textSmall   = 13 // 辅助信息
	textCaption = 12 // 技术细节、时间与提示
)

// 间距梯度（DIP）。
const (
	spaceXS = 4
	spaceS  = 8
	spaceM  = 12
	spaceL  = 16
	spaceXL = 24
)

// 尺寸。
const (
	sidebarWidth        = 208
	controlRadius       = 8
	containerRadius     = 12
	contentMaxWidth     = 760
	contentHeaderHeight = 96
)

// palette 是语义色集合，明暗主题共享同一套命名。
type palette struct {
	background     ui.Color // 内容背景
	sidebar        ui.Color // 侧栏背景
	surface        ui.Color // 控件、浮层与容器表面
	surfaceHover   ui.Color
	surfacePressed ui.Color
	controlTrack   ui.Color // 分段控件轨道
	controlRaised  ui.Color // 分段控件选中项
	border         ui.Color // 细分隔线与描边

	text      ui.Color // 主文字
	textMuted ui.Color // 次要文字

	accent        ui.Color // 品牌靛蓝，仅用于选中、焦点与主按钮
	accentHover   ui.Color
	accentPressed ui.Color
	accentText    ui.Color
	selectionBG   ui.Color // 侧栏选中底
	selectionText ui.Color // 侧栏选中文字
	selectionIcon ui.Color

	success ui.Color
	warning ui.Color
	danger  ui.Color

	shadow ui.Color // 仅浮层与菜单使用
}

func lightPalette() palette {
	return palette{
		background:     ui.Hex("#fafbfc"),
		sidebar:        ui.Hex("#f1f3f6"),
		surface:        ui.Hex("#ffffff"),
		surfaceHover:   ui.Hex("#f2f4f8"),
		surfacePressed: ui.Hex("#e9edf3"),
		controlTrack:   ui.Hex("#edf0f5"),
		controlRaised:  ui.Hex("#ffffff"),
		border:         ui.Hex("#e2e6ed"),

		text:      ui.Hex("#182030"),
		textMuted: ui.Hex("#5c6678"),

		accent:        ui.Hex("#485bd4"),
		accentHover:   ui.Hex("#3d4fc4"),
		accentPressed: ui.Hex("#3447b5"),
		accentText:    ui.Hex("#ffffff"),
		selectionBG:   ui.Hex("#e8ecfc"),
		selectionText: ui.Hex("#3447b5"),
		selectionIcon: ui.Hex("#485bd4"),

		success: ui.Hex("#2f7d5d"),
		warning: ui.Hex("#a5670b"),
		danger:  ui.Hex("#c1352a"),

		shadow: ui.RGBA(24, 32, 48, 0.10),
	}
}

func darkPalette() palette {
	return palette{
		background:     ui.Hex("#151922"),
		sidebar:        ui.Hex("#11151d"),
		surface:        ui.Hex("#1c2330"),
		surfaceHover:   ui.Hex("#232b3a"),
		surfacePressed: ui.Hex("#2a3446"),
		controlTrack:   ui.Hex("#171d28"),
		controlRaised:  ui.Hex("#2a3446"),
		border:         ui.Hex("#303848"),

		text:      ui.Hex("#e8edf6"),
		textMuted: ui.Hex("#a8b2c4"),

		accent:        ui.Hex("#5a6cdd"),
		accentHover:   ui.Hex("#6a7ce8"),
		accentPressed: ui.Hex("#4a5bcb"),
		accentText:    ui.Hex("#ffffff"),
		selectionBG:   ui.Hex("#1f2a45"),
		selectionText: ui.Hex("#afc0f5"),
		selectionIcon: ui.Hex("#8f9ff0"),

		success: ui.Hex("#58b893"),
		warning: ui.Hex("#d5a052"),
		danger:  ui.Hex("#e4766d"),

		shadow: ui.RGBA(0, 0, 0, 0.45),
	}
}

// style 把主题与语义色一起传给视图，避免各处再判断明暗。
type style struct {
	t *ui.Theme
	p palette
}

func (w *window) style() style {
	p := lightPalette()
	if w.dark {
		p = darkPalette()
	}
	return style{t: managerTheme(p, w.dark), p: p}
}

// managerTheme 把语义色映射到 MyGo 主题；Theme 未覆盖的部分沿用原生控件行为。
func managerTheme(p palette, dark bool) *ui.Theme {
	base := ui.LightTheme()
	if dark {
		base = ui.DarkTheme()
	}
	t := *base
	t.Background = p.background
	t.Surface = p.surface
	t.SurfaceHover = p.surfaceHover
	t.SurfacePressed = p.surfacePressed
	t.Border = p.border
	t.Text = p.text
	t.TextMuted = p.textMuted
	t.Accent = p.accent
	t.AccentHover = p.accentHover
	t.AccentPressed = p.accentPressed
	t.AccentText = p.accentText
	// 窗口失焦时不把主按钮和焦点降为灰色，保持“可执行动作”的识别度。
	t.InactiveAccent = p.accent
	t.Danger = p.danger
	t.Warning = p.warning
	t.Success = p.success
	t.Selection = p.accent.Alpha(0.18)
	t.Focus = p.accent.Alpha(0.55)
	t.FocusRingWidth = 2
	t.FocusRingOffset = 1
	t.Scrollbar = p.text.Alpha(0.20)
	t.ScrollbarWidth = 8
	t.Radius = controlRadius
	t.Spacing = 4
	t.FontSize = textBody
	if dark {
		t.Inverse, t.InverseText = ui.Hex("#e8edf6"), ui.Hex("#151922")
	} else {
		t.Inverse, t.InverseText = ui.Hex("#182030"), ui.Hex("#ffffff")
	}
	return &t
}

// ---- 容器与文本 ----

// section 是分组：15 DIP 标题加一个容器，容器只在需要独立边界时使用。
func (s style) section(c *ui.Context, title string, fn func()) {
	ui.Column(c).Gap(spaceS).Children(func() {
		ui.Text(c, title).FontSize(textGroup).FontWeight(600).TextColor(s.p.text)
		fn()
	})
}

// container 是白色表面加细分隔线的容器，只有需要形成边界时才使用。
func (s style) container(c *ui.Context, fn func()) {
	ui.Column(c).Radius(containerRadius).Background(s.p.surface).Border(1, s.p.border).Children(fn)
}

func (s style) hairline(c *ui.Context) {
	ui.Divider(c)
}

func (s style) body(c *ui.Context, text string) {
	ui.Text(c, text).FontSize(textBody).TextColor(s.p.text).Wrap()
}

func (s style) small(c *ui.Context, text string) {
	ui.Text(c, text).FontSize(textSmall).TextColor(s.p.textMuted).Wrap()
}

func (s style) caption(c *ui.Context, text string) {
	ui.Text(c, text).FontSize(textCaption).TextColor(s.p.textMuted).Wrap()
}

// mono 用等宽字体展示哈希、路径与原始诊断，可选中复制。
func (s style) mono(c *ui.Context, text string) {
	ui.Text(c, text).Font("Consolas").FontSize(textCaption).TextColor(s.p.textMuted).Wrap().Selectable()
}

// monoLine 展示无法换行的长路径：单行省略，完整值在悬停提示中查看。
func (s style) monoLine(c *ui.Context, text string) {
	ui.Text(c, text).Font("Consolas").FontSize(textCaption).TextColor(s.p.textMuted).
		SingleLine().Ellipsis("…").Tooltip(text).Selectable()
}

// ---- 行 ----

// fieldRow 是标签与值对齐的一行，标签列宽度固定，便于跨分组对齐。
func (s style) fieldRow(c *ui.Context, label string, fn func()) {
	ui.Row(c).Padding(spaceM, spaceL).Gap(spaceL).AlignItems(ui.Start).Children(func() {
		ui.Text(c, label).FontSize(textSmall).TextColor(s.p.textMuted).Width(104).Shrink(0)
		ui.Column(c).Grow(1).Gap(spaceXS).Children(fn)
	})
}

// listRow 是紧凑列表行，用于备份与操作记录。
func (s style) listRow(c *ui.Context, fn func()) {
	ui.Row(c).Padding(spaceM, spaceL).Gap(spaceM).AlignItems(ui.Start).Children(fn)
}

// ---- 状态 ----

// status 用语义色小圆点加文字表达状态，避免整块彩色胶囊。
func (s style) status(c *ui.Context, label string, tone ui.Color) {
	ui.Row(c).Gap(6).AlignItems(ui.Center).Shrink(0).Children(func() {
		ui.Box(c).Size(6, 6).Radius(3).Background(tone).Shrink(0)
		ui.Text(c, label).FontSize(textSmall).TextColor(tone).SingleLine()
	})
}

// quietStatus 用于成功等无需强调的记录：点保持语义色，文字退回次要色。
func (s style) quietStatus(c *ui.Context, label string, tone ui.Color) {
	ui.Row(c).Gap(6).AlignItems(ui.Center).Shrink(0).Children(func() {
		ui.Box(c).Size(6, 6).Radius(3).Background(tone).Shrink(0)
		ui.Text(c, label).FontSize(textSmall).TextColor(s.p.textMuted).SingleLine()
	})
}

// ---- 按钮 ----

// 按钮高度统一在 36 DIP 左右，禁用时换中性表面并保持标签可读。
func (s style) primaryButton(c *ui.Context, label string, enabled bool) ui.Element {
	b := ui.PrimaryButton(c, label)
	b.Padding(8, 16).Radius(controlRadius).FontSize(textBody).DimDisabled(false)
	if !enabled {
		// 禁用后仍是实底形状，与描边的次按钮区分层级。
		b.Disabled(true).Background(s.p.surfacePressed).Border(0, ui.Transparent).TextColor(s.p.textMuted)
	}
	return b
}

func (s style) secondaryButton(c *ui.Context, label string, enabled bool) ui.Element {
	b := ui.Button(c, label)
	b.Padding(8, 14).Radius(controlRadius).FontSize(textBody).DimDisabled(false)
	if !enabled {
		b.Disabled(true).Background(s.p.background).TextColor(s.p.textMuted).Border(1, s.p.border)
	}
	return b
}

// textButton 是轻量操作：无底无边、中性文字，只在悬停时给一点表面；
// 靛蓝品牌色留给选中态、焦点和主按钮。
func (s style) textButton(c *ui.Context, label string, enabled bool) ui.Element {
	b := ui.ButtonBase(c).Padding(8, 10).Radius(controlRadius).FontSize(textBody).DimDisabled(false)
	b.TextColor(s.p.textMuted)
	if b.Hovered() {
		b.TextColor(s.p.text).Background(s.p.surfaceHover)
	}
	if !enabled {
		b.Disabled(true).TextColor(s.p.textMuted)
	}
	b.Children(func() {
		ui.Text(c, label).SingleLine()
	})
	return b
}

// ---- 侧栏图标：统一 24 视图框、1.6 线宽的线性图标 ----

var (
	iconLocalization = ui.MustParseSVG([]byte(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
<g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
<circle cx="12" cy="12" r="8.6"/>
<path d="M3.6 12h16.8"/>
<path d="M12 3.4c2.4 2.5 3.8 5.4 3.8 8.6s-1.4 6.1-3.8 8.6c-2.4-2.5-3.8-5.4-3.8-8.6s1.4-6.1 3.8-8.6z"/>
</g></svg>`))
	iconBackup = ui.MustParseSVG([]byte(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
<g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
<rect x="3.8" y="4.8" width="16.4" height="4.2" rx="1.3"/>
<path d="M5.6 9v8.8c0 .8.6 1.4 1.4 1.4h10c.8 0 1.4-.6 1.4-1.4V9"/>
<path d="M10.2 13h3.6"/>
</g></svg>`))
	iconHistory = ui.MustParseSVG([]byte(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
<g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
<circle cx="12" cy="12" r="8.6"/>
<path d="M12 7.3V12l3.1 1.9"/>
</g></svg>`))
	iconSettings = ui.MustParseSVG([]byte(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
<g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
<path d="M4 7.6h4.3M13.7 7.6H20M4 16.4h7.3M16.7 16.4H20"/>
<circle cx="11" cy="7.6" r="2"/>
<circle cx="14" cy="16.4" r="2"/>
</g></svg>`))
	iconLicense = ui.MustParseSVG([]byte(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
<g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
<circle cx="12" cy="12" r="8.6"/>
<path d="M12 11.2v5.4"/>
<circle cx="12" cy="8" r=".95" fill="currentColor" stroke="none"/>
</g></svg>`))
)
