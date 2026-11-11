param([string]$AppDirectory, [string]$DataDirectory)
$ErrorActionPreference = 'Stop'
$env:CGO_ENABLED = '0'
$env:GOTOOLCHAIN = 'local'
$arguments = @()
if ($AppDirectory) { $arguments += @('--app-dir', $AppDirectory) }
if ($DataDirectory) { $arguments += @('--data-dir', $DataDirectory) }
Push-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
try {
    go run ./src @arguments
    if ($LASTEXITCODE -ne 0) { throw '无法运行 Go 管理器。' }
} finally {
    Pop-Location
}
