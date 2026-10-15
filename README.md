# Antigravity 简体中文补丁

为 Google Antigravity 桌面应用提供简体中文界面和中英文切换。项目通过修改 Electron 的 `app.asar` 加载翻译层，支持恢复原版；不修改应用 EXE、语言服务程序或用户会话数据。

这是非官方本地补丁，目前仅适配已验证的 **Windows Antigravity 2.23.0**。

## 功能

- 翻译菜单、侧栏、设置、外观主题、模型额度、自动化、插件市场及对话相关控件。
- 支持简体中文与 English 切换，并保存语言偏好。
- 处理已确认的动态文案，包括版本、数量、额度恢复时间和提示信息。
- 保护聊天正文、代码、终端、输入值、项目名称、文件路径和第三方主题名称。
- 安装前检查文件指纹，保留原始备份，支持恢复和已知补丁版本之间的升级。

当前补丁版本为 **0.4.1**，包含 2537 条界面词条、14 条服务端文案和 35 条动态规则。词条数量不代表页面覆盖率，仍存在未覆盖的文案。

## 兼容性与运行要求

| 项目 | 要求 |
| --- | --- |
| 操作系统 | Windows；其他平台尚未适配 |
| 目标应用 | Google Antigravity 2.23.0 |
| 构建与安装 | Node.js；基础脚本仅使用内置模块，无需安装 npm 依赖 |
| 原始 ASAR 指纹 | `4e99093662d797ecba823e92823d352413e3bf2ca721257df4a255c045df1598` |

版本号相同也必须通过指纹校验。应用更新或文件存在未知修改时，脚本会拒绝覆盖；需要重新分析对应版本。

## 安装

在项目根目录运行以下 PowerShell 命令。先完全退出 Antigravity，将 `$appDir` 设置为实际安装目录：

```powershell
$appDir = Join-Path $env:LOCALAPPDATA 'Programs\antigravity'

# 构建补丁
node scripts/build.cjs "$appDir"

# 安装补丁
node scripts/install.cjs "$appDir"
```

重新打开 Antigravity 后生效。若 `dist/app.asar` 已构建且与 `dist/manifest.json` 一致，可以直接执行安装命令。

原始文件保存在安装目录的 `resources/app.asar.zh-CN-original`。升级补丁时不会覆盖这份备份；请保留它。安装脚本会校验当前文件、补丁和备份的 SHA-256，重复安装同一补丁不会再次替换文件。

脚本也支持省略安装目录，但当前默认值是开发环境的固定路径。建议始终显式传入 `$appDir`。

## 切换语言

点击页面右下角的 **Language / 语言**，选择 **简体中文** 或 **English**。也可以按 `Ctrl+Alt+L` 打开选择器，或使用原生 **Language / 语言** 菜单。

网页界面即时切换，并向其他应用窗口同步。原生菜单、对话框和独立向导在下次启动时使用所选语言，切换操作不会自动退出应用。

语言偏好保存在 Electron 用户数据目录的 `ui-language.json`，默认简体中文。切回英文时恢复记录的原文和提示属性；应用随后更新的内容会保留。

## 恢复原版

完全退出 Antigravity，在项目根目录执行：

```powershell
$appDir = Join-Path $env:LOCALAPPDATA 'Programs\antigravity'
node scripts/install.cjs "$appDir" --restore
```

重新打开应用即可使用原版界面。恢复操作同样检查当前文件和备份指纹，不覆盖未知版本或未知修改。

## 开发与验证

修改 `translations/` 中的对应词库，重新构建并安装：

```powershell
node scripts/build.cjs "$appDir"
npm test
node scripts/install.cjs "$appDir"
```

| 文件 | 用途 |
| --- | --- |
| `translations/zh-CN.json` | 已核对的固定界面文案 |
| `translations/zh-CN.remote.json` | 已核对的服务端文案，仅在相应界面匹配 |
| `translations/zh-CN.dynamic.json` | 有明确范围和完整句式的动态规则 |
| `dist/manifest.json` | 补丁版本、原版与补丁指纹、成员修改记录 |

构建仅依赖目标应用的原始 ASAR，已安装受支持补丁时会从校验通过的原始备份构建。`dist/app.asar` 是本地构建产物，不纳入 Git。

测试包含本机安装文件和已提取原始模块的集成检查，首次克隆需要准备相应资料；不会随仓库分发完整应用副本。基础测试、前端审查及独立 Electron 验证的环境配置见 [开发指南](docs/development.md)。

当前通过 9 项基础测试，以及独立 Electron 中的代表性组件、动态更新、中英文恢复、名称和输入值保护、预设内部值保留、语言偏好跨进程恢复验证。独立测试页面不能替代已登录产品的完整布局和工作流检查。

## 项目结构

```text
.
├── src/                  # ASAR、原生文案和渲染器翻译实现
├── translations/         # 固定、服务端及动态翻译规则
├── scripts/              # 构建、安装、资源提取和验证工具
├── tests/                # 基础测试与界面组件样本
├── docs/                 # 架构说明、开发指南及版本审查报告
├── analysis/             # 证据、覆盖记录、审查清单及归档脚本
├── dist/                 # 补丁清单与本地构建产物
└── output/               # 按需生成的测试数据和临时产物，Git 忽略
```

## 实现与已知限制

Electron 主进程启动本机语言服务，再从动态 HTTPS 端口加载 React 界面。补丁利用现有隔离 preload 加入 DOM 翻译层，并对已确认的原生显示文本提供中英文分支。窗口继续使用 `contextIsolation: true` 和 `nodeIntegration: false`。

翻译使用精确词库和限定范围的动态规则，不调用在线翻译服务。未知文案、第三方插件内容、系统控件及未经核对的动态模板可能保留英文。用户内容保护依赖已确认的界面结构，应用升级后需要重新核验。

市场描述中的搜索高亮保留原有元素和事件，但中文高亮位置不保证与英文搜索词语义对应。真实会话页面的完整检查曾受本机服务连接重置影响，尚未完成全部页面与工作流验证；详细边界记录在审查报告中。

## 项目文档

- [架构与逆向分析](docs/architecture.md)
- [开发与验证指南](docs/development.md)
- [分析资料索引](analysis/README.md)
- [0.4.0 汉化审查报告](docs/reports/full-audit-0.4.0.md)
- [0.4.1 外观主题修复报告](docs/reports/appearance-0.4.1.md)
