param(
    [string]$RuntimeIdentifier = 'win-x64',
    [switch]$FrameworkDependent,
    [string]$NodeExecutable,
    [string]$OutputDirectory
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$publishDirectory = if ($OutputDirectory) { [System.IO.Path]::GetFullPath($OutputDirectory) } else { Join-Path $projectRoot 'artifacts/app/AntigravityManager' }
$env:DOTNET_CLI_HOME = Join-Path $projectRoot 'artifacts/dotnet-home'
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
$env:DOTNET_GENERATE_ASPNET_CERTIFICATE = 'false'
$env:NUGET_PACKAGES = Join-Path $projectRoot 'artifacts/nuget/packages'
$selfContained = if ($FrameworkDependent) { 'false' } else { 'true' }
if (!$NodeExecutable) { $NodeExecutable = (Get-Command node.exe -ErrorAction Stop).Source }
$NodeExecutable = (Resolve-Path -LiteralPath $NodeExecutable).Path
if ((Split-Path -Leaf $NodeExecutable) -ne 'node.exe') { throw 'NodeExecutable 必须指向 node.exe。' }
$nodeArchitecture = & $NodeExecutable --print process.arch
if ($RuntimeIdentifier -ne "win-$nodeArchitecture") { throw 'Node.js 架构必须与 RuntimeIdentifier 一致。' }
dotnet publish (Join-Path $projectRoot 'src/AntigravityManager.Desktop/AntigravityManager.Desktop.csproj') -c Release -r $RuntimeIdentifier --self-contained $selfContained --disable-build-servers -m:1 -o $publishDirectory --nologo
if ($LASTEXITCODE -ne 0) { throw '桌面程序发布失败，请检查构建输出。' }
$engineDestination = Join-Path $publishDirectory 'engines/localization'
New-Item -ItemType Directory -Path $engineDestination -Force | Out-Null
foreach ($directory in @('src','scripts','translations','profiles')) {
    $destination = Join-Path $engineDestination $directory
    New-Item -ItemType Directory -Path $destination -Force | Out-Null
    Copy-Item -Path (Join-Path $projectRoot "engines/localization/$directory/*") -Destination $destination -Recurse -Force
}
foreach ($file in @('cli.cjs','package.json')) { Copy-Item -LiteralPath (Join-Path $projectRoot "engines/localization/$file") -Destination $engineDestination -Force }
$runtimeDirectory = Join-Path $publishDirectory 'runtime'
New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
Copy-Item -LiteralPath $NodeExecutable -Destination (Join-Path $runtimeDirectory 'node.exe') -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'THIRD_PARTY_NOTICES.md') -Destination $publishDirectory -Force
foreach ($licenseName in @('LICENSE','LICENSE.txt')) {
    $licensePath = Join-Path (Split-Path -Parent $NodeExecutable) $licenseName
    if (Test-Path -LiteralPath $licensePath) { Copy-Item -LiteralPath $licensePath -Destination (Join-Path $runtimeDirectory $licenseName) -Force }
}
if (!(Test-Path -LiteralPath (Join-Path $runtimeDirectory 'LICENSE')) -and !(Test-Path -LiteralPath (Join-Path $runtimeDirectory 'LICENSE.txt'))) {
    $nodeVersion = & $NodeExecutable --version
    if ($nodeVersion -notmatch '^v\d+\.\d+\.\d+$') { throw '无法确定 Node.js 版本，不能获取对应许可证。' }
    Invoke-WebRequest -Uri "https://raw.githubusercontent.com/nodejs/node/$nodeVersion/LICENSE" -OutFile (Join-Path $runtimeDirectory 'LICENSE')
}
Copy-Item -LiteralPath (Join-Path $projectRoot 'artifacts/nuget/packages/wpf-ui/4.3.0/LICENSE.md') -Destination (Join-Path $publishDirectory 'WPF-UI-LICENSE.md') -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'artifacts/nuget/packages/wpf-ui/4.3.0/ThirdPartyNotices.txt') -Destination (Join-Path $publishDirectory 'WPF-UI-ThirdPartyNotices.txt') -Force
$dotnetDirectory = Split-Path -Parent (Get-Command dotnet.exe -ErrorAction Stop).Source
foreach ($noticeName in @('LICENSE.txt','ThirdPartyNotices.txt')) {
    $noticePath = Join-Path $dotnetDirectory $noticeName
    if (Test-Path -LiteralPath $noticePath) { Copy-Item -LiteralPath $noticePath -Destination (Join-Path $publishDirectory "DOTNET-$noticeName") -Force }
}
Write-Output "发布完成：$publishDirectory"
