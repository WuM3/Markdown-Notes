$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $projectRoot

if (-not (Test-Path -LiteralPath '.env')) {
    Copy-Item -LiteralPath '.env.example' -Destination '.env'
}

New-Item -ItemType Directory -Path 'data' -Force | Out-Null
$logPath = Join-Path $projectRoot 'data\server.log'

node dist/server/index.js *>> $logPath

