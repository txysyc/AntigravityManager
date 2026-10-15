# 开发与模块扩展说明

[文档中心](README.md) / 项目架构

长期目录职责、依赖方向、模块及存储约束统一维护于 [架构规范](../spec/architecture.md)，项目边界见 [规范索引](../spec/README.md)。本文仅说明当前接入方式，不复制规范正文。

## 目录导航

```text
.
├── AntigravityManager.slnx                      # C# 解决方案
├── src/
│   ├── AntigravityManager.Desktop/              # WPF 窗口、页面与视图模型
│   ├── AntigravityManager.Core/                 # 模块接口与共享契约
│   ├── AntigravityManager.Infrastructure/       # 路径、配置与引擎通信
│   └── AntigravityManager.Modules.Localization/ # 汉化模块适配层
├── engines/localization/                       # 汉化实现、词库、指纹和测试
├── tests/AntigravityManager.Checks/             # C# 与跨进程集成检查
├── tools/                                      # 分析与验证工具
├── scripts/                                    # 运行和发布脚本
├── spec/                                       # 长期规范与变更规格
├── docs/                                       # 使用、开发和历史报告
├── analysis/                                   # 来源证据与本地提取资源
├── runtime/                                    # 可选的本地 Node.js
└── artifacts/                                  # 已忽略的发布、缓存与验证产物
```

汉化引擎内的 `src/` 提供 ASAR 和翻译实现，`scripts/` 提供构建入口，`profiles/` 保存已验证指纹与比较基线，`translations/` 区分固定词条、服务端文案和动态规则，`tests/` 保存引擎测试与界面样本。`cli.cjs` 是面向管理器的 JSON 命令入口。

## 当前执行链路

```text
Desktop/App.xaml.cs
  → ModuleRegistry / LocalizationModule
  → NodeEngineClient
  → engines/localization/cli.cjs
```

`Core/Modules.cs` 定义描述、接口和结果对象；`Infrastructure/ManagerEnvironment.cs` 管理配置、数据位置与迁移。桌面层在 `Modules/Localization/` 中维护汉化页面和操作记录。

## 新增模块的步骤

1. 先明确功能与验收标准；较大变更可建立 `spec/changes/<feature-name>.md`。
2. 创建 `src/AntigravityManager.Modules.<Feature>/`，实现 `IManagerModule`，使用唯一模块 ID。只有实际需要共享的数据才扩展 Core 契约。
3. 在 `src/AntigravityManager.Desktop/App.xaml.cs` 注册后端模块。
4. 在桌面层 `Modules/<Feature>/` 添加视图及视图模型；当前导航由 `ViewModels/MainViewModel.cs` 和 `MainWindow.xaml` 显式接入，新增模块需要同时检查这两处以及概览入口。
5. 验证正常与失败链路、明暗主题和模块数据位置；在 `spec/modules/<module-id>.md` 补充模块专属约定并更新索引。

当前模块机制是内置注册，没有外部 DLL 热加载或在线插件仓库。不能仅注册后端就宣称完成了页面和任务接入。

## 调试入口

编译入口见 [开发指南](development.md)，原始资源、隔离 GUI 截图与前端检查见 [测试指南](testing.md)，分发命令见 [打包指南](packaging.md)。汉化 CLI 参数和语言切换见 [汉化操作说明](modules/localization.md)。历史逆向依据保留于 [分析报告](reports/reverse-engineering-2.23.0.md)，不代表后续版本已经兼容。
