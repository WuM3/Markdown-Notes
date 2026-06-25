$ErrorActionPreference = 'Stop'

$taskName = 'PersonalMarkdownNotes'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $projectRoot

if (-not (Test-Path -LiteralPath '.env')) {
    Copy-Item -LiteralPath '.env.example' -Destination '.env'
}

if (-not (Test-Path -LiteralPath 'node_modules')) {
    npm install
}

npm run build

$shellCommand = Get-Command 'pwsh.exe' -ErrorAction SilentlyContinue
if (-not $shellCommand) {
    $shellCommand = Get-Command 'powershell.exe' -ErrorAction Stop
}

$backgroundScript = Join-Path $projectRoot 'scripts\start-background.ps1'
$arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$backgroundScript`""
$action = New-ScheduledTaskAction -Execute $shellCommand.Source -Argument $arguments
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description 'Starts the personal Markdown notes server after Windows sign-in.' `
    -Force | Out-Null

Start-ScheduledTask -TaskName $taskName
Write-Host "Installed and started scheduled task: $taskName"

