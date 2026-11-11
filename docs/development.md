# 开发指南

[项目首页](../README.md) · [测试与验证](testing.md) · [项目规范](../spec/README.md)

## 启动与打包

开发需要 Windows x64、Go 1.27.3 或更新版本、PowerShell 7 和 Node.js 24。Go 编译桌面程序；Node.js 用于检查和维护内置汉化资源。首次获取 Go 模块需要联网。

```powershell
pwsh -File scripts/run.ps1       # 启动开发版
go test ./...                    # 测试 Go 管理器
pwsh -File scripts/publish.ps1   # 打包可分发的 Windows x64 单 EXE
```

打包生成 `output/AntigravityManager-<版本>-win-x64.exe` 和同名 `.sha256`。脚本嵌入实际依赖的许可原文，可在“许可”页查看。已有成品不会被覆盖，验证构建可用 `-OutputDirectory artifacts/verify-build`。本地打包不上传文件；使用者仅需要 EXE。

开发验证时，用独立的应用副本和数据目录：

```powershell
./scripts/run.ps1 -AppDirectory 'C:\path\to\test-app' -DataDirectory "$PWD/artifacts/dev-data"
```

## 目录

| 位置 | 用途 |
| --- | --- |
| `src/` | Go 程序入口和 MyGo 界面，业务和测试在 `src/internal/` |
| `engines/localization/` | 词库、版本指纹、注入脚本与 Node.js 参考引擎 |
| `assets/branding/` | SVG 图标源与程序内嵌的 512 像素 PNG |
| `scripts/`、`tools/` | 启动、打包、发行说明；分析、样本准备和验证 |
| `output/`、`artifacts/` | 可分发成品；本地缓存和验证结果 |
| `docs/`、`spec/`、`analysis/` | 操作指南、现行约定、适配证据 |

根目录的 `resources.go` 内嵌共享资源；Go 的嵌入规则不允许子目录直接引用上级文件。新增业务放入 `src/internal/<模块>/`，再从 `src/` 接入界面。详细约定见 [架构规范](../spec/architecture.md)。

修改词库、原生规则或补丁版本后，运行 `node engines/localization/scripts/generate-go-payload.cjs`，把生成资源与源文件一同更新。修改界面后，按 [GUI 验证](testing.md#管理器-gui) 检查明暗主题。

## 发布

按 [发行规范](../spec/releases.md) 更新版本和 [CHANGELOG.md](../CHANGELOG.md)，运行 `node scripts/release-notes.cjs` 预览。首次发布 Go 版前需要完成 [真实样本验证](testing.md)。由获授权的维护者创建并推送 `manager-v<版本>`；[发行工作流](../.github/workflows/release.yml) 校验标签和构建结果后，上传 EXE 和校验文件。
