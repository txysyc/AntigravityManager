package main

import (
	"github.com/egoist/mygo/ui"
)

// 本文件是管理器界面的设计系统：颜色、字号、间距、圆角和控件状态集中在这里。
// 视觉方向是淡蓝皮肤的 Soft UI：整窗共用一块低饱和淡蓝基底，侧栏与内容之间
// 不用直线分隔；导航是 48 DIP 胶囊，选中态用清淡的同色系填充加 1 DIP 细描边；
// 内容是大圆角白卡与宽松留白；底部状态栏是带外边距的悬浮托盘；玻璃只留在页头。
// 各页面只组合这些组件，业务行为仍由 window_windows.go 与后端模块负责。

// 字号层级（DIP）。层级靠字重和留白拉开，不靠堆叠字号。
const (
	textTitle         = 34 // 页面标题
	textTitleCompact  = 29 // 窄窗口的页面标题
	textMetric        = 30 // 概览里的应用版本
	textMetricCompact = 26
	textCard          = 17 // 卡片标题
	textNav           = 14 // 侧栏导航
	textBody          = 14 // 正文
	textSmall         = 13 // 辅助信息
	textCaption       = 12 // 技术细节、时间与提示
)

// 间距梯度（DIP）。卡片内边距与卡片间距比旧版更松，留白本身就是结构。
const (
	spaceXS  = 4
	spaceS   = 8
	spaceM   = 12
	spaceL   = 16
	spaceXL  = 20
	space2XL = 28
)

// 尺寸。
const (
	sidebarWidth        = 212
	navItemHeight       = 48
	navItemGap          = 6
	controlRadius       = 10
	cardRadius          = 22
	previewRadius       = 14
	contentHeaderHeight = 96
	compactHeaderHeight = 84
	contentMaxWidth     = 900
	pagePadding         = 24
	pagePaddingCompact  = 20
	statusTrayMargin    = 14
	// rowPaddingY 是卡片行的上下内边距，令单行行高接近 40 DIP。
	rowPaddingY = 11
)

// palette 是语义色集合，明暗主题共享同一套命名与同一套色相。
// 浅色以淡蓝为整窗基底，卡片用白色；深色沿用蓝色相，只降低明度。
type palette struct {
	background     ui.Color // 整窗基底，侧栏与内容共用
	sidebar        ui.Color // 侧栏底色；与基底相同，仅预览卡需要单独取值
	surface        ui.Color // 卡片、托盘与浮层表面
	surfaceHover   ui.Color
	surfacePressed ui.Color
	controlTrack   ui.Color // 预览卡里代表文字行的小色块
	// secondaryBG 是次按钮常态底色：浅色用淡蓝，深色要比卡片再亮一档，
	// 否则按钮会沉进深色卡片里只剩文字。
	secondaryBG    ui.Color
	secondaryHover ui.Color
	border         ui.Color // 卡片描边与细线

	text      ui.Color // 主文字
	textMuted ui.Color // 次要文字

	accent        ui.Color // 品牌蓝，仅用于选中、焦点与主按钮
	accentHover   ui.Color
	accentPressed ui.Color
	accentText    ui.Color
	selectionBG   ui.Color // 胶囊导航选中底
	selectionText ui.Color // 胶囊导航选中文字
	selectionIcon ui.Color
	// hoverTint 是悬浮提示：品牌色的低透明度叠加，明暗主题都读作同色系加深。
	// 只用于可选中项（导航、外观预览卡），让悬浮预览选中态；普通按钮悬浮仍用
	// 中性表面色（surfaceHover），避免所有控件都跟着品牌色变调。
	hoverTint ui.Color

	success ui.Color
	warning ui.Color
	danger  ui.Color

	shadow ui.Color // 仅悬浮托盘与浮层使用
}

func lightPalette() palette {
	return palette{
		background:     ui.Hex("#e8f3fa"),
		sidebar:        ui.Hex("#e8f3fa"),
		surface:        ui.Hex("#ffffff"),
		surfaceHover:   ui.Hex("#f2f8fc"),
		surfacePressed: ui.Hex("#e4eff7"),
		controlTrack:   ui.Hex("#dcebf6"),
		secondaryBG:    ui.Hex("#dcebf6"),
		secondaryHover: ui.Hex("#cfe4f3"),
		border:         ui.Hex("#d3e6f2"),

		text:      ui.Hex("#152430"),
		textMuted: ui.Hex("#566c7e"),

		accent:        ui.Hex("#2c6c99"),
		accentHover:   ui.Hex("#255c84"),
		accentPressed: ui.Hex("#1f4f71"),
		accentText:    ui.Hex("#ffffff"),
		selectionBG:   ui.Hex("#cde6f6"),
		selectionText: ui.Hex("#17455f"),
		selectionIcon: ui.Hex("#2c6c99"),
		hoverTint:     ui.RGBA(44, 108, 153, 0.10),

		success: ui.Hex("#1d7a5a"),
		warning: ui.Hex("#8a5c0c"),
		danger:  ui.Hex("#b03a2e"),

		shadow: ui.RGBA(20, 48, 70, 0.12),
	}
}

func darkPalette() palette {
	return palette{
		background:     ui.Hex("#0f1820"),
		sidebar:        ui.Hex("#0f1820"),
		surface:        ui.Hex("#17222b"),
		surfaceHover:   ui.Hex("#1e2b36"),
		surfacePressed: ui.Hex("#24323e"),
		controlTrack:   ui.Hex("#131e27"),
		secondaryBG:    ui.Hex("#24323e"),
		secondaryHover: ui.Hex("#2c3d4c"),
		border:         ui.Hex("#26343f"),

		text:      ui.Hex("#e7eff6"),
		textMuted: ui.Hex("#9fb0be"),

		accent:        ui.Hex("#5fa0ce"),
		accentHover:   ui.Hex("#6faed9"),
		accentPressed: ui.Hex("#5492bf"),
		accentText:    ui.Hex("#0f1820"),
		selectionBG:   ui.Hex("#1d3a4e"),
		selectionText: ui.Hex("#cfe6f7"),
		selectionIcon: ui.Hex("#8fc4e4"),
		hoverTint:     ui.RGBA(95, 160, 206, 0.16),

		success: ui.Hex("#5fbf98"),
		warning: ui.Hex("#d8a85a"),
		danger:  ui.Hex("#e8776c"),

		shadow: ui.RGBA(0, 0, 0, 0.50),
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
	t.Selection = p.accent.Alpha(0.16)
	// 焦点环用不透明品牌色：半透明环叠在白卡上只有约 2:1，键盘焦点必须
	// 达到 3:1 的非文本对比度，2 DIP 实色环在两个主题下都满足。
	t.Focus = p.accent
	t.FocusRingWidth = 2
	t.FocusRingOffset = 1
	t.Scrollbar = p.text.Alpha(0.18)
	t.ScrollbarWidth = 8
	t.Radius = controlRadius
	t.Spacing = 4
	t.FontSize = textBody
	if dark {
		t.Inverse, t.InverseText = p.text, p.background
	} else {
		t.Inverse, t.InverseText = p.text, p.surface
	}
	return &t
}

// ---- 卡片与文本 ----

// card 是内容卡：白色大圆角表面、1 DIP 顺色描边和统一的宽松内边距。
// 返回元素，便于调用方决定宽度、是否等高或是否再加底色。
func (s style) card(c *ui.Context, fn func()) ui.Element {
	return ui.Column(c).Radius(cardRadius).Background(s.p.surface).Border(1, s.p.border).
		Padding(spaceXL).Children(fn)
}

// cardTitle 是卡片标题：比正文大一号、字重 600，靠留白与正文分层。
func (s style) cardTitle(c *ui.Context, title string) {
	ui.Text(c, title).FontSize(textCard).FontWeight(600).TextColor(s.p.text).Wrap()
}

// eyebrow 是概览卡里的大字上方的小标签，用弱化色与字重提示层级。
func (s style) eyebrow(c *ui.Context, text string) {
	ui.Text(c, text).FontSize(textCaption).FontWeight(600).TextColor(s.p.textMuted).SingleLine()
}

func (s style) hairline(c *ui.Context) {
	ui.Divider(c)
}

// mono 用等宽字体展示哈希、路径与原始诊断，可选中复制。
func (s style) mono(c *ui.Context, text string) ui.Element {
	return ui.Text(c, text).Font("Consolas").FontSize(textCaption).TextColor(s.p.textMuted).Wrap().Selectable()
}

func (s style) caption(c *ui.Context, text string) {
	ui.Text(c, text).FontSize(textCaption).TextColor(s.p.textMuted).Wrap()
}

// monoLine 展示无法换行的长路径：单行省略，完整值在悬停提示中查看。
func (s style) monoLine(c *ui.Context, text string) {
	ui.Text(c, text).Font("Consolas").FontSize(textCaption).TextColor(s.p.textMuted).
		SingleLine().Ellipsis("…").Tooltip(text).Selectable()
}

// monoValue 是字段里的主路径：仍用等宽字体，但用正文色，与辅助路径区分。
func (s style) monoValue(c *ui.Context, text string) {
	ui.Text(c, text).Font("Consolas").FontSize(textSmall).TextColor(s.p.text).
		SingleLine().Ellipsis("…").Tooltip(text).Selectable()
}

// empty 是卡片内没有数据时的占位行，行高与普通行一致，避免空态比数据态更高。
func (s style) empty(c *ui.Context, text string) {
	ui.Text(c, text).FontSize(textSmall).TextColor(s.p.textMuted).
		Padding(rowPaddingY, 0)
}

// ---- 行 ----

// detailRow 是低层级细节行：小号弱化标签加固定宽度的标签列，便于跨行对齐。
func (s style) detailRow(c *ui.Context, label string, fn func()) {
	ui.Row(c).Gap(spaceM).AlignItems(ui.Start).Children(func() {
		ui.Text(c, label).FontSize(textCaption).TextColor(s.p.textMuted).Width(72).Shrink(0)
		ui.Column(c).Grow(1).Gap(2).Children(fn)
	})
}

// listRow 是卡片内的列表行；水平内边距交给卡片，行只负责上下留白。
func (s style) listRow(c *ui.Context, fn func()) {
	ui.Row(c).Padding(rowPaddingY, 0).Gap(spaceM).AlignItems(ui.Start).Children(fn)
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

// chip 是概览卡里的状态胶囊：淡色同系底加 1 DIP 描边，只在需要强调状态时使用。
func (s style) chip(c *ui.Context, label string, tone ui.Color) {
	ui.Row(c).Padding(4, 10).Gap(6).Radius(12).Shrink(0).
		Background(tone.Alpha(0.10)).Border(1, tone.Alpha(0.28)).
		AlignItems(ui.Center).Children(func() {
		ui.Box(c).Size(6, 6).Radius(3).Background(tone).Shrink(0)
		ui.Text(c, label).FontSize(textCaption).FontWeight(600).TextColor(tone).SingleLine()
	})
}

// ---- 按钮 ----

// 按钮高度统一在 38 DIP 左右，圆角比卡片小一档；禁用时换中性表面并保持标签可读。
func (s style) primaryButton(c *ui.Context, label string, enabled bool) ui.Element {
	b := ui.PrimaryButton(c, label)
	b.Padding(9, 18).Radius(controlRadius).FontSize(textBody).FontWeight(500).DimDisabled(false)
	if !enabled {
		// 禁用后仍是实底形状，与描边的次按钮区分层级。
		b.Disabled(true).Background(s.p.surfacePressed).Border(0, ui.Transparent).TextColor(s.p.textMuted)
	}
	return b
}

// secondaryButton 是淡蓝底次按钮：在白色卡片上可见，但不与主按钮争抢注意力。
// 深色主题下底色比卡片再亮一档，保证按钮轮廓仍然成立。
func (s style) secondaryButton(c *ui.Context, label string, enabled bool) ui.Element {
	b := ui.Button(c, label)
	b.Padding(9, 16).Radius(controlRadius).FontSize(textBody).DimDisabled(false).
		Background(s.p.secondaryBG).Border(0, ui.Transparent)
	if b.Hovered() && enabled {
		b.Background(s.p.secondaryHover)
	}
	if !enabled {
		b.Disabled(true).Background(s.p.surface).Border(1, s.p.border).TextColor(s.p.textMuted)
	}
	return b
}

// textButton 是轻量操作：无底无边、中性文字，只在悬停时给一点表面；
// 品牌色留给选中态、焦点和主按钮。
func (s style) textButton(c *ui.Context, label string, enabled bool) ui.Element {
	b := ui.ButtonBase(c).Padding(6, 8).Radius(controlRadius).FontSize(textSmall).DimDisabled(false)
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
)
