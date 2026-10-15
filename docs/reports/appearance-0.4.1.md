# 0.4.1 外观主题漏译修复

用户截图中的 Theme、Contrast、Light Theme、Preset、Default Light、Background、Foreground、Accent 和 Strong 是漏译，并非有意保留。0.4.0 的全包 AST 提取包含这些候选，但人工功能检查遗漏了前端末段的主题模块。此前报告把扫描范围和实际核对范围混在一起，已补充更正。

发布版前端仍为 `analysis/embedded/142809195-main.js`，SHA-256 为 `867d1990b61d87f4b9ff8c5ecb1551c8688135267f32e56e02563f2d3e78fd68`。主题模块位于约 9.26–9.28M 字符处，使用 UTF-16 源码偏移，不是可执行文件偏移。

核对了 Prc 的主题模式与对比度控制、Krc 的预设/颜色行/低对比度提示、Drc/Jrc 的预设配置，以及 Hrc 的代码预览。补充 16 个固定词条及 1 条完整匹配数值句式的提示规则。静态词条累计 2537，服务端词条仍为 14，动态规则累计 35。

| 原文 | 中文 |
|---|---|
| Theme / Contrast / Strong | 主题 / 对比度 / 增强 |
| Light Theme / Dark Theme | 浅色主题 / 深色主题 |
| Preset / Reset to preset | 预设 / 重置为预设 |
| Default Light / Default Dark | 默认浅色 / 默认深色 |
| Background / Foreground / Accent | 背景色 / 前景色 / 强调色 |
| Light / Dark / System / Inherit Editor | 浅色 / 深色 / 跟随系统 / 跟随编辑器 |

保持现有 preload 精确翻译方式，仅改变展示文本。`Default Light` / `Default Dark` 作为预设配置键、存储值和回调参数保持原文；十六进制输入值、CSS 颜色、Catppuccin 等第三方主题名称及代码预览保持原样。

验证：9 项基础测试通过；独立用户目录的实际打包 Electron 通过新增外观组件验证、中英文恢复、工具提示属性恢复、预设回调内部值与颜色/品牌/代码保护，以及跨进程英文偏好恢复。复用了既有 smoke-test，并扩展 full-audit 组件样本和断言。

验证页面依据恢复源码的组件形状构造，不能等同于已登录产品中的完整实机页面检查。本轮没有更改真实用户的外观设置、发送对话或执行任务，也没有自动提交 Git。
