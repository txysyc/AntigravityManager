# 分析资料索引

本目录保存历史适配报告、补丁来源证据和文案审查记录。使用与开发指南位于 `docs/`。

| 路径 | 内容 |
| --- | --- |
| `evidence-summary.json` | 首轮 REA 证据摘要、目标指纹与分析统计 |
| `translation-coverage.json` | 当前词库来源、字面量出现次数和覆盖边界 |
| `audits/` | 按设置、功能、对话分组的候选、来源与动态模板记录 |
| [`reports/`](reports/README.md) | 历史版本结论、关键指纹和验证边界 |
| `archive/` | 历史一次性分析脚本，供追溯，不参与构建或安装 |
| `original/` | 本地提取的原始 Electron 模块；供分析和测试，Git 忽略 |
| `embedded/` | 本地恢复的前端资源；供离线审查和验证，Git 忽略 |

Git 跟踪索引、证据 JSON 和归档脚本；报告也纳入仓库维护。仅本地提取的 `original/` 和 `embedded/` 由 Git 忽略。候选清单、字符串出现次数和 AST 扫描范围均不等于运行时汉化覆盖率。

归档的 `fetch-ui.py` 使用当时记录的固定端口，不是通用抓取工具；`settings-scan.cjs` 只覆盖历史分析指定的源码范围。新的全包候选提取使用 `tools/analysis/audit-ui.cjs`。

本目录的 `evidence-summary.json` 和 `translation-coverage.json` 保留历史版本含义。新的扫描统计独立保存到 `artifacts/`，不改写历史分析数字。
