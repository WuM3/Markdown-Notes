$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$androidDir = Join-Path $projectRoot "android"
$propertiesPath = Join-Path $androidDir "keystore.properties"

Push-Location $projectRoot
try {
  npm run android:sync
  if (-not (Test-Path -LiteralPath $propertiesPath)) {
    & (Join-Path $PSScriptRoot "setup-android-signing.ps1")
  }

  Push-Location $androidDir
  try {
    .\gradlew.bat assembleRelease
  }
  finally {
    Pop-Location
  }

  $apk = Join-Path $androidDir "app\build\outputs\apk\release\app-release.apk"
  if (-not (Test-Path -LiteralPath $apk)) {
    throw "Release APK was not generated: $apk"
  }

  $buildToolsRoot = Join-Path $env:ANDROID_HOME "build-tools"
  $apksigner = Get-ChildItem -LiteralPath $buildToolsRoot -Directory |
    Sort-Object Name -Descending |
    ForEach-Object { Join-Path $_.FullName "apksigner.bat" } |
    Where-Object { Test-Path -LiteralPath $_ } |
    Select-Object -First 1

  if (-not $apksigner) {
    throw "apksigner was not found. Check ANDROID_HOME and Android Build Tools."
  }

  & $apksigner verify --verbose --print-certs $apk
  Write-Host "Generated and verified APK: $apk"
}
finally {
  Pop-Location
}
