$ErrorActionPreference = 'Stop'

$ports = @(8000, 5173)
$stopped = @()

foreach ($port in $ports) {
    $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue

    if (-not $connections) {
        Write-Host "No listening process found on port $port."
        continue
    }

    $processIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique

    foreach ($processId in $processIds) {
        try {
            $process = Get-Process -Id $processId -ErrorAction Stop
            Stop-Process -Id $processId -Force -ErrorAction Stop
            $stopped += [PSCustomObject]@{
                Port = $port
                ProcessId = $processId
                Name = $process.ProcessName
            }
            Write-Host "Stopped $($process.ProcessName) (PID $processId) on port $port."
        } catch {
            Write-Warning "Failed to stop process $processId on port $port. $($_.Exception.Message)"
        }
    }
}

if (-not $stopped.Count) {
    Write-Host 'No OPTICPLUS server processes were running.'
} else {
    Write-Host 'OPTICPLUS local servers stopped.'
}
