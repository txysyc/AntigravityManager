package main

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/egoist/mygo"
	"github.com/egoist/mygo/ui"
	"github.com/txysyc/AntigravityManager/src/internal/update"
)

type updatePanel struct {
	client                      *update.Client
	args                        []string
	available                   *update.Release
	staged                      *update.Staged
	cancel                      context.CancelFunc
	failure                     string
	downloaded                  int64
	open, checking, autoCheck   bool
	notified, quitAfterDownload bool
}

func (w *window) openUpdates() {
	if w.busy {
		return
	}
	u := &w.updates
	w.showComparison, w.showLicense = false, false
	u.open = true
	if u.available == nil && u.cancel == nil {
		w.checkUpdates(true)
	}
	w.win.Invalidate()
}

func (w *window) checkUpdates(manual bool) {
	u := &w.updates
	if u.checking {
		return
	}
	u.checking, u.failure = true, ""
	client, version := u.client, w.version
	go func() {
		release, err := client.Check(context.Background(), version)
		w.win.Update(func() {
			u.checking, u.available = false, release
			if err != nil {
				u.failure = err.Error()
			}
			u.notified = release != nil && (manual || u.open || release.CanDownload())
		})
	}()
	w.win.Invalidate()
}

func (w *window) downloadUpdate() {
	u := &w.updates
	target, err := os.Executable()
	if err != nil {
		u.failure = "无法定位管理器：" + err.Error()
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	u.cancel, u.downloaded, u.failure = cancel, 0, ""
	client, release := u.client, u.available
	go func() {
		defer cancel()
		staged, err := client.Download(ctx, release, target, func(n int64) {
			w.win.Update(func() { u.downloaded = n })
		})
		canceled := ctx.Err() == context.Canceled
		w.win.Update(func() {
			u.cancel, u.staged = nil, staged
			switch {
			case err != nil && canceled:
				u.failure = "已取消下载。"
			case err != nil:
				u.failure = err.Error()
			}
			if u.quitAfterDownload {
				mygo.App.Quit()
			}
		})
	}()
}

func (w *window) restartForUpdate() {
	u := &w.updates
	staged, args := u.staged, u.args
	w.work("正在准备重启", func() func() {
		target, err := os.Executable()
		if err == nil {
			err = staged.Launch(target, args)
		}
		return func() {
			if err != nil {
				u.failure = "无法应用更新：" + err.Error()
				w.message = "未能开始更新。"
				return
			}
			u.staged = nil
			mygo.App.Quit()
		}
	})
}

func (w *window) closeUpdates() bool {
	u := &w.updates
	if u.cancel != nil {
		u.quitAfterDownload = true
		u.cancel()
		return false
	}
	if u.staged != nil {
		u.staged.Discard()
	}
	return true
}

func (w *window) updateSettings(c *ui.Context, s style) {
	s.card(c, func() {
		s.cardTitle(c, "软件更新")
		ui.Checkbox(c, &w.updates.autoCheck, "启动时自动检查更新").Disabled(w.busy)
		s.caption(c, "保存设置后在下次启动时生效。")
	})
}

func (w *window) updateNotice(c *ui.Context, s style) {
	if u := &w.updates; u.notified && u.available != nil {
		if s.textButton(c, "可更新到 "+u.available.Version, !w.busy).Shrink(0).Clicked() {
			w.openUpdates()
		}
	}
}

func (w *window) updateDialog(c *ui.Context, s style) {
	u := &w.updates
	ui.Modal(c, &u.open, func() {
		s.cardTitle(c, "软件更新")
		s.caption(c, "当前版本 "+w.version)
		switch {
		case u.checking:
			ui.Row(c).AlignItems(ui.Center).Gap(spaceS).Children(func() {
				ui.Spinner(c)
				s.caption(c, "正在检查 GitHub 正式版…")
			})
		case u.available == nil && u.failure == "":
			s.caption(c, "已是最新版本。")
		case u.available != nil:
			w.updateDetails(c, s)
		}
		if u.failure != "" {
			s.caption(c, u.failure)
		}
		w.updateActions(c, s)
	}).Label("软件更新").Width(540).Radius(cardRadius).Background(s.p.surface)
}

func (w *window) updateDetails(c *ui.Context, s style) {
	u := &w.updates
	release := u.available
	s.cardTitle(c, "新版本 "+release.Version)
	if release.ManualReason != "" {
		s.caption(c, release.ManualReason)
	}
	if notes := strings.TrimSpace(release.Notes); notes != "" {
		ui.Scroll(c).MaxHeight(148).Children(func() {
			ui.Text(c, notes).FontSize(textSmall).TextColor(s.p.text).Wrap().Selectable()
		})
	}
	switch {
	case w.busy && u.staged != nil:
		s.caption(c, "等待管理器完成当前操作…")
	case u.cancel != nil:
		progress := min(1, float64(u.downloaded)/float64(release.Size))
		ui.Progress(c, progress).Label("下载进度")
		s.caption(c, fmt.Sprintf("正在下载 · %.0f%%", progress*100))
	case u.staged != nil:
		s.caption(c, "下载和校验已完成，可重启应用更新。")
	case release.CanDownload():
		s.caption(c, fmt.Sprintf("下载大小 %.1f MB", float64(release.Size)/(1024*1024)))
	}
}

func (w *window) updateActions(c *ui.Context, s style) {
	u := &w.updates
	ui.Row(c).Wrap().Gap(spaceS).Justify(ui.End).Children(func() {
		if u.cancel != nil {
			if s.secondaryButton(c, "取消下载", true).Clicked() {
				u.cancel()
			}
			return
		}
		page := update.ReleasePage
		if u.available != nil {
			page = u.available.Page
		}
		if !u.checking && s.textButton(c, "打开发布页", true).Clicked() {
			c.OpenURL(page)
		}
		label := "关闭"
		if u.available != nil {
			label = "稍后"
		}
		if s.secondaryButton(c, label, !w.busy).Clicked() {
			u.open = false
		}
		switch {
		case u.staged != nil:
			if s.primaryButton(c, "重启并更新", !w.busy).Clicked() {
				w.restartForUpdate()
			}
		case u.available != nil && u.available.CanDownload():
			if s.primaryButton(c, "下载更新", !w.busy).Clicked() {
				w.downloadUpdate()
			}
		case !u.checking && u.failure != "":
			if s.secondaryButton(c, "重新检查", !w.busy).Clicked() {
				w.checkUpdates(true)
			}
		}
	})
}
