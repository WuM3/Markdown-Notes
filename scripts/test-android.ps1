$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$driveLetter = @("Z", "Y", "X", "W", "V", "U", "T") |
  Where-Object { -not (Test-Path "$($_):\") } |
  Select-Object -First 1

if (-not $driveLetter) {
  throw "No free drive letter is available for the Android test workspace."
}

$drive = "$driveLetter`:"
& subst.exe $drive $projectRoot
if ($LASTEXITCODE -ne 0) {
  throw "Failed to map the Android test workspace to $drive."
}

try {
  Push-Location "$drive\android"
  try {
    .\gradlew.bat test
    if ($LASTEXITCODE -ne 0) {
      throw "Android Gradle tests failed."
    }
  }
  finally {
    Pop-Location
  }
}
finally {
  & subst.exe $drive /d
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "Failed to remove the temporary drive mapping $drive."
  }
}
