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
    [ValidateSet("start", "stop", "restart", "status", "clean", "emergency", "start-engineer", "start-app", "start-worker", "help")]
    [string]$Command = "help",

    [Alias("f")]
    [switch]$Fast,

    # When set with start/restart, deletes EHG App's node_modules\.vite optimize
    # cache before starting, forcing a clean re-optimize. Hard-reset escape hatch
    # for a corrupted/thrashed dep cache. (PR ehg#622 serves dev deps no-cache, so
    # this is rarely needed, but it's here when a full reset is wanted.)
    [switch]$ClearViteCache
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

# Worker Registry
$WorkerRegistryFile = Join-Path $EngineerDir "config\workers.json"

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
    # Only check Listen state — TimeWait/CloseWait are stale sockets that will clear on their own
    $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
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

# Function to tree-kill EHG App (Vite) dev servers regardless of bound port.
# Port-based cleanup only frees 8080; when 8080 is taken a new `npm run dev` makes
# Vite drift to 8081+, and those instances survive every restart, accumulate as
# zombies, and thrash the shared node_modules\.vite optimize cache -- the root
# cause of stale dep-cache "Failed to fetch dynamically imported module" 404s that
# survive reloads and restarts. Scoped strictly to $AppDir's Vite bin path in the
# command line, so dev servers for OTHER projects are never touched. taskkill /T
# kills the tree (cmd -> npm -> vite); the npm/cmd parents exit once vite dies.
function Stop-OrphanDevServers {
    $orphans = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like "*$AppDir\node_modules*vite*" })
    if ($orphans.Count -eq 0) { return 0 }

    Write-Log "WARN" "[CLEAN] Found $($orphans.Count) EHG App dev-server process(es) (including any port-drifted); tree-killing..." "Yellow"
    foreach ($orphan in $orphans) {
        try {
            & taskkill /T /F /PID $orphan.ProcessId 2>&1 | Out-Null
            Write-Log "INFO" "   Killed dev-server PID $($orphan.ProcessId)" "Gray"
        } catch { }
    }
    Start-Sleep -Seconds 1
    return $orphans.Count
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

    # Use cmd /c to merge stderr into stdout so crash errors appear in the main log
    $process = Start-Process -FilePath "cmd" -ArgumentList "/c", "node server.js > `"$serverLog`" 2>&1" `
        -WorkingDirectory $EngineerDir -WindowStyle Hidden -PassThru

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
        # Show last few lines of log for quick diagnosis
        if (Test-Path $serverLog) {
            $logContent = Get-Content $serverLog -Tail 5 -ErrorAction SilentlyContinue
            if ($logContent) {
                foreach ($line in $logContent) {
                    Write-Log "ERROR" "   > $line" "Red"
                }
            }
        }
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

    # No auto git-pull here — keeps parity with leo-stack.sh and avoids clobbering peer-worktree state.

    # Auto-install if node_modules missing (fleet ops can clobber them)
    $viteBin = Join-Path $AppDir "node_modules\.bin\vite.cmd"
    if (-not (Test-Path $viteBin)) {
        Write-Log "WARN" "[WARN] node_modules missing in EHG App - running npm install..." "Yellow"
        Push-Location $AppDir
        & npm install --loglevel error 2>&1 | Out-Null
        Pop-Location
        if (-not (Test-Path $viteBin)) {
            Write-Log "ERROR" "[ERROR] npm install failed - vite still missing" "Red"
            return $false
        }
        Write-Log "INFO" "[OK] Dependencies restored" "Green"
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

# Function to read worker registry
function Get-WorkerRegistry {
    if (-not (Test-Path $WorkerRegistryFile)) {
        Write-Log "WARN" "[WARN] Worker registry not found: $WorkerRegistryFile" "Yellow"
        return @()
    }
    $registry = Get-Content $WorkerRegistryFile -Raw | ConvertFrom-Json
    return $registry.workers
}

# Function to start all enabled workers from registry
function Start-Workers {
    $workers = Get-WorkerRegistry
    if ($workers.Count -eq 0) { return }

    Write-Log "INFO" "[WORKERS] Starting enabled workers..." "Blue"

    foreach ($worker in $workers) {
        if (-not $worker.enabled) { continue }

        $pidFile = Join-Path $PidDir $worker.pid_file

        # Check if already running
        if (Test-Path $pidFile) {
            $existingPid = Get-Content $pidFile -ErrorAction SilentlyContinue
            $existingProc = Get-Process -Id $existingPid -ErrorAction SilentlyContinue
            if ($existingProc) {
                Write-Log "WARN" "[WARN] $($worker.display_name) already running (PID: $existingPid)" "Yellow"
                continue
            }
            Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
        }

        $workerCwd = if ($worker.cwd -eq ".") { $EngineerDir } else { $worker.cwd }
        $workerLog = Join-Path $LogDir "$($worker.log_prefix)-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"

        $process = Start-Process -FilePath "cmd" -ArgumentList "/c", "$($worker.command) > `"$workerLog`" 2>&1" `
            -WorkingDirectory $workerCwd -WindowStyle Hidden -PassThru

        $process.Id | Out-File -FilePath $pidFile -Encoding ASCII

        Start-Sleep -Seconds 2

        if (-not $process.HasExited) {
            Write-Log "INFO" "[OK] $($worker.display_name) started (PID: $($process.Id))" "Green"
            Write-Log "INFO" "   * Log: $workerLog" "White"
        } else {
            Write-Log "ERROR" "[ERROR] $($worker.display_name) failed to start! Check log: $workerLog" "Red"
            if (Test-Path $workerLog) {
                $logContent = Get-Content $workerLog -Tail 5 -ErrorAction SilentlyContinue
                if ($logContent) {
                    foreach ($line in $logContent) {
                        Write-Log "ERROR" "   > $line" "Red"
                    }
                }
            }
        }
    }
}

# Function to stop all workers from registry
function Stop-Workers {
    $workers = Get-WorkerRegistry
    if ($workers.Count -eq 0) { return }

    Write-Log "INFO" "[WORKERS] Stopping workers..." "Yellow"

    foreach ($worker in $workers) {
        $pidFile = Join-Path $PidDir $worker.pid_file
        Stop-Server -PidFile $pidFile -Name $worker.display_name
    }

    # Kill orphan workers not tracked by PID files (zombie processes from previous sessions)
    $orphanPatterns = @('start-stage-worker', 'stage-zero-queue-processor', 'stage-execution-worker', 'eva-master-scheduler', 'subagent-worker')
    $orphanCount = 0
    foreach ($pattern in $orphanPatterns) {
        $orphans = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
            Where-Object { $_.CommandLine -match $pattern }
        foreach ($orphan in $orphans) {
            try {
                Stop-Process -Id $orphan.ProcessId -Force -ErrorAction SilentlyContinue
                $orphanCount++
            } catch { }
        }
    }
    if ($orphanCount -gt 0) {
        Write-Log "WARN" "[WORKERS] Killed $orphanCount orphan worker process(es) from previous sessions" "Yellow"
    }

    # Verification: confirm no stale worker processes remain
    $staleWorkers = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match 'stage-zero|stage-execution-worker|start-stage-worker|eva-master-scheduler|subagent-worker' }
    if ($staleWorkers) {
        Write-Log "WARN" "[WORKERS] $($staleWorkers.Count) stale worker(s) still running - force killing..." "Yellow"
        foreach ($stale in $staleWorkers) {
            try {
                & taskkill /T /F /PID $stale.ProcessId 2>&1 | Out-Null
                Write-Log "INFO" "   Killed stale PID $($stale.ProcessId)" "Gray"
            } catch { }
        }
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
                # Use taskkill /T to kill entire process tree (cmd → node supervisor → forked child)
                # Stop-Process only kills the target PID; child processes become orphans on Windows
                $taskKillResult = & taskkill /T /F /PID $pidValue 2>&1
                Write-Log "INFO" "   taskkill: $taskKillResult" "Gray"

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

    Stop-Workers

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

    # Catch EHG App dev servers that drifted to non-8080 ports (zombies that
    # port-based cleanup misses and that thrash the shared Vite optimize cache).
    Stop-OrphanDevServers | Out-Null

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

    # Worker status
    $workers = Get-WorkerRegistry
    if ($workers.Count -gt 0) {
        Write-Host ""
        Write-Host "Workers:" -ForegroundColor Cyan
        foreach ($worker in $workers) {
            if (-not $worker.enabled) {
                Write-Log "INFO" "   [--] $($worker.display_name): Disabled" "DarkGray"
                continue
            }
            $pidFile = Join-Path $PidDir $worker.pid_file
            if (Test-Path $pidFile) {
                $pidValue = Get-Content $pidFile -ErrorAction SilentlyContinue
                $proc = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
                if ($proc) {
                    Write-Log "INFO" "   [OK] $($worker.display_name): Running (PID: $pidValue)" "Green"
                } else {
                    Write-Log "INFO" "   [!!] $($worker.display_name): Dead (stale PID: $pidValue)" "Red"
                }
            } else {
                Write-Log "INFO" "   [--] $($worker.display_name): Not running" "Red"
            }
        }
    }

    Write-Host "=================================="

    # Show memory
    $os = Get-CimInstance Win32_OperatingSystem
    $freeMemMB = [math]::Round($os.FreePhysicalMemory / 1024)
    $totalMemMB = [math]::Round($os.TotalVisibleMemorySize / 1024)
    Write-Log "INFO" "[MEM] Memory: ${freeMemMB}MB free / ${totalMemMB}MB total" "White"
}

# Post-start health check: exactly one listener per managed port and no extra
# (port-drifted) EHG App dev servers. Surfaces the zombie/duplicate condition
# that previously went undetected until it corrupted the Vite optimize cache.
function Test-StackHealth {
    $issues = 0
    foreach ($port in @(3000, 8080)) {
        $listeners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
        if ($listeners.Count -gt 1) {
            Write-Log "WARN" "[HEALTH] Port $port has $($listeners.Count) listeners (expected 1)" "Yellow"
            $issues++
        }
    }
    $viteProcs = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like "*$AppDir\node_modules*vite*" })
    if ($viteProcs.Count -gt 1) {
        Write-Log "WARN" "[HEALTH] $($viteProcs.Count) EHG App dev servers detected (expected 1) - possible port drift; run 'clean'" "Yellow"
        $issues++
    }
    if ($issues -eq 0) {
        Write-Log "INFO" "[HEALTH] OK - one listener per port, single EHG App dev server" "Green"
    }
}

# Git freshness — ensure a repo serves the latest origin/main before the server
# starts. leo-stack restart restarts the *processes* but historically never pulled,
# so the dev servers served whatever the local working tree happened to be on. That
# is why merged work could be invisible in the running app (e.g. CronLinter showed
# the retired Stage-19 build-method UI because the ehg tree was behind the commit
# that removed it). Fast-forward only when safely on a clean `main`; otherwise warn
# and serve local — never clobber a feature branch or uncommitted work. Opt out via
# LEO_STACK_NO_PULL=1.
function Sync-Repo {
    param([string]$Dir, [string]$Name)
    if (-not (Test-Path $Dir)) {
        Write-Log "WARN" "[SYNC] $Name dir not found ($Dir) - skipping" "Yellow"
        return
    }
    Push-Location $Dir
    try {
        $branch = (git rev-parse --abbrev-ref HEAD 2>$null)
        if ($LASTEXITCODE -ne 0) {
            Write-Log "WARN" "[SYNC] $Name is not a git repo - skipping" "Yellow"
            return
        }
        if ($branch -ne "main") {
            Write-Log "WARN" "[SYNC] $Name on '$branch' (not main) - serving local, not auto-pulling" "Yellow"
            return
        }
        # No pre-emptive dirty check: rely on `merge --ff-only`, which fast-forwards
        # cleanly when uncommitted files (e.g. the perpetually-churned .claude/.protocol-sync)
        # are NOT in the incoming diff, and safely aborts (never clobbers) when they are.
        git fetch origin main --quiet 2>$null
        $behind = (git rev-list --count HEAD..origin/main 2>$null)
        if ($behind -match '^\d+$' -and [int]$behind -gt 0) {
            Write-Log "INFO" "[SYNC] $Name is $behind commit(s) behind origin/main - fast-forwarding..." "Blue"
            git merge --ff-only origin/main --quiet 2>$null
            if ($LASTEXITCODE -eq 0) {
                Write-Log "INFO" "[SYNC] $Name updated to $(git rev-parse --short HEAD)" "Green"
            } else {
                Write-Log "WARN" "[SYNC] $Name ff-only merge declined (diverged or local changes conflict) - serving local" "Yellow"
            }
        } else {
            Write-Log "INFO" "[SYNC] $Name already current with origin/main" "Green"
        }
    } finally {
        Pop-Location
    }
}

function Sync-Repos {
    if ($env:LEO_STACK_NO_PULL -eq "1") {
        Write-Log "WARN" "[SYNC] LEO_STACK_NO_PULL=1 - skipping repo freshness check (serving local)" "Yellow"
        return
    }
    Write-Log "INFO" "[SYNC] Ensuring repos are current with origin/main..." "Blue"
    Sync-Repo -Dir $EngineerDir -Name "EHG_Engineer"
    Sync-Repo -Dir $AppDir -Name "EHG App (ehg)"
}

# Function to start all servers
function Start-AllServers {
    $modeText = if ($Fast) { "(FAST MODE)" } else { "" }
    Write-Log "INFO" "[START] Starting LEO Stack $modeText..." "Blue"
    Write-Host "=================================="

    # Pull latest origin/main for both repos so the servers never serve stale code.
    Sync-Repos
    Write-Host "=================================="

    # Optional hard reset of the EHG App Vite optimize cache (opt-in via -ClearViteCache)
    if ($ClearViteCache) {
        $viteCache = Join-Path $AppDir "node_modules\.vite"
        if (Test-Path $viteCache) {
            Write-Log "WARN" "[CLEAN] Clearing EHG App Vite optimize cache..." "Yellow"
            Remove-Item -Recurse -Force $viteCache -ErrorAction SilentlyContinue
        }
    }

    # Clean up any existing processes (ports + any port-drifted EHG App dev servers)
    Write-Log "INFO" "Cleaning ports..." "Blue"
    Clear-Port -Port 3000 -Name "EHG_Engineer" | Out-Null
    Clear-Port -Port 8080 -Name "EHG App" | Out-Null
    Stop-OrphanDevServers | Out-Null

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

    Start-Workers

    Write-Host "=================================="
    Write-Log "INFO" "[DONE] LEO Stack startup complete!" "Green"
    Write-Log "INFO" "[LOG] Log file: $LogFile" "Magenta"
    Write-Host ""

    Start-Sleep -Seconds 2
    Show-Status
    Test-StackHealth
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

    # Clean worker PID files
    $workers = Get-WorkerRegistry
    foreach ($worker in $workers) {
        $pidFile = Join-Path $PidDir $worker.pid_file
        Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
    }

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
    Write-Host "Cache Reset (-ClearViteCache):" -ForegroundColor Yellow
    Write-Host "  restart -ClearViteCache  - Wipe EHG App's Vite optimize cache, then restart" -ForegroundColor White
    Write-Host ""
    Write-Host "Note: stop / restart / clean now also tree-kill EHG App dev servers that" -ForegroundColor DarkGray
    Write-Host "      drifted to non-8080 ports (zombies that port-based cleanup missed)." -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "Advanced Commands:" -ForegroundColor Yellow
    Write-Host "  emergency        - FORCE kill all node processes" -ForegroundColor White
    Write-Host "  start-engineer   - Start only EHG_Engineer (3000)" -ForegroundColor White
    Write-Host "  start-app        - Start only EHG App (8080)" -ForegroundColor White
    Write-Host "  start-worker     - Start all enabled workers from config/workers.json" -ForegroundColor White
    Write-Host ""
    Write-Host "Servers:" -ForegroundColor Yellow
    Write-Host "  Port 3000 - EHG_Engineer (LEO Protocol Framework, Backend API)" -ForegroundColor White
    Write-Host "  Port 8080 - EHG App (Frontend UI with Vite)" -ForegroundColor White
    Write-Host ""
    Write-Host "Worker Registry:" -ForegroundColor Yellow
    Write-Host "  Workers are defined in config/workers.json. Set `"enabled`": true to auto-start" -ForegroundColor White
    Write-Host "  with the stack. See docs/reference/worker-registry-guide.md for details." -ForegroundColor White
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
        Stop-OrphanDevServers | Out-Null
    }
    "emergency" { Invoke-EmergencyCleanup }
    "start-engineer" { Start-Engineer }
    "start-app" { Start-App }
    "start-worker" { Start-Workers }
    "help" { Show-Help }
    default { Show-Help }
}
