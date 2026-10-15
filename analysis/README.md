# 分析资料索引

本目录保存补丁的来源证据与文案审查记录。面向使用者的说明位于项目根目录 README，架构与版本报告位于 `docs/`。

| 路径 | 内容 |
| --- | --- |
| `evidence-summary.json` | 首轮 REA 证据摘要、目标指纹与分析统计 |
| `translation-coverage.json` | 当前词库来源、字面量出现次数和覆盖边界 |
| `audits/` | 按设置、功能、对话分组的候选、来源与动态模板记录 |
| `archive/` | 历史一次性分析脚本，供追溯，不参与构建或安装 |
| `original/` | 本地提取的原始 Electron 模块；供分析和测试，Git 忽略 |
| `embedded/` | 本地恢复的前端资源；供离线审查和验证，Git 忽略 |

候选清单、字符串出现次数和 AST 扫描范围均不等于运行时汉化覆盖率。人工检查和实机验证的边界见 [0.4.0 报告](../docs/reports/full-audit-0.4.0.md) 与 [0.4.1 报告](../docs/reports/appearance-0.4.1.md)。

归档的 `fetch-ui.py` 使用当时记录的固定端口，不是通用抓取工具；`settings-scan.cjs` 只覆盖历史分析指定的源码范围。新的全包候选提取使用 `scripts/audit-ui.cjs`。
