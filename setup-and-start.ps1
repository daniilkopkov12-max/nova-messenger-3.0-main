$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path $root '.env'
if (!(Test-Path (Join-Path $root 'package.json'))) {
  Write-Host 'Не найден package.json. Запусти setup-and-start.bat из корневой папки проекта.' -ForegroundColor Red
  exit 1
}
if (!(Test-Path $envFile)) {
  if (Test-Path (Join-Path $root '.env.example')) { Copy-Item (Join-Path $root '.env.example') $envFile }
  else { New-Item -ItemType File -Path $envFile | Out-Null }
}
$appName = Read-Host 'Домен Metered из панели (например, nova-messenger.metered.live)'
$appName = $appName.Trim() -replace '^https?://','' -replace '/.*$',''
if ($appName -notmatch '^[a-zA-Z0-9.-]+\.metered\.live$') {
  Write-Host 'Домен не похож на имя приложения Metered вида name.metered.live.' -ForegroundColor Red
  exit 1
}
$secureKey = Read-Host 'НОВЫЙ API key Metered (не используй опубликованный старый ключ)' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
try { $apiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
if ([string]::IsNullOrWhiteSpace($apiKey) -or $apiKey -match '[\r\n]') {
  Write-Host 'API key пустой или недопустимый.' -ForegroundColor Red
  exit 1
}
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
Copy-Item $envFile "$envFile.bak-$stamp"
$envText = [IO.File]::ReadAllText($envFile)
foreach ($entry in @(@{Name='METERED_APP_NAME'; Value=$appName}, @{Name='METERED_API_KEY'; Value=$apiKey})) {
  $pattern = '(?m)^\s*' + [regex]::Escape($entry.Name) + '=.*$'
  $line = $entry.Name + '=' + $entry.Value
  if ([regex]::IsMatch($envText, $pattern)) {
    $regex = [regex]::new($pattern)
    $envText = $regex.Replace($envText, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $line }, 1)
  } else {
    if ($envText.Length -gt 0 -and !$envText.EndsWith("`n")) { $envText += "`r`n" }
    $envText += $line + "`r`n"
  }
}
[IO.File]::WriteAllText($envFile, $envText, (New-Object System.Text.UTF8Encoding($false)))
Write-Host 'Настройки Metered сохранены в корневой .env.' -ForegroundColor Green
Write-Host 'Запускаю frontend и backend. Не закрывай это окно.' -ForegroundColor Cyan
Set-Location $root
npm run dev
