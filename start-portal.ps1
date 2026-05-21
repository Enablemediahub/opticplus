$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendPath = Join-Path $root 'opticplus-backend'
$frontendPath = Join-Path $root 'opticplus-frontend'

if (-not (Test-Path $backendPath)) {
    throw "Backend folder not found: $backendPath"
}

if (-not (Test-Path $frontendPath)) {
    throw "Frontend folder not found: $frontendPath"
}

$phpCommand = Get-Command php -ErrorAction SilentlyContinue
if (-not $phpCommand) {
    throw "PHP was not found in PATH. Start XAMPP or add PHP to PATH first."
}

$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npmCommand) {
    throw "npm.cmd was not found in PATH. Install Node.js or add it to PATH first."
}

$backendTitle = 'OPTICPLUS Backend'
$frontendTitle = 'OPTICPLUS Frontend'

$backendScript = @"
Set-Location '$backendPath'
`$host.UI.RawUI.WindowTitle = '$backendTitle'
php artisan serve --host=127.0.0.1 --port=8000
"@

$frontendScript = @"
Set-Location '$frontendPath'
`$host.UI.RawUI.WindowTitle = '$frontendTitle'
npm.cmd run dev -- --host 127.0.0.1 --port 5173
"@

Start-Process powershell.exe -ArgumentList '-NoExit', '-Command', $backendScript | Out-Null
Start-Process powershell.exe -ArgumentList '-NoExit', '-Command', $frontendScript | Out-Null

Write-Host 'OPTICPLUS servers are starting in separate windows...'
Write-Host 'Backend:  http://127.0.0.1:8000'
Write-Host 'Frontend: http://127.0.0.1:5173'
