$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendPath = Join-Path $root 'opticplus-backend'
$frontendPath = Join-Path $root 'opticplus-frontend'
$runtimePath = Join-Path $root '.portal-runtime'

function Write-Step {
    param([string]$Message)
    Write-Host "==> $Message"
}

function Ensure-Command {
    param(
        [string]$Name,
        [string]$Hint
    )

    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $command) {
        throw "$Name was not found in PATH. $Hint"
    }

    return $command.Source
}

function Ensure-BackendReady {
    param([string]$BackendPath)

    $autoloadPath = Join-Path $BackendPath 'vendor\autoload.php'
    if (-not (Test-Path $autoloadPath)) {
        Write-Step 'Installing backend dependencies with Composer...'
        Push-Location $BackendPath
        try {
            & composer install --no-interaction
        } finally {
            Pop-Location
        }
    }

    if (-not (Test-Path $autoloadPath)) {
        throw "Backend dependencies are still missing at $autoloadPath. Run 'composer install' in opticplus-backend."
    }

    $envPath = Join-Path $BackendPath '.env'
    if (-not (Test-Path $envPath)) {
        Write-Step 'Creating backend .env from .env.example...'
        Copy-Item (Join-Path $BackendPath '.env.example') $envPath
    }

    $envContent = Get-Content $envPath -Raw
    if ($envContent -notmatch 'APP_KEY=base64:[A-Za-z0-9+/=]+') {
        Write-Step 'Generating Laravel APP_KEY...'
        Push-Location $BackendPath
        try {
            & php artisan key:generate --force | Out-Null
        } finally {
            Pop-Location
        }
    }
}

function Ensure-FrontendReady {
    param([string]$FrontendPath)

    $vitePath = Join-Path $FrontendPath 'node_modules\vite\bin\vite.js'
    if (-not (Test-Path $vitePath)) {
        Write-Step 'Installing frontend dependencies with npm...'
        Push-Location $FrontendPath
        try {
            & npm.cmd install
        } finally {
            Pop-Location
        }
    }

    if (-not (Test-Path $vitePath)) {
        throw "Frontend dependencies are still missing. Run 'npm install' in opticplus-frontend."
    }
}

function Start-PortalWindow {
    param(
        [string]$Title,
        [string]$WorkingDirectory,
        [string]$Command
    )

    if (-not (Test-Path $runtimePath)) {
        New-Item -ItemType Directory -Path $runtimePath | Out-Null
    }

    $scriptPath = Join-Path $runtimePath ("start-{0}.ps1" -f ($Title -replace '\s+', '-').ToLower())
    $scriptContent = @"
`$ErrorActionPreference = 'Stop'
Set-Location '$WorkingDirectory'
`$host.UI.RawUI.WindowTitle = '$Title'
$Command
"@

    Set-Content -Path $scriptPath -Value $scriptContent -Encoding UTF8
    Start-Process powershell.exe -ArgumentList '-NoExit', '-ExecutionPolicy', 'Bypass', '-File', $scriptPath | Out-Null
}

if (-not (Test-Path $backendPath)) {
    throw "Backend folder not found: $backendPath"
}

if (-not (Test-Path $frontendPath)) {
    throw "Frontend folder not found: $frontendPath"
}

Ensure-Command -Name 'php' -Hint 'Start XAMPP or add PHP to PATH first.' | Out-Null
Ensure-Command -Name 'npm.cmd' -Hint 'Install Node.js or add it to PATH first.' | Out-Null
Ensure-Command -Name 'composer' -Hint 'Install Composer or add it to PATH first.' | Out-Null

Ensure-BackendReady -BackendPath $backendPath
Ensure-FrontendReady -FrontendPath $frontendPath

Start-PortalWindow -Title 'OPTICPLUS Backend' -WorkingDirectory $backendPath -Command 'php artisan serve --host=127.0.0.1 --port=8000'
Start-PortalWindow -Title 'OPTICPLUS Frontend' -WorkingDirectory $frontendPath -Command 'npm.cmd run dev -- --host 127.0.0.1 --port 5173'

Write-Host ''
Write-Host 'OPTICPLUS servers are starting in separate windows...'
Write-Host 'Backend:  http://127.0.0.1:8000'
Write-Host 'Frontend: http://127.0.0.1:5173'
