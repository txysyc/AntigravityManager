# 汉化模块操作说明

[文档中心](../README.md) / [使用指南](../user-guide.md) / 汉化模块

模块行为、兼容策略与翻译安全边界统一维护于 [汉化模块规范](../../spec/modules/localization.md)。适配层位于 `src/AntigravityManager.Modules.Localization/`，引擎位于 `engines/localization/`。

## 查询支持范围

可用补丁版本来自引擎 `package.json`，已验证的应用版本和指纹来自 `profiles/*.json`；管理器版本独立维护。当前安装是否受支持应通过 `inspect` 判断，不能只根据版本号或差异报告判断。

## 桌面操作与检查范围

在“汉化概况”查看可用补丁、已安装补丁和当前应用版本；完全退出 Antigravity 后执行“安装／修复汉化”。“备份与恢复”用于检查恢复资料并恢复原版，“操作记录”用于查看维护结果。全局数据位置与迁移操作见 [使用指南](../user-guide.md)。

“版本检查”比较已记录的 Electron 模块及原生文案锚点，不会自动分析语言服务内嵌前端，也不自动批准未知版本。2.23.1 配置同时校验 ASAR 与语言服务指纹；检查成功不表示所有登录后服务端内容都已实测。各版本的证据及覆盖边界见 [报告索引](../README.md#分析与验证报告)。

## 命令行

从仓库根目录运行，明确传入安装位置：

```powershell
$appDir = Join-Path $env:LOCALAPPDATA 'Programs/antigravity'
node engines/localization/cli.cjs inspect --app-dir "$appDir"
node engines/localization/cli.cjs compare --app-dir "$appDir"
node engines/localization/cli.cjs install --app-dir "$appDir"
node engines/localization/cli.cjs restore --app-dir "$appDir"
node engines/localization/cli.cjs backups
```

`install`、`restore` 会修改目标安装；先退出 Antigravity。开发验证请使用隔离副本及 `--data-dir <目录>`，不要对真实安装试错。CLI 默认跟随管理器配置的数据目录，返回 JSON，失败时退出码非零。

单独构建开发产物：

```powershell
node engines/localization/scripts/build.cjs "$appDir"
```

产物为 `artifacts/localization/<应用版本>/<补丁版本>/app.asar` 和 `manifest.json`，自动识别目标的已验证配置。相同目录的不同或不完整产物会被拒绝覆盖。这个入口兼容读取旧版应用旁备份；管理器安装通过 CLI 使用外部版本化备份重新构建，缓存也按应用和补丁版本隔离。原始资源准备见 [测试指南](../testing.md#准备汉化测试资料)。

## 旧版本与升级

补丁新增应用版本支持或机制变化时递增 `0.x` 的次版本；同一支持范围内的文案与缺陷修复递增修订号。补丁与管理器独立编号，分别以引擎 `package.json` 与根 `Directory.Build.props` 为准；管理器的界面更新不要求递增补丁版本。具体支持资格仍由指纹决定，不根据编号推断兼容性。

保留旧版兼容配置与已知补丁指纹，允许识别和恢复旧安装。`v0.4.1` 标签保留历史源码，旧发布目录可单独归档，无需在管理器中内置多套旧引擎。当前引擎可以为仍受支持的旧应用生成当前补丁。

应用更新后重新检查，使用针对新应用生成的产物。不要把旧 ASAR 复制到新应用。原始备份持续按应用版本和指纹保存；不自动清理。可重建缓存与不可替代的原始备份应分别管理，避免清理缓存时误删恢复资料。

## 翻译资源与切换

| 引擎内路径 | 内容 |
| --- | --- |
| `translations/zh-CN.json` | 固定词条 |
| `translations/zh-CN.remote.json` | 服务端文案 |
| `translations/zh-CN.dynamic.json` | 动态句式规则 |
| `profiles/*.json` | 已验证指纹、原生文案锚点及模块基线 |

语言切换入口为目标应用右下角 Language / 语言、Ctrl+Alt+L 或原生语言菜单。网页即时切换，原生界面下次启动生效；设置保存在目标应用用户目录中的 `ui-language.json`。

管理器的维护入口位于汉化模块内部四个页签。汉化记录在管理器数据目录的 `localization/tasks.json`，缺失时兼容读取旧 `tasks.json`；数据迁移后无需单独更改模块路径。
