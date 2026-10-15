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
foreach ($projectNotice in @('LICENSE', 'THIRD_PARTY_NOTICES.md')) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $projectNotice) -Destination $publishDirectory -Force
}
$licenseDirectory = Join-Path $publishDirectory 'licenses'
New-Item -ItemType Directory -Path $licenseDirectory -Force | Out-Null
Copy-Item -Path (Join-Path $projectRoot 'licenses/*') -Destination $licenseDirectory -Recurse -Force
$nodeVersion = & $NodeExecutable --version
if ($nodeVersion -notmatch '^v\d+\.\d+\.\d+$') { throw '无法确定 Node.js 版本，不能获取对应许可证。' }
$nodeNotice = @(
    (Join-Path (Split-Path -Parent $NodeExecutable) 'LICENSE'),
    (Join-Path (Split-Path -Parent $NodeExecutable) 'LICENSE.txt'),
    (Join-Path $projectRoot ('licenses/Node.js/' + $nodeVersion.Substring(1) + '/LICENSE'))
) | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if ($nodeNotice) {
    Copy-Item -LiteralPath $nodeNotice -Destination (Join-Path $runtimeDirectory 'LICENSE') -Force
} else {
    Invoke-WebRequest -Uri "https://raw.githubusercontent.com/nodejs/node/$nodeVersion/LICENSE" -OutFile (Join-Path $runtimeDirectory 'LICENSE')
}
function Copy-PackageNotices {
    param([string]$PackageId, [string]$Version, [string]$DirectoryName, [string]$LicenseName, [string]$NoticeName)
    $packageDirectory = Join-Path $env:NUGET_PACKAGES ($PackageId.ToLowerInvariant() + '/' + $Version)
    $destination = Join-Path $licenseDirectory ($DirectoryName + '/' + $Version)
    New-Item -ItemType Directory -Path $destination -Force | Out-Null
    foreach ($name in @($LicenseName, $NoticeName) | Where-Object { $_ }) {
        $source = Join-Path $packageDirectory $name
        if (!(Test-Path -LiteralPath $source -PathType Leaf)) { throw "缺少依赖许可文件：$PackageId/$Version/$name，发布未完成。" }
        Copy-Item -LiteralPath $source -Destination $destination -Force
    }
}
# 使用发布后的依赖与运行时版本，避免把 SDK 许可当成程序运行时许可。
$dependencies = Get-Content -LiteralPath (Join-Path $publishDirectory 'AntigravityManager.deps.json') -Raw | ConvertFrom-Json
foreach ($package in $dependencies.libraries.PSObject.Properties) {
    $identity = $package.Name.Split('/')
    if ($identity[0] -in @('WPF-UI', 'WPF-UI.Abstractions')) {
        Copy-PackageNotices -PackageId $identity[0] -Version $identity[1] -DirectoryName $identity[0] -LicenseName 'LICENSE.md' -NoticeName 'ThirdPartyNotices.txt'
    }
}
if (!$FrameworkDependent) {
    $runtimeConfig = Get-Content -LiteralPath (Join-Path $publishDirectory 'AntigravityManager.runtimeconfig.json') -Raw | ConvertFrom-Json
    foreach ($framework in $runtimeConfig.runtimeOptions.includedFrameworks) {
        switch ($framework.name) {
            'Microsoft.NETCore.App' {
                Copy-PackageNotices -PackageId "Microsoft.NETCore.App.Runtime.$RuntimeIdentifier" -Version $framework.version -DirectoryName 'dotnet-runtime' -LicenseName 'LICENSE.TXT' -NoticeName 'THIRD-PARTY-NOTICES.TXT'
            }
            'Microsoft.WindowsDesktop.App' {
                Copy-PackageNotices -PackageId "Microsoft.WindowsDesktop.App.Runtime.$RuntimeIdentifier" -Version $framework.version -DirectoryName 'windowsdesktop' -LicenseName 'LICENSE'
            }
        }
    }
}
Write-Output "发布完成：$publishDirectory"
