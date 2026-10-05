param(
    [switch]$FullUpload
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendPath = Join-Path $root 'opticplus-frontend'
$backendPublicPath = Join-Path $root 'opticplus-backend\public'
$backendEnvTemplatePath = Join-Path $root 'opticplus-backend\.env.hostinger.example'
$frontendBuildDirName = 'dist-hostinger-package-' + (Get-Date -Format 'yyyyMMddHHmmss')
$frontendDistPath = Join-Path $frontendPath $frontendBuildDirName
$deployPath = Join-Path $root 'tmp\hostinger-package'
$deployLaravelPublic = Join-Path $deployPath 'public'
$manifestPath = Join-Path $root 'tmp\hostinger-filezilla-manifest.txt'
$baselinePath = Join-Path $root 'tmp\hostinger-filezilla-baseline.json'

if (-not (Test-Path $frontendPath)) {
    throw "Frontend folder not found: $frontendPath"
}

if (-not (Test-Path $backendPublicPath)) {
    throw "Backend public folder not found: $backendPublicPath"
}

Push-Location $frontendPath
try {
    npm.cmd run build -- --outDir $frontendBuildDirName --emptyOutDir
}
finally {
    Pop-Location
}

New-Item -ItemType Directory -Path $deployPath -Force | Out-Null
New-Item -ItemType Directory -Path $deployLaravelPublic -Force | Out-Null

Get-ChildItem -LiteralPath $deployPath -Force | Remove-Item -Recurse -Force
New-Item -ItemType Directory -Path $deployLaravelPublic -Force | Out-Null

$deployAssetsPath = Join-Path $deployLaravelPublic 'assets'
if (Test-Path $deployAssetsPath) {
    Remove-Item -LiteralPath $deployAssetsPath -Recurse -Force -ErrorAction SilentlyContinue
}

$deployIndexPath = Join-Path $deployLaravelPublic 'index.html'
if (Test-Path $deployIndexPath) {
    Remove-Item -LiteralPath $deployIndexPath -Force -ErrorAction SilentlyContinue
}

Copy-Item -Path (Join-Path $root 'opticplus-backend\*') -Destination $deployPath -Recurse -Force
# SPA must live in Laravel `public/` (see routes/web.php: public_path('index.html')).
# A separate public_html-only upload serves no PHP and makes /api/* return 404.
Copy-Item -Path (Join-Path $frontendDistPath '*') -Destination $deployLaravelPublic -Recurse -Force

# Never ship the local backend .env in the deploy bundle.
$deployEnvPath = Join-Path $deployPath '.env'
if (Test-Path $deployEnvPath) {
    Remove-Item -LiteralPath $deployEnvPath -Force -ErrorAction SilentlyContinue
}

if (Test-Path $backendEnvTemplatePath) {
    Copy-Item -LiteralPath $backendEnvTemplatePath -Destination (Join-Path $deployPath '.env.hostinger.example') -Force
    Copy-Item -LiteralPath $backendEnvTemplatePath -Destination (Join-Path $deployPath '.env.example') -Force
}

$previousFiles = @{}
$hasBaseline = (Test-Path -LiteralPath $baselinePath) -and (-not $FullUpload)
if ($hasBaseline) {
    $previousState = Get-Content -LiteralPath $baselinePath -Raw | ConvertFrom-Json
    foreach ($property in $previousState.files.PSObject.Properties) {
        $previousFiles[$property.Name] = $property.Value
    }
}

$currentFiles = @{}
$packageFiles = Get-ChildItem -LiteralPath $deployPath -File -Recurse | Where-Object {
    $relativePath = $_.FullName.Substring($deployPath.Length).TrimStart([char[]]@('\', '/')).Replace('\', '/')
    $relativePath -notmatch '(^|/)\.env$' -and
    $relativePath -notmatch '^storage/(logs|framework/(cache|sessions|views))/'
}

foreach ($file in $packageFiles) {
    $relativePath = $file.FullName.Substring($deployPath.Length).TrimStart([char[]]@('\', '/')).Replace('\', '/')
    $currentFiles[$relativePath] = [pscustomobject]@{
        length = [long]$file.Length
        last_write_utc_ticks = [long]$file.LastWriteTimeUtc.Ticks
    }
}

$uploadFiles = @(
    $currentFiles.Keys | Where-Object {
        if ($FullUpload -or -not $hasBaseline -or -not $previousFiles.ContainsKey($_)) {
            return $true
        }

        $previousFile = $previousFiles[$_]
        $previousFile.length -ne $currentFiles[$_].length -or
            $previousFile.last_write_utc_ticks -ne $currentFiles[$_].last_write_utc_ticks
    } | Sort-Object
)
$deletedFiles = @(
    $previousFiles.Keys | Where-Object { $hasBaseline -and -not $currentFiles.ContainsKey($_) } | Sort-Object
)

$manifestLines = [System.Collections.Generic.List[string]]::new()
$manifestLines.Add('Hostinger FileZilla sync manifest')
$manifestLines.Add("Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
$manifestLines.Add("Local package: $deployPath")
$manifestLines.Add('Remote destination: Laravel application root; keep each package-relative path unchanged.')
if ($FullUpload) {
    $manifestLines.Add('Mode: Full upload requested.')
} elseif (-not $hasBaseline) {
    $manifestLines.Add('Mode: Full upload; no previous local baseline exists.')
} else {
    $manifestLines.Add('Mode: Incremental; compared with the previous local package build, not the Hostinger server.')
}
$manifestLines.Add('')
$manifestLines.Add("Files to upload ($($uploadFiles.Count)):")
if ($uploadFiles.Count -eq 0) {
    $manifestLines.Add('  (No changed files detected.)')
} else {
    foreach ($relativePath in $uploadFiles) {
        $manifestLines.Add("  $relativePath")
    }
}
$manifestLines.Add('')
$manifestLines.Add("Files to delete manually on Hostinger ($($deletedFiles.Count)):")
if ($deletedFiles.Count -eq 0) {
    $manifestLines.Add('  (None detected.)')
} else {
    foreach ($relativePath in $deletedFiles) {
        $manifestLines.Add("  $relativePath")
    }
}
$manifestLines.Add('')
$manifestLines.Add('The local .env and Laravel runtime logs/cache/session/view files are excluded.')
$manifestLines.Add('Incremental comparison uses file size and last-write time; use -FullUpload if unsure about a same-size, preserved-time edit.')
$manifestLines.Add('Review the list before uploading. A local baseline cannot confirm what is currently on Hostinger.')
$manifestLines | Set-Content -LiteralPath $manifestPath -Encoding UTF8

$baseline = [pscustomobject]@{
    generated_at = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
    files = $currentFiles
}
$baseline | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $baselinePath -Encoding UTF8

Write-Host 'Hostinger package prepared.'
Write-Host "Upload the full folder: $deployPath"
Write-Host "FileZilla manifest: $manifestPath"
Write-Host "Mode: $(if ($FullUpload) { 'full upload' } elseif (-not $hasBaseline) { 'first run; full upload' } else { 'incremental local comparison' })"
Write-Host "Files to upload: $($uploadFiles.Count)"
Write-Host "Files to delete manually on Hostinger: $($deletedFiles.Count)"
$displayLimit = 60
foreach ($relativePath in ($uploadFiles | Select-Object -First $displayLimit)) {
    Write-Host "  UPLOAD $relativePath"
}
if ($uploadFiles.Count -gt $displayLimit) {
    Write-Host "  ...and $($uploadFiles.Count - $displayLimit) more; see the manifest for the complete list."
}
foreach ($relativePath in ($deletedFiles | Select-Object -First $displayLimit)) {
    Write-Host "  DELETE $relativePath"
}
if ($deletedFiles.Count -gt $displayLimit) {
    Write-Host "  ...and $($deletedFiles.Count - $displayLimit) more deletions; see the manifest for the complete list."
}
Write-Host 'Point the domain document root to Laravel public inside that folder, e.g. .../hostinger-package/public'
Write-Host '(hPanel: Domains -> your domain -> Document root -> path ending in /public)'
Write-Host 'Create the server .env from .env.hostinger.example in the package root; do not upload the local .env.'
