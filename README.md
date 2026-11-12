<div align="center">

<img src="assets/branding/app-icon.svg" width="96" height="96" alt="Antigravity Manager">

# Antigravity Manager

**让 Antigravity 的日常维护更简单。**

Windows 桌面管理器 · 模块化功能 · 简体中文汉化

<img src="https://img.shields.io/badge/Windows-x64-0078D4?style=flat-square" alt="Windows x64">
<img src="https://img.shields.io/badge/Go-MyGo-00ADD8?style=flat-square" alt="Go 和 MyGo">
<a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="MIT License"></a>

[快速开始](#快速开始) · [使用指南](docs/user-guide.md) · [开发指南](docs/development.md)

</div>

## 功能一览

Antigravity Manager 将维护操作集中在独立模块中。当前提供简体中文汉化模块，后续功能可通过统一接口接入。

| 界面汉化 | 版本检查 | 备份与恢复 |
| --- | --- | --- |
| 安装、修复汉化补丁，支持中英文切换 | 识别应用版本与文件指纹，区分可用和已安装补丁 | 按应用版本保存原始备份，校验后恢复 |

管理器提供操作记录、明暗主题和数据目录迁移。按需打开，维护完成即可关闭，日常启动继续使用原有快捷方式或代理启动器。

## 快速开始

**Windows x64 · 单 EXE · 无需安装额外运行时**

1. 从 [GitHub Releases](https://github.com/txysyc/AntigravityManager/releases) 下载已发布的版本，或按[开发指南](docs/development.md#启动与打包)构建单文件。历史 ZIP 需完整解压。
2. 运行管理器 EXE，在“设置”中确认 Antigravity 安装目录。
3. 打开“界面汉化”检查兼容性，完全退出 Antigravity 后执行“安装／修复汉化”。
4. 按原有方式启动 Antigravity。需要撤销时，在“界面汉化”中恢复原版。

源码下载不包含已编译程序。新版本适配的验证范围见[更新记录](CHANGELOG.md)。

### 本地源码版本与兼容范围

| 管理器 | 内置汉化补丁 | 已适配的 Antigravity |
| --- | --- | --- |
| **0.4.2** 本地预览 | **0.3.2** | Windows **2.23.0 / 2.23.1 / 2.29.0 / 2.31.2** |

上表对应当前源码构建。能否安装以管理器的指纹检查为准，详见 [使用指南](docs/user-guide.md#管理汉化)。

## 开发

准备 Windows、Go 1.27.3 或更新版本、PowerShell 7 和 Node.js，进入仓库根目录运行：

```powershell
pwsh -File scripts/publish.ps1
```

脚本将单 EXE 和 SHA-256 校验文件放到 `output/`。Go 源码在 `src/`，开发时可用 `./scripts/run.ps1` 启动。

## 文档与反馈

- **使用**：[使用指南](docs/user-guide.md) · [更新记录](CHANGELOG.md)
- **开发**：[开发指南](docs/development.md) · [测试与验证](docs/testing.md) · [项目规范](spec/README.md)
- **查证据**：[历史适配摘要](analysis/reports/README.md)

反馈问题时请提供复现步骤、相关截图，以及管理器、补丁和 Antigravity 的版本。参与贡献前请阅读 [协作规范](AGENTS.md)。

## 许可证

本项目原创代码采用 [MIT 许可证](LICENSE)，允许商用、修改、分发及闭源使用，需保留版权和许可声明。第三方组件适用各自的许可证，清单与本地许可原文见 [第三方声明](THIRD_PARTY_NOTICES.md)。

---

<sub>本项目为独立的非官方工具，与 Antigravity 官方无隶属关系。第三方组件说明见 <a href="THIRD_PARTY_NOTICES.md">THIRD_PARTY_NOTICES.md</a>。</sub>
