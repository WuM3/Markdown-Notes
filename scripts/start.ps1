$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $projectRoot

if (-not (Test-Path -LiteralPath '.env')) {
    Copy-Item -LiteralPath '.env.example' -Destination '.env'
}

if (-not (Test-Path -LiteralPath 'node_modules')) {
    npm install
}

if (-not (Test-Path -LiteralPath 'dist\server\index.js')) {
    npm run build
}

node dist/server/index.js

