# 开发指南

[文档中心](README.md) / 开发

从源码运行管理器只需要准备环境并启动程序。测试资源、分发打包和资源维护各自有独立指南。

## 环境要求

| 依赖 | 用途 |
| --- | --- |
| Windows | 运行 WPF 桌面程序 |
| .NET 10 SDK | 编译 C# 主程序；SDK 选择见 `global.json` |
| Node.js（含 npm） | 运行汉化引擎及其检查 |

WPF UI 4.3.0 通过 NuGet 自动还原，无需单独安装控件库。Visual Studio 可选；首次还原依赖需要联网。

## 启动开发程序

在仓库根目录执行：

```powershell
./scripts/run.ps1
```

脚本调用 `dotnet run --project src/AntigravityManager.Desktop`，按需编译并启动窗口，同时将 .NET CLI 缓存和 NuGet 包放在 `artifacts/`。

管理器优先使用 `runtime/node.exe`，不存在时从 PATH 查找 Node.js。资源按工作区或发布目录发现，不依赖仓库根目录的名称。

## 编译、运行与发布的区别

这三个操作可以单独执行，无需依次运行。

| 目标 | 命令 | 结果 |
| --- | --- | --- |
| 只编译 | `dotnet build AntigravityManager.slnx` | 各 C# 项目的开发产物，不打开窗口 |
| 边开发边运行 | `./scripts/run.ps1` | 按需编译桌面程序并启动窗口 |
| 给其他人使用 | `./scripts/publish.ps1` | 完整自包含程序目录，不启动窗口 |

`npm run build` 是第一条命令的别名：根 `package.json` 将 `build` 映射为 `dotnet build AntigravityManager.slnx`，实际编译仍由 .NET 执行。

桌面开发产物在 `src/AntigravityManager.Desktop/bin/Debug/net10.0-windows/`，其他 C# 项目有各自的 `bin/` 与 `obj/`。它们用于本地开发；完整运行时与汉化资源的分发方式见 [打包与分发](packaging.md)。

## 开发检查

```powershell
npm run check:guidelines
npm test
npm run test:manager
```

规范检查不需要原始程序资源。完整引擎测试需要本地已验证的原始文件和历史补丁，先按 [测试与验证](testing.md) 准备，不能跳过指纹校验或用其他版本冒充测试样本。

## 下一步

- [测试与验证](testing.md)：资源准备、引擎检查、GUI 与前端验证。
- [打包与分发](packaging.md)：发布参数、目录产物、ZIP 和发行标签。
- [项目架构](architecture.md)：源码导航、C# → Node.js 执行链路与模块接入。
- [资源与工作区维护](maintenance.md)：图标生成、缓存与验证记录归档。
- [协作规范](../AGENTS.md)：中文沟通、编码风格与提交要求。

版本配置位置、递增条件与发行标签见 [版本与发行规范](../spec/releases.md)。
