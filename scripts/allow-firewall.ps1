$ErrorActionPreference = 'Stop'

$ruleName = 'Personal Markdown Notes (TCP 3210)'
$existingRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue

if (-not $existingRule) {
    New-NetFirewallRule `
        -DisplayName $ruleName `
        -Direction Inbound `
        -Action Allow `
        -Protocol TCP `
        -LocalPort 3210 `
        -Profile Private | Out-Null
    Write-Host "Created Windows Firewall rule: $ruleName"
} else {
    Write-Host "Windows Firewall rule already exists: $ruleName"
}

