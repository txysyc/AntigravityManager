# 打包与分发

[文档中心](README.md) / [开发指南](development.md) / 分发

当前采用 Windows x64 自包含目录与 ZIP 分发。使用者完整解压后即可运行，不需要安装 .NET 或 Node.js。

## 生成完整程序目录

```powershell
./scripts/publish.ps1
```

默认输出为 `artifacts/app/AntigravityManager/`。脚本先编译 Release 版本并包含 .NET 运行时，再复制汉化引擎、词库、版本配置、Node.js 与许可文件；首次还原依赖需要联网。

常用参数：

| 参数 | 用途 |
| --- | --- |
| `-OutputDirectory <目录>` | 指定新的发布目录，保留旧发行产物 |
| `-NodeExecutable <node.exe>` | 指定与目标架构一致的 Node.js，默认从 PATH 复制 |
| `-RuntimeIdentifier win-x64` | 指定发布目标；默认 Windows x64 |
| `-FrameworkDependent` | 省去随包 .NET，使用者需安装对应的 .NET Desktop Runtime |

发布脚本的核心命令如下；这条命令完成后，脚本还需要复制 Node.js、引擎与许可文件：

```powershell
dotnet publish src/AntigravityManager.Desktop/AntigravityManager.Desktop.csproj `
  -c Release -r win-x64 --self-contained true `
  --disable-build-servers -m:1 -o artifacts/app/AntigravityManager --nologo
```

## 三类产物

| 类型 | 默认位置 | 使用方式 |
| --- | --- | --- |
| 开发编译 | `src/AntigravityManager.Desktop/bin/Debug/net10.0-windows/` | EXE、DLL、PDB 和运行配置；依赖本机运行时及工作区引擎 |
| 完整发布 | `artifacts/app/AntigravityManager/` | 包含运行环境和项目资源，保留整个目录使用 |
| 独立汉化补丁 | `artifacts/localization/<应用版本>/<补丁版本>/` | `app.asar` 与 `manifest.json`，按已验证目标单独构建 |

典型发布目录：

```text
AntigravityManager/
├── AntigravityManager.exe
├── AntigravityManager.dll
├── AntigravityManager.*.dll
├── AntigravityManager.deps.json
├── AntigravityManager.runtimeconfig.json
├── *.dll / *.pdb                    # 运行时、依赖及调试符号
├── engines/localization/            # 汉化代码、词库和兼容配置
├── licenses/                        # 许可快照及实际依赖版本的完整原文
├── runtime/
│   ├── node.exe
│   └── LICENSE*
├── LICENSE                          # 本项目 MIT 许可
└── THIRD_PARTY_NOTICES.md            # 第三方组件说明
```

不能只复制 EXE。发布脚本不生成安装器，也不预先内置所有版本的补丁 ASAR；管理器安装汉化时根据已验证原版构建并缓存补丁。

项目及引擎的原创代码采用 MIT。发布脚本复制源码中的许可快照，并按 `deps.json` 与 `runtimeconfig.json` 的实际版本收集 WPF UI、.NET Runtime 和 Windows Desktop 的许可原文；Node.js 的完整许可保存在 `runtime/`。缺少必需许可会中止发布，不能只附链接或用本机 SDK 的许可替代运行时许可。组件来源见 [第三方声明](../THIRD_PARTY_NOTICES.md)。

## 制作 ZIP

已有完整发布目录可以直接压缩，不需要再次编译。以下以 0.1.3 的带版本目录为例；如果尚未生成，先运行 `./scripts/publish.ps1 -OutputDirectory artifacts/app/AntigravityManager-0.1.3`：

```powershell
New-Item -ItemType Directory -Path artifacts/releases -Force | Out-Null
Compress-Archive -LiteralPath artifacts/app/AntigravityManager-0.1.3 `
  -DestinationPath artifacts/releases/AntigravityManager-0.1.3-win-x64.zip `
  -CompressionLevel Optimal
```

文件名包含管理器版本和目标平台。ZIP 内保留一个顶层程序目录，包含全部依赖及许可文件；不打包管理器用户数据、原始备份、开发缓存或本地验证结果。

生成 SHA-256 校验文件：

```powershell
$zip = Get-Item artifacts/releases/AntigravityManager-0.1.3-win-x64.zip
$hash = (Get-FileHash -LiteralPath $zip.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText($zip.FullName + '.sha256', $hash + '  ' + $zip.Name + "`n", [Text.UTF8Encoding]::new($false))
```

正式分发前校验 ZIP 条目、数量和文件内容与源发布目录一致。已有正式归档不覆盖；原始备份保留规则见 [汉化规范](../spec/modules/localization.md)。

## GitHub 发行

1. 完成相关检查并提交源码，按 [Git 规范](../AGENTS.md) 创建对应发行标签。
2. 将标签上传到远程仓库，在 GitHub 为该标签创建 Release。
3. 上传 ZIP 和同名 `.zip.sha256`，填写对应管理器、补丁与目标应用版本。

GitHub 自动提供的源码归档不包含编译程序。运行文件通过 Release 附件分发，`artifacts/` 始终被 Git 忽略；不要把程序二进制或测试原始资源提交进仓库。

管理器与补丁独立编号，可在同一提交上分别标记发行版本。发行摘要见 [更新记录](../CHANGELOG.md)，测试与覆盖边界见 [测试指南](testing.md) 和 [历史报告](reports/README.md)。
