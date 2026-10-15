# 项目架构

管理器采用 C#/.NET 10、WPF 与 WPF UI。汉化作为第一个内置模块，复用现有 Node.js 引擎。应用按需打开，不提供代理接管或后台常驻功能。

## 项目依赖

```text
Desktop ──→ Core
   ├──────→ Infrastructure ──→ Core
   └──────→ Modules.Localization ──→ Core / Infrastructure
                                      │
                                      └── NodeEngineClient → JSON CLI → localization engine
```

`Core` 不引用 WPF 或 Node.js，定义模块描述、模块注册和结果契约。`Infrastructure` 处理工作区发现、设置保存和后台进程通信。`Modules.Localization` 限定可执行的汉化操作。`Desktop` 是组合入口，壳层只负责概览、模块导航、全局设置和主题。`Desktop/Modules/Localization/` 自包含汉化视图、视图模型、命令、状态、备份与操作记录；`MainViewModel` 不实现汉化维护操作。

## 模块与界面扩展

首版使用显式注册的内置模块。新增功能时：

1. 创建 `src/AntigravityManager.Modules.<功能>/`，实现 `IManagerModule`，声明唯一模块 ID。
2. 按需扩展共享结果契约，或将新功能的具体数据契约放在自己的模块中。
3. 在 `Desktop/App.xaml.cs` 的组合入口注册模块。
4. 在 `Desktop/Modules/<功能>/` 添加对应视图和视图模型，并接入 `MainViewModel` 与 `MainWindow.xaml` 的导航映射。模块自己的检查、备份、恢复和操作记录留在模块内；通用设置留在壳层。侧栏按工作台、功能模块与管理分组。
5. 补充模块自身的边界测试和一条完整操作链路验证。

后台模块注册和页面注册是两个职责。当前没有实现外部 DLL 热加载、在线插件仓库或第三方代码执行入口。汉化的现有结果模型将随后续模块需求继续演进，不承诺首版 ABI 稳定。

## 汉化引擎通信

桌面程序每次任务启动一个 Node.js 子进程，使用 `ProcessStartInfo.ArgumentList` 传参，不经过命令行 shell 拼接。标准输出只返回一个 JSON 对象：

```json
{
  "success": true,
  "message": "检查完成。",
  "snapshot": {
    "version": "2.23.1",
    "status": "unsupported",
    "canInstall": false,
    "canRestore": false
  }
}
```

状态检查、差异检查、备份清单、安装、恢复对应 `inspect`、`compare`、`backups`、`install`、`restore`。引擎任务完成后进程退出。界面异步等待任务，使用忙碌状态阻止重复操作；任务进行中不允许关闭窗口，避免中断文件替换。

## 版本与文件替换

兼容性依据应用身份、版本和 ASAR SHA-256。指纹不匹配时禁止安装；原生锚点匹配只是报告信息，不会自动授予兼容资格。

每次写操作先检查目标应用进程，使用管理器数据目录中的独占锁；原始备份按版本和原始指纹保存。补丁写入同目录临时文件，替换前再次检查当前文件指纹，通过后重命名。备份与补丁本身都经过 SHA-256 校验。并发更新、未知文件、损坏备份或文件占用导致失败时，不继续覆盖。

若进程异常结束留下 `localization.lock`，需确认不存在进行中的管理任务后手动清理锁。首版不自动判断陈旧锁，以免误解锁正在运行的其他管理器实例。

## 路径与数据

源码通过入口文件或 `__dirname` 计算相对路径，桌面程序从可执行文件向上查找 `engines/localization/cli.cjs`。发布包在 EXE 旁包含该目录。`ANTIGRAVITY_MANAGER_HOME` 可用于明确指定管理器资源根目录。

应用安装目录来自用户设置，默认使用用户本地应用目录。数据目录默认是 `%LOCALAPPDATA%/AntigravityManager`，与项目根目录名无关。GUI 验证可用 `--data-dir` 指向独立目录，不写真实管理器配置。

## 已知边界

- 仅适配 Windows，目前发布脚本默认 x64。
- 仅验证了 Antigravity 2.23.0 的旧汉化指纹；2.23.1 尚未适配。
- 差异报告仅包含已保存基线的 Electron 模块，不代表前端和全工作流兼容。
- 外观主题和设置已提供；尚未实现系统主题自动跟随。
- 内置模块接口和导航已建立；外部插件加载尚未实现。
- 新管理器不修改 Antigravity 的实际安装，除非用户执行受支持版本的安装或恢复操作。

旧汉化实现的逆向依据见 [历史分析](reports/reverse-engineering-2.23.0.md)。

## 模块页面与版本信息

汉化模块内部提供“汉化概况 / 版本检查 / 备份与恢复 / 操作记录”。概览不呈现汉化专属状态和备份统计。模块页标题旁持续展示可用补丁版本，已安装补丁另列；管理器版本取自程序集，补丁版本取自引擎 package.json，避免将软件版本与补丁版本混淆。文件指纹默认折叠，差异表与页面共用滚动容器。

## 数据目录切换

`ManagerEnvironment` 通过固定引导目录中的 location.json 解析数据位置。显式 --data-dir 使用独立引导位置，不覆盖真实用户配置。迁移先取得管理器独占访问锁与引擎 localization.lock，拒绝非空目标、相互包含的目录及重解析点。复制到目标同级的随机暂存目录后，逐文件比较 SHA-256，再提交目标目录与定位文件。只有定位文件切换成功才更新当前环境；原始目录始终保留，失败副本保留供恢复，可能需要手动清理。

其他管理器实例在操作前检查定位文件，发现目录已切换则要求重启；CLI 未指定 --data-dir 时也读取同一个定位文件。新汉化记录位于 localization/tasks.json，旧预览版根目录 tasks.json 在新记录不存在时继续读取。
