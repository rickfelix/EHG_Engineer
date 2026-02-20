<#
.SYNOPSIS
    LEO Stack Management Script - Windows PowerShell Version

.DESCRIPTION
    Manages the LEO Stack servers:
    - EHG_Engineer (port 3000): LEO Protocol Framework & Backend API
    - EHG App (port 8080): Unified Frontend (User + Admin with /admin routes)

.PARAMETER Command
    The command to execute: start, stop, restart, status, clean, emergency

.PARAMETER Fast
    Enable fast mode with reduced delays

.EXAMPLE
    .\scripts\leo-stack.ps1 start
    .\scripts\leo-stack.ps1 stop
    .\scripts\leo-stack.ps1 restart
    .\scripts\leo-stack.ps1 status
    .\scripts\leo-stack.ps1 restart -Fast
#>

param(
    [Parameter(Position=0)]
    [ValidateSet("start", "stop", "restart", "status", "clean", "emergency", "start-engineer", "start-app", "help")]
    [string]$Command = "help",

    [Alias("f")]
    [switch]$Fast
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Continue"

# Directories
$EngineerDir = "C:\Users\rickf\Projects\_EHG\EHG_Engineer"
$AppDir = "C:\Users\rickf\Projects\_EHG\ehg"

# PID file locations
$PidDir = Join-Path $EngineerDir ".pids"
if (-not (Test-Path $PidDir)) { New-Item -ItemType Directory -Path $PidDir -Force | Out-Null }

$EngineerPidFile = Join-Path $PidDir "engineer.pid"
$AppPidFile = Join-Path $PidDir "app.pid"

# Log directory
$LogDir = Join-Path $EngineerDir ".logs"
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
$LogFile = Join-Path $LogDir "leo-stack-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"

# Timing settings
$StartupDelay = if ($Fast) { 1 } else { 3 }
$RestartCooldown = if ($Fast) { 2 } else { 5 }
$ShutdownGracePeriod = 5

# Function to log messages
function Write-Log {
    param(
        [string]$Level,
        [string]$Message,
        [string]$Color = "White"
    )
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host $Message -ForegroundColor $Color
    "[$timestamp] [$Level] $Message" | Out-File -FilePath $LogFile -Append -Encoding UTF8
}

# Function to check if port is in use
function Test-PortInUse {
    param([int]$Port)
    $connection = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    return $null -ne $connection
}

# Function to get process using a port
function Get-ProcessOnPort {
    param([int]$Port)
    $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($connection) {
        return Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
    }
    return $null
}

# Function to clean a port
function Clear-Port {
    param(
        [int]$Port,
        [string]$Name
    )

    if (Test-PortInUse -Port $Port) {
        Write-Log "INFO" "[CLEAN] Cleaning up processes on port $Port ($Name)..." "Yellow"

        $connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
        $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique

        foreach ($processId in $pids) {
            $proc = Get-Process -Id $processId -ErrorAction SilentlyContinue
            if ($proc) {
                Write-Log "INFO" "   - Stopping PID $processId : $($proc.ProcessName)" "Yellow"
                Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
            }
        }

        Start-Sleep -Seconds 2

        if (Test-PortInUse -Port $Port) {
            Write-Log "ERROR" "   [WARN] Port $Port still in use after cleanup" "Red"
            return $false
        }

        Write-Log "INFO" "   [OK] Port $Port is now free" "Green"
    }

    return $true
}

# Function to start EHG_Engineer server (port 3000)
function Start-Engineer {
    Write-Log "INFO" "[TOOL] Starting EHG_Engineer server (port 3000)..." "Blue"

    if (Test-PortInUse -Port 3000) {
        Write-Log "WARN" "[WARN] Port 3000 already in use - cleaning up..." "Yellow"
        if (-not (Clear-Port -Port 3000 -Name "EHG_Engineer")) {
            return $false
        }
    }

    Push-Location $EngineerDir

    $serverLog = Join-Path $LogDir "engineer-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"
    $env:PORT = "3000"

    $process = Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory $EngineerDir `
        -RedirectStandardOutput $serverLog -RedirectStandardError "$serverLog.err" `
        -WindowStyle Hidden -PassThru

    $process.Id | Out-File -FilePath $EngineerPidFile -Encoding ASCII

    Start-Sleep -Seconds 2

    if (-not $process.HasExited) {
        Write-Log "INFO" "[OK] EHG_Engineer server started (PID: $($process.Id))" "Green"
        Write-Log "INFO" "   * http://localhost:3000" "White"
        Write-Log "INFO" "   * Log: $serverLog" "White"
        Pop-Location
        return $true
    } else {
        Write-Log "ERROR" "[ERROR] EHG_Engineer failed to start! Check log: $serverLog" "Red"
        Pop-Location
        return $false
    }
}

# Function to start EHG App frontend (port 8080)
function Start-App {
    Write-Log "INFO" "[UI] Starting EHG App frontend (port 8080)..." "Blue"

    if (Test-PortInUse -Port 8080) {
        Write-Log "WARN" "[WARN] Port 8080 already in use - cleaning up..." "Yellow"
        if (-not (Clear-Port -Port 8080 -Name "EHG App")) {
            return $false
        }
    }

    Push-Location $AppDir

    $appLog = Join-Path $LogDir "app-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"
    $env:PORT = "8080"

    $process = Start-Process -FilePath "cmd" -ArgumentList "/c", "npm run dev -- --host 0.0.0.0 --port 8080 > `"$appLog`" 2>&1" `
        -WorkingDirectory $AppDir -WindowStyle Hidden -PassThru

    $process.Id | Out-File -FilePath $AppPidFile -Encoding ASCII

    Start-Sleep -Seconds 3

    if (-not $process.HasExited) {
        Write-Log "INFO" "[OK] EHG App frontend started (PID: $($process.Id))" "Green"
        Write-Log "INFO" "   * http://localhost:8080" "White"
        Write-Log "INFO" "   * Log: $appLog" "White"
        Pop-Location
        return $true
    } else {
        Write-Log "ERROR" "[ERROR] EHG App failed to start! Check log: $appLog" "Red"
        Pop-Location
        return $false
    }
}

# Function to stop a server by PID file
function Stop-Server {
    param(
        [string]$PidFile,
        [string]$Name
    )

    if (Test-Path $PidFile) {
        $pidValue = Get-Content $PidFile -ErrorAction SilentlyContinue
        if ($pidValue) {
            $process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
            if ($process) {
                Write-Log "INFO" "Stopping $Name (PID: $pidValue)..." "Yellow"
                Stop-Process -Id $pidValue -Force -ErrorAction SilentlyContinue

                # Wait for process to exit
                $waited = 0
                while ((Get-Process -Id $pidValue -ErrorAction SilentlyContinue) -and ($waited -lt $ShutdownGracePeriod)) {
                    Start-Sleep -Seconds 1
                    $waited++
                }

                if (Get-Process -Id $pidValue -ErrorAction SilentlyContinue) {
                    Write-Log "WARN" "[WARN] $Name still running, force killing..." "Yellow"
                    Stop-Process -Id $pidValue -Force -ErrorAction SilentlyContinue
                }

                Write-Log "INFO" "[OK] Stopped $Name" "Green"
            } else {
                Write-Log "WARN" "[WARN] $Name not running (stale PID file)" "Yellow"
            }
        }
        Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
    } else {
        Write-Log "WARN" "[WARN] $Name PID file not found" "Yellow"
    }
}

# Function to stop all servers
function Stop-AllServers {
    Write-Log "INFO" "[STOP] Stopping all servers..." "Red"
    Write-Host "=================================="

    Stop-Server -PidFile $AppPidFile -Name "EHG App"
    Start-Sleep -Seconds 1

    Stop-Server -PidFile $EngineerPidFile -Name "EHG_Engineer"
    Start-Sleep -Seconds 1

    Write-Host "=================================="

    # Clean any remaining processes on ports
    foreach ($port in @(3000, 8080)) {
        if (Test-PortInUse -Port $port) {
            Write-Log "WARN" "[WARN] Port $port still in use, cleaning up..." "Yellow"
            Clear-Port -Port $port -Name "Port $port"
        }
    }

    Write-Log "INFO" "[OK] All servers stopped" "Green"
}

# Function to show server status
function Show-Status {
    Write-Log "INFO" "[STATUS] Server Status:" "Blue"
    Write-Host "=================================="

    function Check-ServerStatus {
        param(
            [string]$PidFile,
            [int]$Port,
            [string]$Name
        )

        if (Test-Path $PidFile) {
            $pidValue = Get-Content $PidFile -ErrorAction SilentlyContinue
            $process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
            if ($process) {
                Write-Log "INFO" "[OK] $Name : Running (PID: $pidValue, Port: $Port)" "Green"
                return
            }
        }

        if (Test-PortInUse -Port $Port) {
            $proc = Get-ProcessOnPort -Port $Port
            Write-Log "INFO" "[WARN] $Name : Running (no PID file, Port: $Port, PID: $($proc.Id))" "Yellow"
        } else {
            Write-Log "INFO" "[--] $Name : Not running" "Red"
        }
    }

    Check-ServerStatus -PidFile $EngineerPidFile -Port 3000 -Name "EHG_Engineer (3000)"
    Check-ServerStatus -PidFile $AppPidFile -Port 8080 -Name "EHG App (8080)"

    Write-Host "=================================="

    # Show memory
    $os = Get-CimInstance Win32_OperatingSystem
    $freeMemMB = [math]::Round($os.FreePhysicalMemory / 1024)
    $totalMemMB = [math]::Round($os.TotalVisibleMemorySize / 1024)
    Write-Log "INFO" "[MEM] Memory: ${freeMemMB}MB free / ${totalMemMB}MB total" "White"
}

# Function to start all servers
function Start-AllServers {
    $modeText = if ($Fast) { "(FAST MODE)" } else { "" }
    Write-Log "INFO" "[START] Starting LEO Stack $modeText..." "Blue"
    Write-Host "=================================="

    # Clean up any existing processes
    Write-Log "INFO" "Cleaning ports..." "Blue"
    Clear-Port -Port 3000 -Name "EHG_Engineer" | Out-Null
    Clear-Port -Port 8080 -Name "EHG App" | Out-Null

    Write-Host "=================================="
    Write-Log "INFO" "Starting servers (${StartupDelay}s delay between each)..." "Blue"
    Write-Host "=================================="

    if (-not (Start-Engineer)) {
        Write-Log "ERROR" "Failed to start EHG_Engineer" "Red"
        return
    }
    Write-Log "INFO" "Waiting ${StartupDelay}s..." "Yellow"
    Start-Sleep -Seconds $StartupDelay

    if (-not (Start-App)) {
        Write-Log "ERROR" "Failed to start EHG App" "Red"
        return
    }

    Write-Host "=================================="
    Write-Log "INFO" "[DONE] LEO Stack startup complete!" "Green"
    Write-Log "INFO" "[LOG] Log file: $LogFile" "Magenta"
    Write-Host ""

    Start-Sleep -Seconds 2
    Show-Status
}

# Function to restart all servers
function Restart-AllServers {
    $modeText = if ($Fast) { "(FAST MODE)" } else { "" }
    Write-Log "INFO" "[RESTART] Restarting LEO Stack $modeText..." "Blue"
    Write-Host "=================================="

    Stop-AllServers

    Write-Log "INFO" "[WAIT] COOLDOWN: Waiting ${RestartCooldown}s..." "Yellow"
    Start-Sleep -Seconds $RestartCooldown

    # Verify ports are free
    $portsClear = $true
    foreach ($port in @(3000, 8080)) {
        if (Test-PortInUse -Port $port) {
            Write-Log "ERROR" "[WARN] Port $port still in use!" "Red"
            $portsClear = $false
        }
    }

    if (-not $portsClear) {
        Write-Log "ERROR" "[WARN] Not all ports cleared. Run 'clean' command first." "Red"
        return
    }

    Write-Log "INFO" "[OK] All ports clear, starting servers..." "Green"
    Write-Host "=================================="

    Start-AllServers
}

# Function for emergency cleanup
function Invoke-EmergencyCleanup {
    Write-Log "WARN" "[EMERGENCY] EMERGENCY CLEANUP MODE" "Red"
    Write-Host "This will force-kill all node, npm, and python processes!" -ForegroundColor Yellow
    $reply = Read-Host "Are you sure? (yes/NO)"

    if ($reply -ne "yes") {
        Write-Log "INFO" "Aborted" "White"
        return
    }

    Write-Log "WARN" "Executing emergency cleanup..." "Red"

    # Kill all node processes
    Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2

    # Kill all npm processes
    Get-Process -Name "npm" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2

    # Clean PID files
    Remove-Item $EngineerPidFile, $AppPidFile -Force -ErrorAction SilentlyContinue

    # Verify ports are clear
    foreach ($port in @(3000, 8080)) {
        if (Test-PortInUse -Port $port) {
            Write-Log "ERROR" "[WARN] Port $port still in use" "Red"
        } else {
            Write-Log "INFO" "[OK] Port $port cleared" "Green"
        }
    }

    Write-Log "INFO" "Emergency cleanup complete" "Green"
}

# Function to show help
function Show-Help {
    Write-Host ""
    Write-Host "LEO Stack Management Script - Windows PowerShell" -ForegroundColor Cyan
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Usage: .\scripts\leo-stack.ps1 [command] [-Fast]" -ForegroundColor White
    Write-Host ""
    Write-Host "Primary Commands:" -ForegroundColor Yellow
    Write-Host "  start            - Start all LEO Stack servers" -ForegroundColor White
    Write-Host "  stop             - Stop all servers gracefully" -ForegroundColor White
    Write-Host "  restart          - Restart all servers" -ForegroundColor White
    Write-Host "  status           - Show server status" -ForegroundColor White
    Write-Host "  clean            - Clean up duplicate processes on all ports" -ForegroundColor White
    Write-Host ""
    Write-Host "Fast Mode (-Fast or -f):" -ForegroundColor Yellow
    Write-Host "  start -Fast      - Quick startup with reduced delays" -ForegroundColor White
    Write-Host "  restart -Fast    - Quick restart with shorter cooldown" -ForegroundColor White
    Write-Host ""
    Write-Host "Advanced Commands:" -ForegroundColor Yellow
    Write-Host "  emergency        - FORCE kill all node processes" -ForegroundColor White
    Write-Host "  start-engineer   - Start only EHG_Engineer (3000)" -ForegroundColor White
    Write-Host "  start-app        - Start only EHG App (8080)" -ForegroundColor White
    Write-Host ""
    Write-Host "Servers:" -ForegroundColor Yellow
    Write-Host "  Port 3000 - EHG_Engineer (LEO Protocol Framework, Backend API)" -ForegroundColor White
    Write-Host "  Port 8080 - EHG App (Frontend UI with Vite)" -ForegroundColor White
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor Yellow
    Write-Host "  .\scripts\leo-stack.ps1 start" -ForegroundColor Gray
    Write-Host "  .\scripts\leo-stack.ps1 restart -Fast" -ForegroundColor Gray
    Write-Host "  .\scripts\leo-stack.ps1 status" -ForegroundColor Gray
    Write-Host ""
}

# Main command handler
switch ($Command) {
    "start" { Start-AllServers }
    "stop" { Stop-AllServers }
    "restart" { Restart-AllServers }
    "status" { Show-Status }
    "clean" {
        Clear-Port -Port 3000 -Name "EHG_Engineer"
        Clear-Port -Port 8080 -Name "EHG App"
    }
    "emergency" { Invoke-EmergencyCleanup }
    "start-engineer" { Start-Engineer }
    "start-app" { Start-App }
    "help" { Show-Help }
    default { Show-Help }
}
