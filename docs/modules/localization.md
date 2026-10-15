# 汉化模块操作说明

模块行为、兼容策略与翻译安全边界统一维护于 [汉化模块规范](../../spec/modules/localization.md)。适配层位于 `src/AntigravityManager.Modules.Localization/`，引擎位于 `engines/localization/`。

## 查询支持范围

可用补丁版本来自引擎 `package.json`，已验证的应用版本和指纹来自 `profiles/*.json`；管理器版本独立维护。当前安装是否受支持应通过 `inspect` 判断，不能只根据版本号或差异报告判断。

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

产物为 `artifacts/localization/app.asar` 和 `manifest.json`。这个入口兼容读取旧版应用旁备份；管理器安装通过 CLI 使用外部版本化备份重新构建。原始资源准备见 [开发指南](../development.md)。

## 翻译资源与切换

| 引擎内路径 | 内容 |
| --- | --- |
| `translations/zh-CN.json` | 固定词条 |
| `translations/zh-CN.remote.json` | 服务端文案 |
| `translations/zh-CN.dynamic.json` | 动态句式规则 |
| `profiles/*.json` | 已验证指纹、原生文案锚点及模块基线 |

语言切换入口为目标应用右下角 Language / 语言、Ctrl+Alt+L 或原生语言菜单。网页即时切换，原生界面下次启动生效；设置保存在目标应用用户目录中的 `ui-language.json`。

管理器的维护入口位于汉化模块内部四个页签。汉化记录在管理器数据目录的 `localization/tasks.json`，缺失时兼容读取旧 `tasks.json`；数据迁移后无需单独更改模块路径。
