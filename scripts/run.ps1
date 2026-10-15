$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$env:DOTNET_CLI_HOME = Join-Path $projectRoot 'artifacts/dotnet-home'
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
$env:DOTNET_GENERATE_ASPNET_CERTIFICATE = 'false'
$env:NUGET_PACKAGES = Join-Path $projectRoot 'artifacts/nuget/packages'
dotnet run --project (Join-Path $projectRoot 'src/AntigravityManager.Desktop/AntigravityManager.Desktop.csproj')
exit $LASTEXITCODE
