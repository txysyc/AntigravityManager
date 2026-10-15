# 架构与模块规范

适用于整个管理器及后续模块。产品定位见 [规范索引](README.md)，汉化专属约束见 [汉化模块规范](modules/localization.md)。

## 目录与依赖

| 位置 | 职责 |
| --- | --- |
| `src/AntigravityManager.Core/` | 模块描述、注册与共享契约，不引用 WPF 或 Node.js |
| `src/AntigravityManager.Infrastructure/` | 路径发现、配置、数据迁移及后台引擎通信，依赖 Core |
| `src/AntigravityManager.Modules.<Feature>/` | 模块后端适配；仅在确有需要时使用 Infrastructure |
| `src/AntigravityManager.Desktop/` | 组合入口、通用导航、概览、全局设置和主题 |
| `Desktop/Modules/<Feature>/` | 模块专属视图、视图模型、任务、状态和记录 |
| `engines/<module-id>/` | 模块需要的独立执行引擎及其测试、配置和资源 |
| `docs/assets/screenshots/` | 独立数据目录下生成并核对的产品截图，供项目文档使用 |
| `licenses/` | 按依赖版本保存的第三方许可与声明原文，不混入程序二进制 |
| `tests/`、`tools/`、`artifacts/` | 集成检查、开发工具、已忽略的生成产物 |

壳层不得实现模块专属维护逻辑。模块不得依赖另一个模块的内部实现；可复用能力进入共享层前，应先确认存在实际共同需求。不要为尚未确定的扩展预建空模块。

`artifacts/app/` 保存发布目录，`artifacts/localization/` 保存按版本隔离的补丁，`artifacts/fixtures/` 保存测试基线；适配证据按任务目录保留。已结束的一次性验证可归档至 `artifacts/archive/<批次>/`，归档前后校验文件内容并记录原路径。不移动正在使用的数据、不删除原始备份、不跨目录链接递归清理；依赖缓存与测试临时目录不混入发布包。当前本地产物可用 `artifacts/README.md` 索引，该索引及产物不进入 Git。

ZIP 分发包位于 `artifacts/releases/`，文件名包含管理器版本与目标平台，保留完整发布目录层级及许可文件，不包含用户数据、原始备份或开发缓存。打包后校验条目和内容与源发布目录一致，并保存 SHA-256；不覆盖已有正式归档。

项目原创代码采用根目录 `LICENSE` 的 MIT 许可；第三方内容保留各自条款。依赖清单维护于 `THIRD_PARTY_NOTICES.md`，源码同时保存已核对的许可全文及来源，升级时同步维护。发布包必须包含项目许可、第三方说明及实际依赖的完整许可；WPF UI 与 .NET 原文取自对应版本 NuGet 包，Node.js 取自所分发的版本，不能仅放链接或用 SDK 许可替代运行时许可。缺少必要原文时发布失败，第三方原文不翻译或改写。

## 模块契约与界面

- 内置模块实现 `IManagerModule`，声明唯一 ID，通过 `ModuleRegistry` 显式注册；共享定义位于 `Core/Modules.cs`。
- 后端注册与页面接入分别完成。当前由 `Desktop/App.xaml.cs` 组合，`MainViewModel` 与 `MainWindow.xaml` 映射导航；尚无外部 DLL 热加载或插件仓库。
- 全局配置由壳层管理，专属检查、备份、恢复、操作记录由模块管理。概览提供通用应用信息和模块入口。
- 主界面区分管理器版本、目标应用版本和模块自身版本；模块有安装产物时，还要区分可用与已安装版本。
- 品牌图标以 `Desktop/Assets/Branding/app-icon.svg` 为源，PNG 与多尺寸 ICO 随源码保存，通过 `tools/assets/generate-icons.ps1` 同步生成；程序文件、窗口、标题栏与侧栏统一使用这套资源。正常构建直接使用生成文件，不增加图像处理运行依赖。
- 任务必须有忙碌和结果反馈，阻止相冲突操作；写事务开始后允许其完成，任务期间阻止关闭窗口。明暗主题应覆盖所有页面。
- 子进程使用 `ProcessStartInfo.ArgumentList`，不得拼接 shell 命令；JSON 标准输出仅承载协议结果，诊断不得破坏协议。
- 应用快照的可选 `CompatibilityIssue` 携带已确认的中文兼容问题，模块界面优先展示它；安装与恢复能力分别由引擎判断，不通过显示状态推断写权限。

## 配置、存储与迁移

- 资源位置相对于发布目录或工作区发现，不依赖仓库根目录名称；`ANTIGRAVITY_MANAGER_HOME` 可显式指定资源根目录。
- 默认数据目录为 `%LOCALAPPDATA%/AntigravityManager`。固定引导位置的 `location.json` 保存选择的数据目录；配置位置不可用时应报错，不静默回退到空数据。
- GUI 和未显式传入 `--data-dir` 的 CLI 使用同一数据位置。隔离验证必须显式传入数据目录，不写真实用户配置。
- 模块数据跟随管理器迁移。迁移须拒绝非空目标、新旧目录相互包含及重解析点；复制、逐文件校验后才能切换定位，保留原目录。失败不能切换当前配置或覆盖已有目标数据，失败副本可保留供恢复。
- 数据迁移与维护任务互斥；其他管理器实例发现数据位置已变化后不得继续写旧位置。模块写事务必须与迁移协调锁机制。
- 不自动删除可能仍有效的操作锁。缺少备份、权限不足或校验失败时明确失败，不继续危险写入。

当前锁及迁移实现见 `Infrastructure/ManagerEnvironment.cs`，跨进程通信见 `Infrastructure/NodeEngineClient.cs`；模块接入步骤见 [开发与扩展说明](../docs/architecture.md)。
