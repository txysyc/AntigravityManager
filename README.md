# Antigravity Manager

面向 Windows 的模块化 Antigravity 管理工具。首个功能模块提供简体中文补丁管理，后续功能通过统一模块接口扩展。

管理器按需打开，不驻留后台，不接管 Antigravity 的日常启动，也不会修改现有代理启动器。

## 当前状态

- 管理器预览版：**0.1.1**。
- 技术栈：**C# / .NET 10 / WPF / WPF UI 4.3.0**。
- 汉化引擎：**JavaScript / Node.js，补丁版本 0.4.1**。
- 已验证汉化目标：**Windows Antigravity 2.23.0 的指定原始文件指纹**。
- **2.23.1 尚未完成汉化兼容性验证**。可以检查版本和 Electron 模块变化，安装按钮保持禁用。

这是独立的非官方工具。界面中的版本检查来自本地安装文件，不代表对未来版本的兼容承诺。

## 功能

| 页面 | 功能 |
| --- | --- |
| 概览 | 当前应用信息与功能模块入口 |
| 界面汉化 | 内含汉化概况、版本检查、备份与恢复、操作记录四个页签 |
| 设置 | 安装目录、明暗主题、数据目录选择与校验迁移 |

安装和恢复前需要完全退出 Antigravity。未知指纹、损坏备份或操作期间发生的文件变化会阻止替换。

## 开发运行

要求 Windows、.NET 10 SDK 和 Node.js。无需单独安装 WPF UI；NuGet 会还原项目依赖。Visual Studio 是可选的，也可以使用命令行。

```powershell
# 编译整个解决方案
npm run build

# 启动桌面管理器
./scripts/run.ps1
```

构建命令也可直接使用 `dotnet build AntigravityManager.slnx`。管理器会查找可执行文件上级目录中的引擎入口，项目根目录可以重命名。

## 发布可运行版本

```powershell
./scripts/publish.ps1
```

默认输出到 `artifacts/app/AntigravityManager/`，包含自包含 .NET 桌面程序、汉化引擎及 Node.js。使用者无需另装 .NET 或 Node.js，打开目录中的 `AntigravityManager.exe` 即可。分发时需要保留整个目录。

脚本默认发布 Windows x64，并复制本机 PATH 中的 `node.exe`；可以使用 `-NodeExecutable` 指定同架构的 Node.js。`-FrameworkDependent` 发布较小的依赖运行时版本，使用者需要对应的 .NET Desktop Runtime。首次构建和发布需要联网还原依赖。

## 项目结构

```text
.
├── AntigravityManager.slnx
├── src/
│   ├── AntigravityManager.Desktop/              # WPF 窗口、页面与视图模型
│   ├── AntigravityManager.Core/                 # 模块接口与共享数据契约
│   ├── AntigravityManager.Infrastructure/       # 路径、配置及后台引擎通信
│   └── AntigravityManager.Modules.Localization/ # 汉化模块适配层
├── engines/localization/
│   ├── cli.cjs                                 # JSON 命令接口
│   ├── src/                                    # ASAR 与翻译实现
│   ├── scripts/                                # 补丁构建及兼容入口
│   ├── profiles/                               # 已验证版本指纹和比较基线
│   ├── translations/                           # 固定、服务端与动态词库
│   └── tests/                                  # 引擎测试与界面样本
├── tests/AntigravityManager.Checks/             # C# 与跨进程集成检查
├── tools/                                      # 离线分析和开发验证工具
├── scripts/                                    # 管理器运行与发布脚本
├── AGENTS.md                                   # 中文协作与规范阅读入口
├── spec/                                       # 长期规范与按需创建的变更规格
├── docs/                                       # 操作、开发和历史报告
├── analysis/                                   # 来源证据与本地提取资源
├── runtime/                                    # 可选本地 Node.js，二进制忽略
└── artifacts/                                  # 发布、补丁和测试产物，Git 忽略
```

## 数据与备份

默认数据目录为 `%LOCALAPPDATA%/AntigravityManager/`，独立于应用安装目录和项目工作区。设置页可以选择新的或空目录，并点击“迁移并使用此目录”。迁移会复制设置、汉化操作记录、备份和缓存，逐文件校验后切换；原目录保留，不合并非空目标目录。

管理器使用默认目录内的 `location.json` 保存数据位置；更换数据目录后仍需保留这个定位文件。GUI 和未显式指定 `--data-dir` 的 CLI 共用此位置。配置的目录不可用时会报错，不会悄悄创建一套空数据。`--data-dir` 用于隔离测试，不改变正常配置。

```text
AntigravityManager/
├── settings.json
├── localization/tasks.json
├── localization/installed.json
├── backups/localization/<应用版本>/<原始指纹>/app.asar
└── cache/localization/<应用版本>/
```

现有且通过校验的 `app.asar.zh-CN-original` 可以作为旧版备份来源；新的备份保存在管理器数据目录。更新应用或重命名项目目录不会主动删除这些备份。更新后的未知版本不会误用旧备份进行恢复。

## 验证与限制

引擎测试覆盖 ASAR、原生菜单与语言设置、未知版本拒绝安装、文件变化保护，以及隔离副本的安装/重复安装/外部备份恢复。C# 检查覆盖模块注册、设置、根目录重命名和 JSON 子进程通信；独立数据目录的 GUI 检查渲染三个主页面、汉化模块的四个页签及明暗主题。数据目录检查覆盖完整复制、重启读取、冲突拒绝、并发保护、旧实例保护和目录链接拒绝。

```powershell
npm test
npm run test:manager
```

完整引擎测试需要原始模块和构建后的补丁，准备方法见开发指南。界面差异报告目前只比较已记录的 Electron 模块及原生文案锚点；尚不自动分析语言服务内嵌前端，也不自动批准未知版本。历史组件测试不能替代新版本完整实机检查。

## 文档

- [协作与 Git 规范](AGENTS.md)
- [项目规范索引](spec/README.md)
- [架构与模块规范](spec/architecture.md)
- [汉化模块规范](spec/modules/localization.md)
- [项目架构与模块扩展](docs/architecture.md)
- [开发、测试与发布](docs/development.md)
- [汉化模块说明](docs/modules/localization.md)
- [工作区迁移说明](docs/workspace-migration.md)
- [历史逆向分析](docs/reports/reverse-engineering-2.23.0.md)
- [0.4.0 审查报告](docs/reports/full-audit-0.4.0.md)
- [0.4.1 外观修复报告](docs/reports/appearance-0.4.1.md)
- [第三方组件说明](THIRD_PARTY_NOTICES.md)
