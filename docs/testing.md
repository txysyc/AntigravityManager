# 测试与验证

[文档中心](README.md) / [开发指南](development.md) / 测试

本页区分引擎检查、管理器 GUI、组件样本和真实产品页面。仅修改文档时检查格式、路径与命令即可；行为变更按对应范围执行验证。

## 准备汉化测试资料

完整引擎测试需要 2.23.0 原始资源、真实历史 0.4.1 补丁，以及 2.23.1、2.29.0 的完整原版资源。这些第三方程序文件不随 Git 分发。输入必须匹配已验证指纹：

```powershell
node tools/verification/prepare-fixtures.cjs 'C:\path\to\supported\app.asar'
node tools/verification/prepare-fixtures.cjs 'C:\path\to\0.4.1\app.asar'
node tools/verification/prepare-fixtures.cjs 'C:\path\to\2.23.1\resources\app.asar'
node tools/verification/prepare-fixtures.cjs 'C:\path\to\2.29.0\resources\app.asar'
```

新版输入需保留 `resources/bin/language_server.exe` 的相对位置。脚本校验 ASAR，按版本写入 `artifacts/fixtures/<应用版本>/`；新版还校验并复制语言服务。历史样本保存为 `2.23.0/patched-0.4.1.asar`，不能将新产物改名冒充旧版。

为兼容原生模块检查，2.23.0 原版同步到 `artifacts/fixtures/app.asar` 和 `analysis/original/`，新版不覆盖旧基线。已知双语补丁中的英文分支可以恢复原始模块，脚本不修改输入文件。

在隔离目录构建测试补丁：

```powershell
New-Item -ItemType Directory -Path artifacts/test-app/resources -Force | Out-Null
Copy-Item -LiteralPath artifacts/fixtures/app.asar -Destination artifacts/test-app/resources/app.asar
node engines/localization/scripts/build.cjs artifacts/test-app
```

默认补丁产物在 `artifacts/localization/<应用版本>/<补丁版本>/`。不要使用未经适配的版本替代测试原版；缺少资料时应准备输入，不能跳过校验或关键回归。

## 自动检查

在仓库根目录运行：

```powershell
npm run check:guidelines
npm test
npm run test:manager
```

| 检查 | 覆盖范围 |
| --- | --- |
| 规范检查 | 文档链接、换行、版本同步、部分中文提示与异常展示 |
| Node.js 引擎 | ASAR、原生菜单、语言设置、未知指纹拒绝、损坏备份、文件变化、不可变产物及跨版本安装恢复 |
| C# 控制台检查 | 模块注册、路径与设置、JSON 子进程协议、数据迁移、并发与链接保护 |

C# 检查可额外传入应用目录，验证只读元数据链路：

```powershell
dotnet run --project tests/AntigravityManager.Checks -- 'C:\path\to\antigravity'
```

引擎使用 `node:test`，C# 使用轻量控制台检查程序，没有独立覆盖率百分比门槛。规范检查不能代替实现与 spec 的语义核对。

[GitHub Actions 测试工作流](../.github/workflows/test.yml) 在推送到 `main`、向 `main` 提交 PR 时运行，也可手动启动。它检查规范、构建管理器、运行 C# 集成检查，以及通过 `npm run test:ci` 运行不需要第三方原始资源的引擎测试。依赖已验证原版或历史补丁的用例以 `fixture:` 命名；这些用例仍由本地 `npm test` 完整执行。发行工作流复用同一套 CI 检查；涉及汉化适配时，打标签前仍应完成本地完整测试和相应的隔离验证。

## 管理器 GUI

开发入口使用独立数据目录，自动遍历三个主页面、汉化模块四个页签及明暗主题，生成 PNG 后退出：

```powershell
./src/AntigravityManager.Desktop/bin/Debug/net10.0-windows/AntigravityManager.exe `
  --data-dir "$PWD/artifacts/gui-smoke/profile" `
  --app-dir 'C:\path\to\antigravity' `
  --smoke-output "$PWD/artifacts/gui-smoke/screenshots"
```

成功标记为截图目录中的 `result.json`，包含版本、状态、页面和页签数量；失败时保存 `error.txt`。该入口不安装或恢复补丁，不修改目标应用。

`--smoke-migrate <新的隔离目录>` 可测试设置页的真实迁移命令及迁移后的备份读取，必须配合 `--data-dir`。截图属于管理器窗口，不是 Antigravity 产品页面。

## 前端与组件审查

### 提取与候选扫描

```powershell
python tools/analysis/extract-embedded.py 'C:\path\to\language_server.exe' --output artifacts/adaptation/2.23.1/embedded
$bundle = (Get-ChildItem artifacts/adaptation/2.23.1/embedded -Filter '*-main.js').FullName
node tools/analysis/audit-ui.cjs 'C:\path\to\@babel\parser\lib\index.js' --source "$bundle" --output artifacts/analysis/2.23.1-ui-audit.json
```

AST 扫描依赖外部 Babel parser，也可通过 `BABEL_PARSER_MODULE` 指定。默认报告为 `artifacts/analysis/ui-audit.json`；版本审查需显式指定源文件与输出。

扫描包含 `displayName`、`shortDisplayName`、`shortDescription`、`longDescription` 等配置字段，也会产生内部字段、品牌与第三方内容候选，不能全部自动翻译或据此计算页面覆盖率。

### 隔离组件

`tools/verification/smoke-test.cjs` 依赖完整便携应用副本、对应提取资源及外部 Playwright。通过 `PLAYWRIGHT_MODULE` 指定模块，通过 `--portable`、`--profile`、`--output`、`--embedded` 指定隔离目录。`--check-english` 在新进程中检查英文偏好持久化。

旧默认目录仅为兼容历史工具；版本适配应显式传参，避免资源混用。组件样本与真实页面、WPF GUI 检查互不替代。

### 真实语言服务

真实页面验证必须同时隔离 `USERPROFILE`、`HOME`、`APPDATA`、`LOCALAPPDATA` 和 `--user-data-dir`，因为语言服务还会使用用户主目录下的 `.gemini`。Windows 另用 `prepare-runtime-asar.cjs` 生成只去掉协议注册调用的测试 ASAR，避免便携副本接管 `antigravity://`。需要代理时沿用已有启动器及回环排除规则，不修改系统代理。

```powershell
node tools/verification/prepare-runtime-asar.cjs artifacts/localization/2.29.0/0.2.0/app.asar artifacts/adaptation/2.29.0/runtime-sample.asar
Copy-Item -LiteralPath artifacts/adaptation/2.29.0/runtime-sample.asar -Destination artifacts/adaptation/2.29.0/portable/resources/app.asar
node tools/verification/verify-version-runtime.cjs --launcher 'C:\path\to\AntigravityLauncher.exe' --portable artifacts/adaptation/2.29.0/portable --output artifacts/adaptation/2.29.0/runtime-final
```

该入口验证未登录欢迎页、资源指纹和语言持久化；运行前准备对应版本的 `portable/` 与 `embedded/`。测试 ASAR 仅用于隔离运行，不登记为兼容补丁，不可安装到真实应用。启动器需支持 `--executable`、`--report` 与 `--` 参数透传。适配包含可选 WebContentsView 模式时，另传 `--wcv` 和新的 `--output` 路径验证该模式。`--check-modern-ui` 额外在隔离页面插入样本，核对问候节点复用、浏览器建议及自动化摘要保护，以及切换英文后恢复原文。

验证只写工作区 `artifacts/` 或 `output/`，不使用真实用户目录。启动器模式不读取原生菜单；登录后页面和系统集成的未覆盖范围见 [历史报告](reports/README.md)。
