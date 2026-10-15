# 资源与工作区维护

[文档中心](README.md) / [开发指南](development.md) / 维护

## 品牌图标

源文件为 `src/AntigravityManager.Desktop/Assets/Branding/app-icon.svg`。修改后，在 Windows 上使用 PowerShell 7 生成衍生资源：

```powershell
pwsh -NoProfile -STA -File tools/assets/generate-icons.ps1
```

脚本使用 Windows WPF 渲染路径、圆角矩形与线性渐变，无需额外图像库；只支持当前品牌 SVG 所需元素，不是通用 SVG 转换器。

| 文件 | 用途 |
| --- | --- |
| `app-icon.svg` | 可编辑的唯一矢量源 |
| `app-icon.png` | 512 像素，供标题栏与侧栏使用 |
| `app-icon.ico` | 16、20、24、32、40、48、64、128、256 像素，供 EXE 与窗口使用 |

修改 SVG 时同步更新 PNG 和 ICO。图标作为程序资源嵌入，普通编译使用仓库内的衍生文件，不需要运行生成脚本或另行复制图标到发布目录。

## 文档截图

项目首页使用 `docs/assets/screenshots/overview-light.png` 和 `overview-dark.png`。图片来自真实管理器窗口，在独立数据目录下运行 [GUI 验证](testing.md#管理器-gui) 生成，不改动真实用户配置。

更新界面后重新生成并检查明暗主题，保持截图与当前产品一致。不要把组件样本或设计稿描述为真实产品截图；截图中的应用路径、备份数与状态是当次隔离环境的观察。

## 本地产物

产物分类与保留规则见 [架构规范](../spec/architecture.md)。本地 `artifacts/README.md` 索引发布包、补丁、证据与归档；它不随 Git 分发，可按实际环境重建。

| 目录 | 内容 |
| --- | --- |
| `artifacts/app/` | 当前与历史发布目录 |
| `artifacts/releases/` | ZIP、校验文件与分发验证记录 |
| `artifacts/localization/` | 按应用及补丁版本隔离的补丁 |
| `artifacts/fixtures/` | 已验证测试基线 |
| `artifacts/archive/` | 已结束的一次性验证记录 |

## 整理与归档

已结束的验证目录可移入 `artifacts/archive/<批次>/`，保存含原路径与逐文件 SHA-256 的 `manifest.json`，归档前后核对内容。历史安装记录中的绝对路径不自动改写，恢复使用前需重新核对路径与指纹。

正在使用的发布目录、测试基线、报告引用的证据及原始备份保持可定位。`artifacts/tests/` 仅在确认是已结束的临时样本后清理；`artifacts/checks/` 可能含迁移测试目录链接，不做无差别递归删除。

不要使用 `git clean -fdx` 统一清理工作区，也不要自动删除可能仍有效的操作锁。旧工程路径对应关系见 [工作区迁移](workspace-migration.md)。
