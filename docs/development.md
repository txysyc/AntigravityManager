# 开发与验证

从项目根目录运行脚本。构建和安装工具仅使用 Node.js 内置模块；Python、Babel 和 Playwright 只用于可选分析及集成验证。

## 构建与安装

```powershell
$appDir = Join-Path $env:LOCALAPPDATA 'Programs\antigravity'
node scripts/build.cjs "$appDir"
node scripts/install.cjs "$appDir"
```

支持的原始指纹写在 `scripts/build.cjs`。构建会校验输入、补丁后的 JavaScript 语法、动态规则边界以及 ASAR 的逐成员字节；安装会核对清单与备份。新增兼容版本前需要重新验证原生替换锚点、前端结构与用户内容保护。

## 基础测试

```powershell
npm test
```

当前 9 项测试包括 ASAR 完整性与元数据、语言保存和广播、IPC 来源限制、原生中英文分支、菜单插入和内部动作键保护。

这些测试包含开发环境的集成输入：`tests/asar.test.cjs` 中的本机目标 ASAR 路径、构建后的 `dist/app.asar`，以及 `analysis/original/` 中的原始模块。后者是通过 `src/asar.cjs` 从校验过的原始 ASAR 提取的文件，按原始模块 basename 保存。首次克隆或更换机器时需要准备这些资料，先完成构建，并调整 ASAR 测试里的目标路径。缺少资料时不能将测试失败解释为补丁行为异常。

## 离线前端审查

`scripts/extract-embedded.py` 从本机语言服务可执行文件恢复 gzip/ZIP 资源，输出到 `analysis/embedded/`。脚本中的目标路径需要与实际安装位置一致。

```powershell
python scripts/extract-embedded.py
node scripts/audit-ui.cjs "C:\path\to\@babel\parser\lib\index.js"
```

AST 审查需在外部准备 `@babel/parser` 并传入模块文件路径；省略参数时使用开发环境的缓存路径。结果写入 `output/ui-audit.json`。该脚本提取全包候选和动态模板，不会修改原始前端，也不能自动证明文案可见或翻译已生效。

按功能整理的历史资料位于 `analysis/audits/`；历史辅助脚本位于 `analysis/archive/`。

## 独立 Electron 验证

`scripts/smoke-test.cjs` 运行完整应用副本，使用独立的 `output/smoke-profile/` 和本机验证页面。它不连接真实用户的会话目录。

先构建补丁并准备应用副本：

```powershell
$appDir = Join-Path $env:LOCALAPPDATA 'Programs\antigravity'
node scripts/build.cjs "$appDir"
New-Item -ItemType Directory -Path 'output' -Force | Out-Null
Copy-Item -LiteralPath "$appDir" -Destination 'output/portable' -Recurse
Copy-Item -LiteralPath 'dist/app.asar' -Destination 'output/portable/resources/app.asar' -Force
```

复制前确保 `output/portable/` 不存在，避免产生嵌套副本。验证还需要已恢复的 `analysis/embedded/` 资源，以及外部 Playwright 模块：

```powershell
$env:PLAYWRIGHT_MODULE = 'C:\path\to\node_modules\playwright'
node scripts/smoke-test.cjs
node scripts/smoke-test.cjs --check-english
```

第二条命令依赖第一条命令保留的英文偏好。应用副本、测试用户目录、截图和临时报告均位于 `output/`，可以在测试进程退出后清理；复测时按上述步骤重新生成。

验证覆盖代表性组件形状、动态更新、点击事件、原文恢复、用户内容保护、外观预设内部值和跨进程语言记忆。测试截图是验证页面，不能作为完整产品页面的效果证据。

## 工作区约定

- `src/` 和 `translations/` 保存运行时实现；`tests/fixtures/` 保存界面样本。
- `scripts/` 只保留当前构建、安装和分析验证入口。
- `docs/reports/` 保存版本报告，`analysis/audits/` 保存来源清单。
- `analysis/original/`、`analysis/embedded/`、`dist/*.asar` 和 `output/` 不纳入 Git。
- 原始安装备份保存在应用安装目录，清理项目工作区时不要删除该备份。
