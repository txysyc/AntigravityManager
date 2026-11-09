#Requires -Version 7.0
param(
    [string]$OutputDirectory,
    [string]$NodeExecutable
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$outputRoot = if ($OutputDirectory) { [IO.Path]::GetFullPath($OutputDirectory) } else { Join-Path $projectRoot 'artifacts/releases' }
$version = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
[xml]$buildProperties = Get-Content -LiteralPath (Join-Path $projectRoot 'Directory.Build.props') -Raw
if ($version -notmatch '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$' -or $version -cne $buildProperties.Project.PropertyGroup.Version) {
    throw '管理器版本无效，或 package.json 与 Directory.Build.props 版本不一致。'
}

$packageName = "AntigravityManager-$version"
$archivePath = Join-Path $outputRoot "$packageName-win-x64.zip"
$checksumPath = "$archivePath.sha256"
if ((Test-Path -LiteralPath $archivePath) -or (Test-Path -LiteralPath $checksumPath)) {
    throw '发行 ZIP 或校验文件已存在，不能覆盖。'
}
$stagingRoot = Join-Path $outputRoot ('staging-' + [guid]::NewGuid().ToString('N'))
$publishDirectory = Join-Path $stagingRoot $packageName
& (Join-Path $PSScriptRoot 'publish.ps1') -OutputDirectory $publishDirectory -RuntimeIdentifier win-x64 -NodeExecutable $NodeExecutable

$manager = Get-Item -LiteralPath (Join-Path $publishDirectory 'AntigravityManager.exe')
if (($manager.VersionInfo.ProductVersion -split '\+', 2)[0] -cne $version) {
    throw '编译产物的版本与发行版本不一致。'
}

$tempArchive = Join-Path $stagingRoot 'release.zip'
[IO.Compression.ZipFile]::CreateFromDirectory($publishDirectory, $tempArchive, [IO.Compression.CompressionLevel]::Optimal, $true)
$files = Get-ChildItem -LiteralPath $publishDirectory -File -Force -Recurse
$zip = [IO.Compression.ZipFile]::OpenRead($tempArchive)
try {
    if (@($zip.Entries | Where-Object Name).Count -ne @($files).Count) {
        throw 'ZIP 文件数量与发布目录不一致。'
    }
    foreach ($file in $files) {
        $relative = [IO.Path]::GetRelativePath($publishDirectory, $file.FullName).Replace('\', '/')
        $entry = $zip.GetEntry("$packageName/$relative")
        if (!$entry -or $entry.Length -ne $file.Length) { throw "ZIP 中缺少文件或文件大小不一致：$relative" }
        $stream = $entry.Open()
        try {
            if ((Get-FileHash -InputStream $stream -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash) {
                throw "ZIP 中的文件内容不一致：$relative"
            }
        } finally {
            $stream.Dispose()
        }
    }
} finally {
    $zip.Dispose()
}

$hash = (Get-FileHash -LiteralPath $tempArchive -Algorithm SHA256).Hash.ToLowerInvariant()
$tempChecksum = "$tempArchive.sha256"
[IO.File]::WriteAllText($tempChecksum, $hash + '  ' + [IO.Path]::GetFileName($archivePath) + [char]10)
[IO.File]::Move($tempArchive, $archivePath)
[IO.File]::Move($tempChecksum, $checksumPath)
Write-Output "发行包：$archivePath"
Write-Output "校验文件：$checksumPath"
