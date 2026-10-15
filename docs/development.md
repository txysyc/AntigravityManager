# 开发、测试与发布

## 环境

Windows 上安装 .NET 10 SDK 和 Node.js。WPF UI 4.3.0 在项目中固定引用，由 NuGet 还原；无需手动安装 GUI 控件库。编译不要求安装 Visual Studio。

`global.json` 选择 .NET 10，并允许同一主次版本内更新 SDK 功能带。管理器版本在 `Directory.Build.props` 和根 `package.json`，汉化引擎版本在 `engines/localization/package.json`。

## 编译与运行

```powershell
dotnet build AntigravityManager.slnx
./scripts/run.ps1
```

开发脚本将 CLI 缓存与 NuGet 包放在 `artifacts/`。管理器会优先使用 `runtime/node.exe`，否则从 PATH 查找 Node.js；发布脚本会将 Node.js 一并复制。

## 准备汉化测试资料

完整引擎测试需要已验证的 2.23.0 原始资源和补丁产物。这些第三方程序文件不随 Git 分发。原始 ASAR 或本项目已知可逆补丁均可作为输入：

```powershell
node tools/verification/prepare-fixtures.cjs 'C:\path\to\supported\app.asar'
```

脚本严格校验已知指纹，仅在恢复出的原始文件也匹配原版指纹后写入 `artifacts/fixtures/app.asar` 和 `analysis/original/`。已知双语补丁中的英文分支可用于恢复原始模块；不会修改输入文件。

然后在隔离目录准备补丁产物：

```powershell
New-Item -ItemType Directory -Path 'artifacts/test-app/resources' -Force | Out-Null
Copy-Item -LiteralPath 'artifacts/fixtures/app.asar' -Destination 'artifacts/test-app/resources/app.asar'
node engines/localization/scripts/build.cjs 'artifacts/test-app'
```

不要将目前不兼容的 2.23.1 当作 2.23.0 的测试原版。缺少测试资源时应先准备输入，不能用跳过兼容校验的方式让测试通过。

## 自动检查

```powershell
npm test
npm run test:manager
npm run check:guidelines

# 加上实际安装目录，额外验证只读的 C# → Node 应用检查
 dotnet run --project tests/AntigravityManager.Checks -- 'C:\path\to\antigravity'
```

Node.js 检查包括 ASAR、原生菜单与语言设置、未知指纹拒绝、并发文件变化、损坏备份保护、中文错误反馈，以及完整隔离安装/重复安装/外部备份恢复。原生模块测试仍使用本地原始资源，语言分支测试使用已构建补丁。

C# 检查使用轻量控制台入口，无额外测试框架依赖。覆盖模块注册、重复 ID、路径与设置保存，以及真实子进程的 JSON 成功/失败链路。输入了不兼容应用时，验证安装能力保持关闭。数据目录测试使用独立引导目录，验证迁移字节一致、保留原始文件、重启解析、非空目标和嵌套目录拒绝、并发锁、旧实例及目录链接保护。

`check:guidelines` 不需要原始程序资源，只读检查规范链接、文档换行、管理器版本同步、部分英文界面提示及直接展示异常的代码路径。它不会自动改写规范；长期约定是否需要更新，仍须按 [AGENTS.md](../AGENTS.md) 和 [规范索引](../spec/README.md) 随开发任务审查。品牌、协议键、翻译原文和第三方工具诊断不应机械翻译。

## GUI 验证

桌面程序提供仅供开发的只读页面渲染入口。使用独立数据目录，自动遍历三个主页面及汉化模块四个页签、检查版本变化、生成明暗主题 PNG，完成后退出：

```powershell
./src/AntigravityManager.Desktop/bin/Debug/net10.0-windows/AntigravityManager.exe `
  --data-dir "$PWD/artifacts/gui-smoke/profile" `
  --app-dir 'C:\path\to\antigravity' `
  --smoke-output "$PWD/artifacts/gui-smoke/screenshots"
```

可选 `--smoke-migrate <新的隔离目录>` 在渲染后测试设置页的真实迁移命令及迁移后的备份读取（必须配合 `--data-dir`）。通过标记为截图目录中的 `result.json`，包含应用版本、补丁版本、安装状态、主页面和模块页签数量。异常时保存 `error.txt`。该入口不执行安装或恢复，不修改目标应用；截图属于真实管理器窗口，不是 Antigravity 产品页面截图。

## 可选前端审查与旧组件验证

```powershell
python tools/analysis/extract-embedded.py 'C:\path\to\language_server.exe'
node tools/analysis/audit-ui.cjs 'C:\path\to\@babel\parser\lib\index.js'
```

AST 审查需外部 Babel parser；也可以通过 `BABEL_PARSER_MODULE` 指定。结果是候选，不是可见文案覆盖率。

旧 preload 组件验证仍保留在 `tools/verification/smoke-test.cjs`，依赖完整独立应用副本 `output/portable/`、`analysis/embedded/` 中对应版本资源及外部 Playwright。使用 `PLAYWRIGHT_MODULE` 指定模块路径。该验证与新的 WPF GUI 检查互不替代。

## 发布

```powershell
./scripts/publish.ps1
```

默认发布 Windows x64 自包含目录到 `artifacts/app/AntigravityManager/`。包含桌面程序、引擎、版本规则、词库和 Node.js，保留整个目录后即可移动或改名使用。

可通过 `-FrameworkDependent` 选择依赖运行时发布，通过 `-NodeExecutable` 指定同架构 Node.js，通过 `-OutputDirectory` 指定另一发布目录（例如旧版仍在使用时）。首版发布脚本没有自动更新或安装器逻辑，不修改现有代理启动器或桌面快捷方式。

新增模块的步骤见 [架构说明](architecture.md)，旧目录对应关系见 [迁移说明](workspace-migration.md)。
