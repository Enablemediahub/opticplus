$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendPath = Join-Path $root 'opticplus-frontend'
$backendPublicPath = Join-Path $root 'opticplus-backend\public'
$backendEnvTemplatePath = Join-Path $root 'opticplus-backend\.env.hostinger.example'
$frontendDistPath = Join-Path $frontendPath 'dist'
$deployPath = Join-Path $root 'tmp\hostinger-package'
$deployLaravelPublic = Join-Path $deployPath 'public'

if (-not (Test-Path $frontendPath)) {
    throw "Frontend folder not found: $frontendPath"
}

if (-not (Test-Path $backendPublicPath)) {
    throw "Backend public folder not found: $backendPublicPath"
}

Push-Location $frontendPath
try {
    npm.cmd run build
}
finally {
    Pop-Location
}

if (Test-Path $deployPath) {
    Remove-Item -LiteralPath $deployPath -Recurse -Force
}

# Ensure the deployment folders exist before copying.
New-Item -ItemType Directory -Path $deployPath -Force | Out-Null
New-Item -ItemType Directory -Path $deployLaravelPublic -Force | Out-Null

Copy-Item -Path (Join-Path $root 'opticplus-backend\*') -Destination $deployPath -Recurse -Force
# SPA must live in Laravel `public/` (see routes/web.php: public_path('index.html')).
# A separate public_html-only upload serves no PHP and makes /api/* return 404.
Copy-Item -Path (Join-Path $frontendDistPath '*') -Destination $deployLaravelPublic -Recurse -Force

# Never ship the local backend .env in the deploy bundle.
$deployEnvPath = Join-Path $deployPath '.env'
if (Test-Path $deployEnvPath) {
    Remove-Item -LiteralPath $deployEnvPath -Force
}

if (Test-Path $backendEnvTemplatePath) {
    Copy-Item -LiteralPath $backendEnvTemplatePath -Destination (Join-Path $deployPath '.env.hostinger.example') -Force
    Copy-Item -LiteralPath $backendEnvTemplatePath -Destination (Join-Path $deployPath '.env.example') -Force
}

Write-Host 'Hostinger package prepared.'
Write-Host "Upload the full folder: $deployPath"
Write-Host 'Point the domain document root to Laravel public inside that folder, e.g. .../hostinger-package/public'
Write-Host '(hPanel: Domains -> your domain -> Document root -> path ending in /public)'
Write-Host 'Create the server .env from .env.hostinger.example in the package root; do not upload the local .env.'
