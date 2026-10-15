# Repository Guidelines

## 中文优先的协作方式

- 默认使用简体中文沟通，包括方案、进度、代码审查、交付说明及新增文档；用户明确要求其他语言时遵从其要求。
- 代码标识符、路径、命令和 API 名称保留英文。必要的代码注释优先中文，解释原因或约束，避免复述代码。
- 报告问题时先说明影响和结论，再提供必要的原始日志；完成后交代改动、验证结果及未解决事项。
- 使用常规项目命名；未经要求，不添加工具标识、自动署名或协作者署名。

## 规范的按需阅读与同步更新

- 开始任务先读 [规范索引](spec/README.md)。目录、依赖、模块或存储变更再读 [架构规范](spec/architecture.md)；汉化相关任务再读 [模块规范](spec/modules/localization.md)，无需每次加载全部文档。
- 影响长期行为、结构、接口或约束时，在同一批改动中主动更新对应 spec 和引用，不等用户另行提醒。未改变约定的小修复无需改写规范；不能把未实现的设计写成已有能力。
- 交付前检查实现、spec 与验证是否一致，报告更新了哪些规范或为何无需更新。机械检查不能替代语义审查，不自动放宽已有约束。
- `docs/` 保存操作指南和历史报告；规范仅维护一份。较大变更可按需使用 `spec/changes/<feature-name>.md`，不强制为小改动创建计划。

## 项目结构与模块边界

`src/` 按 Desktop、Core、Infrastructure 和具体模块分层；模块 UI 放在 `Desktop/Modules/<Feature>/`，汉化引擎在 `engines/localization/`，C# 检查在 `tests/AntigravityManager.Checks/`。依赖方向和通用模块规则以架构规范为准；生成产物统一放入已忽略的 `artifacts/`。

## 构建、运行与发布

开发环境为 Windows、.NET 10 SDK 和 Node.js；WPF UI 通过 NuGet 还原。

```powershell
npm run build           # 构建解决方案
./scripts/run.ps1       # 启动桌面管理器
npm test                # 执行引擎测试
npm run test:manager    # 执行 C# 集成检查
npm run check:guidelines # 检查规范链接、版本与部分中文提示
./scripts/publish.ps1   # 发布 Windows x64 自包含程序目录
```

完整引擎测试依赖已验证的原始资源及已构建补丁，准备步骤见 `docs/development.md`。

## 编码风格与命名

遵循 `.editorconfig`：UTF-8、LF、文件末尾换行、空格缩进；C# 使用四空格，JSON、JavaScript、XAML 和项目文件使用两空格。C# 类型及公开成员用 PascalCase，私有字段和 JavaScript 函数用 camelCase，异步方法加 `Async` 后缀。沿用 `*View.xaml`、`*ViewModel.cs`、`*.test.cjs` 命名。当前无独立格式化或 lint 工具，使用 `git diff --check` 检查空白问题。

## 测试要求

引擎使用 `node:test` 与严格断言，C# 使用控制台检查程序，未设置覆盖率百分比门槛。行为变更应覆盖相关正常和失败路径，尤其是未知指纹、损坏备份、并发操作及迁移完整性。UI 改动使用独立 `--data-dir` 和 `--smoke-output`，检查明暗主题截图。仅修改文档时检查格式、路径和命令即可。

## Git 提交与合并规范

- 提交格式为 `type(scope): 中文说明`，`scope` 可省略；类型和范围使用英文小写，说明及正文优先中文。
- 常用类型：`feat` 新功能、`fix` 修复、`refactor` 重构、`docs` 文档、`test` 测试、`build` 构建、`chore` 维护。
- 标题简洁说明具体变更，不使用“更新代码”等模糊描述；必要时在正文说明原因、影响与验证结果。
- 每次提交聚焦一个完整改动，避免混入无关文件。提交前审查 `git diff --cached`，执行格式检查和相关测试。
- 分支使用 `feature/<topic>`、`fix/<topic>` 或 `docs/<topic>`。仅在明确要求时提交、合并、推送或打标签，不擅自改写历史。
- PR 使用中文说明问题、改动、验证与限制，关联相关议题；UI 变更附截图。合并前确认目标分支及工作区状态。

示例：`feat(localization): 增加补丁版本展示`、`fix(storage): 修复迁移后数据目录未持久化`、`docs: 完善中文协作规范`。

## 配置与安全边界

禁止绕过兼容性配置或文件指纹检查；安装和恢复测试使用隔离副本，不用未适配版本冒充测试原版。不要提交应用二进制、提取资源、凭据或用户数据。管理器版本同步维护于 `Directory.Build.props` 和根 `package.json`；补丁版本独立维护于 `engines/localization/package.json`。
