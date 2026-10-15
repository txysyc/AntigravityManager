# 工作区迁移

仓库由单独的汉化补丁工程调整为模块化桌面管理器，Git 历史和 `v0.4.1` 标签保留。根目录未重命名，可以在关闭开发进程后自行更名。

| 原路径 | 新路径 |
| --- | --- |
| `src/*.cjs`、`src/renderer-localize.js` | `engines/localization/src/` |
| `translations/` | `engines/localization/translations/` |
| `tests/*.test.cjs`、`tests/fixtures/` | `engines/localization/tests/` |
| `scripts/build.cjs`、`scripts/install.cjs` | `engines/localization/scripts/` |
| `scripts/audit-ui.cjs`、`scripts/extract-embedded.py` | `tools/analysis/` |
| `scripts/smoke-test.cjs`、`scripts/verify-audit.cjs` | `tools/verification/` |
| `dist/manifest.json` | `engines/localization/profiles/2.23.0.json`，作为受支持版本基线 |
| `dist/app.asar` | `artifacts/localization/app.asar`，本地构建产物 |
| 旧 `package.json` | `engines/localization/package.json`，保留补丁版本 0.4.1 |
| 旧 `docs/architecture.md` | `docs/reports/reverse-engineering-2.23.0.md`，保留历史记录 |

根目录的新 `package.json` 属于管理器，结构迁移时的初始版本为 0.1.0，当前版本以配置为准。`.slnx` 管理 C# 项目；`artifacts/` 统一存放发布、补丁、缓存和测试结果，Git 忽略。

历史报告中的路径按当时工程记录保留，查找当前文件时参考上表；分析清单中的原始前端来源仍是 `analysis/embedded/`。

旧固定安装路径已从活动代码移除。CLI 可通过 `--app-dir` 传入安装位置，或设置 `ANTIGRAVITY_APP_DIR`。开发工具中的 Babel/Playwright 默认缓存路径也已改为可配置依赖。

新的原始备份保存在管理器数据目录，而非应用旁边。已有旧备份只在指纹通过校验时作为来源，不会覆盖未知版本的备份。
