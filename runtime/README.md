# Node.js 运行时

开发时管理器优先查找本目录的 `node.exe`，不存在时使用 PATH 中的 Node.js。

`scripts/publish.ps1` 会把指定或当前 PATH 中的 Node.js 复制进发布目录。运行时属于本地构建产物，不纳入 Git。打包必须选择与发布目标架构相符的 Node.js。
