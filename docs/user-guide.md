# 使用指南

[项目首页](../README.md)

## 运行管理器

下载 Windows x64 EXE 后可直接运行。历史 ZIP 需完整解压。自行构建见 [开发指南](development.md#启动与打包)。

管理器用于按需维护，不常驻后台，也不接管 Antigravity 的日常启动。安装维护完成后，可关闭管理器，继续使用原有快捷方式或代理启动器。

## 首次配置

1. 打开“设置”，确认 Antigravity 安装目录；该目录应包含 `Antigravity.exe` 和 `resources/`。
2. 如需手动更改目录，点击“浏览”选择位置，再点击“保存设置”。
3. 按需调整深色模式，或迁移管理器的数据目录。

在“界面汉化”查看兼容性、安装或恢复；备份和操作记录可以从顶部独立打开。

## 管理汉化

完全退出 Antigravity 后，在“界面汉化”中检查兼容性，再执行安装、修复或恢复。首次安装会校验应用文件并保存原始备份；修复和恢复需使用匹配的原始备份。未知文件指纹、损坏备份或操作期间的文件变化会阻止替换。

应用更新后重新检查支持状态，不要手动将旧补丁文件复制到新版本。“版本比较”用于查看 Electron 模块和原生文案锚点差异，结果不会自动批准新版本。具体检查条件见 [汉化规范](../spec/modules/localization.md)。

在 Antigravity 里可用右下角 **Language / 语言**、`Ctrl+Alt+L` 或原生语言菜单切换中英文。网页即时切换，原生界面下次启动生效。语言偏好保存在目标应用用户目录的 `ui-language.json`。

### 命令行

从仓库根目录查看当前状态：

```powershell
$appDir = Join-Path $env:LOCALAPPDATA 'Programs/antigravity'
& ./output/AntigravityManager-0.3.0-win-x64.exe --operation inspect --app-dir $appDir | Out-String
```

可用操作：`inspect`、`compare`、`install`、`restore`、`backups`、`history`。输出为 JSON，失败返回非零退出码。安装或恢复前先退出 Antigravity；开发验证用隔离副本和 `--data-dir`。

## 数据目录与迁移

默认数据目录为 `%LOCALAPPDATA%/AntigravityManager/`，独立于项目工作区和 Antigravity 安装目录。

在“设置”中选择新的或空的数据目录，点击“迁移”。管理器会复制设置、操作记录、备份和缓存，逐文件校验后切换；原目录保留，不合并非空目标目录。迁移失败时不会切换到新目录。

默认位置内的 `location.json` 保存当前数据位置。迁移后仍需保留此定位文件；配置的目录不可用时，管理器会提示错误。GUI 和未显式指定 `--data-dir` 的 CLI 共用此配置；开发用的 `--data-dir` 不改变正常的数据位置。

数据目录中的主要文件：

```text
AntigravityManager/
├── settings.json
├── localization/
│   ├── tasks.json
│   └── installed.json
└── backups/localization/<应用版本>/<原始指纹>/app.asar
```

## 备份保留与恢复

新的原始备份位于管理器数据目录，按应用版本和原始文件指纹保存，不自动清理。已有且通过校验的 `app.asar.zh-CN-original` 可以作为旧版备份来源。

恢复时只能使用与当前应用匹配的原始备份。应用更新或项目目录重命名不会主动删除备份；安装位置如有变化，应重新确认路径。可重建缓存与原始备份分别管理，清理缓存或旧发布包时不要连带删除恢复资料。

## 遇到问题

- **安装按钮不可用**：核对安装目录、检查结果和备份状态。相同版本号下也可能存在不同构建，不能仅凭版本号认定兼容。
- **数据目录无法读取**：确认目录仍可访问，并检查默认位置的 `location.json`；不要直接删除定位文件创建另一套空数据。
- **翻译仍有遗漏**：提供所在页面、操作路径和截图，并注明三个独立版本：管理器、汉化补丁及 Antigravity。

已完成检查与覆盖限制见 [历史适配摘要](../analysis/reports/README.md)。
