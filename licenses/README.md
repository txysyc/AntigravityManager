# 第三方许可原文

[第三方组件清单](../THIRD_PARTY_NOTICES.md)

这里保存当前核对过的依赖许可快照，便于从源码仓库直接查阅。上游英文原文保留完整内容；原文件换行和空白不作本地化处理。

| 快照 | 来源 | 文件 |
| --- | --- | --- |
| WPF UI / Abstractions 4.3.0 | NuGet `WPF-UI`、`WPF-UI.Abstractions` 4.3.0，两包中的许可及声明内容一致 | [LICENSE.md](WPF-UI/4.3.0/LICENSE.md)、[ThirdPartyNotices.txt](WPF-UI/4.3.0/ThirdPartyNotices.txt) |
| .NET Runtime 10.0.13 | NuGet `Microsoft.NETCore.App.Runtime.win-x64` 10.0.13 | [LICENSE.TXT](dotnet-runtime/10.0.13/LICENSE.TXT)、[THIRD-PARTY-NOTICES.TXT](dotnet-runtime/10.0.13/THIRD-PARTY-NOTICES.TXT) |
| Windows Desktop 10.0.13 | NuGet `Microsoft.WindowsDesktop.App.Runtime.win-x64` 10.0.13 | [LICENSE](windowsdesktop/10.0.13/LICENSE) |
| Node.js 24.12.0 | Node.js v24.12.0 官方分发的完整 `LICENSE` | [LICENSE](Node.js/24.12.0/LICENSE) |

升级依赖时，从该版本的包中补充或更新许可原文与上述来源；未核对的快照不得冒充新版本。正式发布时，脚本根据实际依赖重新收集文件，源码快照不锁定 Node.js 或 .NET 的运行版本。
