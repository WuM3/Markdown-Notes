$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$androidDir = Join-Path $projectRoot "android"
$appDir = Join-Path $androidDir "app"
$keystorePath = Join-Path $appDir "markdown-notes-release.jks"
$propertiesPath = Join-Path $androidDir "keystore.properties"
$passwordPath = Join-Path $androidDir "signing-password.txt"

if (-not (Test-Path -LiteralPath $androidDir)) {
  throw "Android project not found. Run npm run android:sync first."
}

if ((Test-Path -LiteralPath $keystorePath) -and (Test-Path -LiteralPath $propertiesPath)) {
  Write-Host "Android signing files already exist."
  exit 0
}

$passwordBytes = New-Object byte[] 24
$random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
  $random.GetBytes($passwordBytes)
}
finally {
  $random.Dispose()
}
$password = [Convert]::ToBase64String($passwordBytes).Replace("/", "A").Replace("+", "B")

& keytool `
  -genkeypair `
  -v `
  -keystore $keystorePath `
  -storepass $password `
  -keypass $password `
  -alias markdown-notes `
  -keyalg RSA `
  -keysize 4096 `
  -validity 10000 `
  -dname "CN=Personal Markdown Notes, OU=Personal, O=Personal, L=Local, ST=Local, C=CN"

@"
storeFile=markdown-notes-release.jks
storePassword=$password
keyAlias=markdown-notes
keyPassword=$password
"@ | Set-Content -LiteralPath $propertiesPath -Encoding ASCII

@"
Personal Markdown Notes Android signing password

$password

Back up this file together with markdown-notes-release.jks.
Losing either file prevents future APKs from updating the installed app.
"@ | Set-Content -LiteralPath $passwordPath -Encoding ASCII

Write-Host "Signing keystore created: $keystorePath"
Write-Host "Password backup created: $passwordPath"
