param([string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$stage = $null
$env:CGO_ENABLED = '0'
$env:GOOS = 'windows'
$env:GOARCH = 'amd64'
$env:GOTOOLCHAIN = 'local'
Push-Location -LiteralPath $root
try {
    $version = (Get-Content -Raw -LiteralPath 'package.json' | ConvertFrom-Json).version
    if ($version -notmatch '^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$') { throw '管理器版本无效。' }
    $output = if ($OutputDirectory) { [IO.Path]::GetFullPath($OutputDirectory) } else { Join-Path $root 'output' }
    $null = New-Item -ItemType Directory -Path $output -Force
    $exe = Join-Path $output "AntigravityManager-$version-win-x64.exe"
    $checksum = "$exe.sha256"
    if ((Test-Path -LiteralPath $exe) -or (Test-Path -LiteralPath $checksum)) { throw '发行文件已存在，请指定新的输出目录。' }
    # go test ./... 会跳过点号目录，打包和测试可并行运行。
    $stage = Join-Path $root ('artifacts/.go-package-' + [Guid]::NewGuid().ToString('N'))
    $null = New-Item -ItemType Directory -Path $stage -Force

    node engines/localization/scripts/generate-go-payload.cjs --check
    if ($LASTEXITCODE -ne 0) { throw '内置汉化资源检查失败。' }
    $modules = @(go list -mod=readonly -deps -f '{{with .Module}}{{if not .Main}}{{.Path}}|{{.Version}}|{{.Dir}}{{end}}{{end}}' ./src | Where-Object { $_ } | Sort-Object -Unique)
    if ($LASTEXITCODE -ne 0 -or !$modules) { throw '无法确定实际链接的 Go 模块。' }
    $goRoot = go env GOROOT
    if ($LASTEXITCODE -ne 0 -or !$goRoot) { throw '无法确定 Go 工具链。' }
    $noticeFile = Join-Path $stage 'notices.txt'
    $notices = [IO.File]::Create($noticeFile)
    function Add-Text([string]$Value) {
        $bytes = [Text.Encoding]::UTF8.GetBytes($Value)
        $notices.Write($bytes, 0, $bytes.Length)
    }
    function Add-Licenses([string]$Label, [string]$Directory) {
        $items = @(Get-ChildItem -LiteralPath $Directory -File | Where-Object { $_.Name -match '^(LICENSE|COPYING|NOTICE|PATENTS)([._-].*)?$' } | Sort-Object Name)
        if (!($items | Where-Object { $_.Name -match '^(LICENSE|COPYING)([._-].*)?$' })) { throw "缺少许可原文：$Label" }
        foreach ($file in $items) {
            Add-Text "`n===== $Label / $($file.Name) =====`n"
            $bytes = [IO.File]::ReadAllBytes($file.FullName)
            $notices.Write($bytes, 0, $bytes.Length)
            Add-Text "`n"
        }
    }
    try {
        Add-Text "Antigravity Manager $version — project and third-party notices`n"
        Add-Licenses 'Antigravity Manager (MIT)' $root
        Add-Licenses (go version) $goRoot
        foreach ($row in $modules) {
            $name, $release, $path = $row -split '\|', 3
            Add-Licenses "$name $release" $path
        }
    } finally {
        $notices.Dispose()
    }
    $replacement = @{}
    $replacement[(Join-Path $root 'src/notices.txt')] = $noticeFile
    $overlay = Join-Path $stage 'overlay.json'
    @{ Replace = $replacement } | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $overlay -Encoding utf8NoBOM
    $binary = Join-Path $stage 'AntigravityManager.exe'
    go build -mod=readonly -overlay $overlay -trimpath -ldflags '-s -w -H windowsgui' -o $binary ./src
    if ($LASTEXITCODE -ne 0) { throw 'Windows x64 单文件构建失败。' }
    $text = & $binary --operation notices | Out-String
    if ($LASTEXITCODE -ne 0 -or $text -notmatch 'github.com/egoist/mygo' -or $text -notmatch 'Go Authors') {
        throw '单文件缺少嵌入的许可原文。'
    }
    [IO.File]::Copy($binary, $exe, $false)
    $hash = (Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant()
    [IO.File]::WriteAllText($checksum, "$hash  $([IO.Path]::GetFileName($exe))`n")
    Get-Item -LiteralPath $exe, $checksum
} finally {
    if ($stage -and (Test-Path -LiteralPath $stage -PathType Container)) {
        foreach ($name in 'notices.txt', 'overlay.json', 'AntigravityManager.exe') {
            [IO.File]::Delete((Join-Path $stage $name))
        }
        [IO.Directory]::Delete($stage)
    }
    Pop-Location
}
