# 汉化模块

模块 ID 为 `localization`，桌面适配层在 `src/AntigravityManager.Modules.Localization/`，Node.js 引擎位于 `engines/localization/`。补丁版本仍为 0.4.1，与管理器 0.1.1 分开管理。

## 当前兼容范围

仅支持 Windows Antigravity 2.23.0，原始 ASAR 指纹：

```text
4e99093662d797ecba823e92823d352413e3bf2ca721257df4a255c045df1598
```

2.23.1 可以识别和比较，但尚未通过完整适配验证，不能安装旧补丁。

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

安装会在管理器数据目录构建补丁并先创建版本化原始备份。CLI 默认与桌面界面共用 `%LOCALAPPDATA%/AntigravityManager/`，使用 `--data-dir <目录>` 可隔离测试。所有操作以 JSON 返回结果，失败时退出码非零。

单独构建开发产物：

```powershell
node engines/localization/scripts/build.cjs "$appDir"
```

产物为 `artifacts/localization/app.asar` 和 `manifest.json`。这个构建入口保留旧版应用旁原始备份的兼容读取；由管理器安装的补丁优先通过 `cli.cjs install` 重新构建，使用管理器外部备份。

## 翻译资源

| 路径 | 内容 |
| --- | --- |
| `translations/zh-CN.json` | 2537 条已核对固定词条 |
| `translations/zh-CN.remote.json` | 14 条已核对服务端文案 |
| `translations/zh-CN.dynamic.json` | 35 条完整句式动态规则 |
| `profiles/2.23.0.json` | 原版和已知补丁指纹、原生锚点与模块基线 |

翻译使用现有隔离 preload、DOM 精确映射和原文记录。切换入口为应用内右下角 Language / 语言、Ctrl+Alt+L，或原生语言菜单。网页即时切换，原生界面下次启动生效；语言保存为目标应用用户目录中的 `ui-language.json`。

不会修改 EXE 或语言服务程序。聊天、代码、输入值和名称保护仍依赖已核对的前端结构。词条数量和锚点匹配数不等于页面覆盖率。

界面维护入口集中于汉化模块四个页签。可用补丁版本始终显示在模块标题旁，已安装版本单独显示。操作记录保存于数据目录的 localization/tasks.json；未找到时可读取旧 tasks.json。未显式指定 --data-dir 的 CLI 会跟随管理器设置的数据目录。
