# 第三方组件与许可

本项目原创代码采用 [MIT 许可证](LICENSE)。Windows EXE 链接 [MyGo](https://github.com/egoist/mygo)、构建所需的其他 Go 模块及 Go 工具链运行时代码。依赖版本由 `go.mod` 和 `go.sum` 约束。

[发布脚本](scripts/publish.ps1) 根据实际链接的模块与工具链收集对应版本的许可和声明原文，一并嵌入 EXE。可在“许可”页或用 `--operation notices` 查看。历史 ZIP 已附带对应的许可，历史源码可从原标签查看。

Node.js 用于维护汉化资源和执行参考测试，不随 EXE 分发；[开发依赖许可](licenses/README.md)保留已有 Node.js 快照。Babel parser 和 Playwright 仅由部分分析工具在开发机调用。

Antigravity 是独立的第三方应用。本项目不分发目标应用、提取资源或用户数据。
