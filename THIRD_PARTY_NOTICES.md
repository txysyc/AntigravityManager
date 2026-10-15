# 第三方组件与许可

本项目原创代码采用 [MIT 许可证](LICENSE)。下列组件及其包含的第三方代码、字体与资源适用各自的许可条款，不因本项目使用 MIT 而改变。

## 运行与界面依赖

| 组件 | 用途 | 许可与本地原文 |
| --- | --- | --- |
| [WPF UI / WPF UI Abstractions](https://github.com/lepoco/wpfui) 4.3.0 | Fluent 控件、主题、图标及界面抽象 | [MIT](licenses/WPF-UI/4.3.0/LICENSE.md)；[包含组件的声明](licenses/WPF-UI/4.3.0/ThirdPartyNotices.txt) |
| [.NET Runtime](https://github.com/dotnet/runtime) | 自包含发布所需的运行时 | [MIT](licenses/dotnet-runtime/10.0.13/LICENSE.TXT)；[包含组件的声明](licenses/dotnet-runtime/10.0.13/THIRD-PARTY-NOTICES.TXT) |
| [.NET Windows Desktop / WPF](https://github.com/dotnet/windowsdesktop) | Windows 桌面框架 | [MIT](licenses/windowsdesktop/10.0.13/LICENSE) |
| [Node.js](https://github.com/nodejs/node) | 汉化引擎运行时 | [完整许可及包含组件的声明](licenses/Node.js/24.12.0/LICENSE) |

上表的本地文件是已核对版本的完整许可快照，来源和维护方式见 [许可目录](licenses/README.md)。Node.js 与 .NET 中包含的第三方组件可能采用其他许可证，应保留整份文件，不仅截取开头的 MIT 部分。WPF UI 的第三方声明同样需要完整保留，不翻译或删除其中的字体及图标条款。

## 源码与二进制分发

- 源码仓库同时保存依赖清单及许可原文，便于离线查阅。新增依赖或复制第三方代码、资源时，应同步记录来源、版本与适用许可。
- 发布目录包含项目 `LICENSE`、本声明，以及随实际依赖版本收集的许可文件。`licenses/` 保存 WPF UI 和 .NET 许可，Node.js 的完整许可位于 `runtime/LICENSE` 或 `runtime/LICENSE.txt`。
- `scripts/publish.ps1` 从对应 NuGet 包与 Node.js 分发中收集原文；发布环境更新后，以实际打包版本为准，不能用无关 SDK 的许可替代运行时许可。
- `tools/` 中部分开发验证入口通过外部路径使用 Babel parser 或 Playwright；标准程序发布包不包含这些工具。若额外分发它们，应另行保留其对应版本的许可和第三方声明。

## 目标应用

Antigravity 是独立的第三方应用，本项目与其官方无隶属关系。仓库及管理器 ZIP 不包含 Antigravity 程序、提取资源或用户数据；本项目许可证不授予这些内容的再分发权。文档中的应用名称仅用于说明管理目标。
