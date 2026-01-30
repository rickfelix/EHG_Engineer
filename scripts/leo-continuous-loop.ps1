<#
.SYNOPSIS
    LEO Continuous Loop Runner - External session continuation orchestrator

.DESCRIPTION
    Runs outside Claude Code sessions to enable cross-session continuation
    for AUTO-PROCEED mode. Detects exit code 3 (incomplete) and restarts
    sessions with appropriate continuation prompts.

    Part of SD-LEO-INFRA-STOP-HOOK-ENHANCEMENT-001

.PARAMETER MaxRetries
    Maximum number of session retries before giving up (default: 10)

.PARAMETER CooldownSeconds
    Minimum wait time between session restarts (default: 60)

.PARAMETER MaxCooldownSeconds
    Maximum cooldown after exponential backoff (default: 300)

.PARAMETER CircuitBreakerThreshold
    Number of consecutive failures before circuit breaker trips (default: 3)

.PARAMETER CircuitBreakerResetMinutes
    Time to wait before resetting circuit breaker (default: 10)

.PARAMETER DryRun
    If specified, shows what would be done without executing

.EXAMPLE
    .\leo-continuous-loop.ps1
    # Start with default settings

.EXAMPLE
    .\leo-continuous-loop.ps1 -MaxRetries 5 -CooldownSeconds 30
    # Custom retry and cooldown settings

.EXAMPLE
    .\leo-continuous-loop.ps1 -DryRun
    # Dry run to see what would happen

.NOTES
    Safety Mechanisms:
    - MaxRetries: Prevents infinite retry loops
    - Rate Limiting: Minimum cooldown between retries with exponential backoff
    - Circuit Breaker: Stops after N consecutive failures
    - Lockfile: Prevents multiple instances running simultaneously
#>

[CmdletBinding()]
param(
    [Parameter()]
    [int]$MaxRetries = 10,

    [Parameter()]
    [int]$CooldownSeconds = 60,

    [Parameter()]
    [int]$MaxCooldownSeconds = 300,

    [Parameter()]
    [int]$CircuitBreakerThreshold = 3,

    [Parameter()]
    [int]$CircuitBreakerResetMinutes = 10,

    [Parameter()]
    [switch]$DryRun
)

# Configuration
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptRoot
$LockFile = Join-Path $ProjectRoot ".claude\loop.lock"
$LogDir = Join-Path $ProjectRoot ".logs"
$LogFile = Join-Path $LogDir "leo-continuous-loop.log"
$ContinuationStateFile = Join-Path $ProjectRoot ".claude\continuation-state.json"
$ContinuationPromptFile = Join-Path $ProjectRoot ".claude\continuation-prompt.md"

# Exit codes
$EXIT_SUCCESS = 0
$EXIT_ERROR = 1
$EXIT_INCOMPLETE = 3

# State tracking
$RetryCount = 0
$ConsecutiveErrors = 0
$LastErrorTime = $null
$LoopStartTime = Get-Date

# Ensure log directory exists
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

function Write-Log {
    param(
        [string]$Message,
        [string]$Level = "INFO"
    )
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] [$Level] $Message"

    # Console output with colors
    switch ($Level) {
        "ERROR" { Write-Host $logMessage -ForegroundColor Red }
        "WARN"  { Write-Host $logMessage -ForegroundColor Yellow }
        "SUCCESS" { Write-Host $logMessage -ForegroundColor Green }
        "DEBUG" { Write-Host $logMessage -ForegroundColor Gray }
        default { Write-Host $logMessage }
    }

    # File output
    Add-Content -Path $LogFile -Value $logMessage
}

function Test-Lockfile {
    <#
    .SYNOPSIS
        Check if another instance is running
    #>
    if (Test-Path $LockFile) {
        $lockContent = Get-Content $LockFile -Raw -ErrorAction SilentlyContinue
        if ($lockContent) {
            $lockData = $lockContent | ConvertFrom-Json -ErrorAction SilentlyContinue
            if ($lockData -and $lockData.pid) {
                # Check if process is still running
                $process = Get-Process -Id $lockData.pid -ErrorAction SilentlyContinue
                if ($process) {
                    return $true
                }
            }
        }
    }
    return $false
}

function Set-Lockfile {
    <#
    .SYNOPSIS
        Create lockfile with current PID
    #>
    $lockData = @{
        pid = $PID
        startTime = (Get-Date).ToString("o")
        hostname = $env:COMPUTERNAME
    }

    $lockDir = Split-Path -Parent $LockFile
    if (-not (Test-Path $lockDir)) {
        New-Item -ItemType Directory -Path $lockDir -Force | Out-Null
    }

    $lockData | ConvertTo-Json | Set-Content -Path $LockFile
}

function Remove-Lockfile {
    <#
    .SYNOPSIS
        Remove lockfile on exit
    #>
    if (Test-Path $LockFile) {
        Remove-Item -Path $LockFile -Force -ErrorAction SilentlyContinue
    }
}

function Get-ContinuationState {
    <#
    .SYNOPSIS
        Read the continuation state file
    #>
    if (Test-Path $ContinuationStateFile) {
        try {
            $content = Get-Content $ContinuationStateFile -Raw
            return $content | ConvertFrom-Json
        }
        catch {
            Write-Log "Error reading continuation state: $_" -Level "ERROR"
        }
    }
    return $null
}

function Test-ContinuationNeeded {
    <#
    .SYNOPSIS
        Check if continuation is needed based on state
    #>
    $state = Get-ContinuationState
    if ($state -and $state.status -eq "incomplete") {
        return $true
    }
    return $false
}

function Test-CircuitBreakerTripped {
    <#
    .SYNOPSIS
        Check if circuit breaker should prevent continuation
    #>
    if ($ConsecutiveErrors -ge $CircuitBreakerThreshold) {
        if ($LastErrorTime) {
            $timeSinceError = (Get-Date) - $LastErrorTime
            if ($timeSinceError.TotalMinutes -lt $CircuitBreakerResetMinutes) {
                return $true
            }
            else {
                # Reset circuit breaker after timeout
                $script:ConsecutiveErrors = 0
                Write-Log "Circuit breaker reset after $CircuitBreakerResetMinutes minutes" -Level "INFO"
            }
        }
    }
    return $false
}

function Get-CooldownWithBackoff {
    <#
    .SYNOPSIS
        Calculate cooldown with exponential backoff
    #>
    param([int]$RetryAttempt)

    # Exponential backoff: base * 2^retry (capped at max)
    $backoff = [math]::Min($CooldownSeconds * [math]::Pow(2, $RetryAttempt - 1), $MaxCooldownSeconds)
    return [int]$backoff
}

function Invoke-GenerateContinuationPrompt {
    <#
    .SYNOPSIS
        Generate the continuation prompt using Node.js script
    #>
    $generateScript = Join-Path $ScriptRoot "generate-continuation-prompt.js"

    if (-not (Test-Path $generateScript)) {
        Write-Log "Continuation prompt generator not found: $generateScript" -Level "ERROR"
        return $false
    }

    try {
        Push-Location $ProjectRoot
        $result = node $generateScript 2>&1
        Pop-Location

        if ($LASTEXITCODE -eq 0) {
            Write-Log "Generated continuation prompt: $ContinuationPromptFile" -Level "INFO"
            return $true
        }
        else {
            Write-Log "Prompt generation failed: $result" -Level "ERROR"
            return $false
        }
    }
    catch {
        Pop-Location
        Write-Log "Error generating prompt: $_" -Level "ERROR"
        return $false
    }
}

function Start-ClaudeSession {
    <#
    .SYNOPSIS
        Start a new Claude Code session with continuation prompt
    #>
    param(
        [string]$PromptFile
    )

    Write-Log "Starting Claude Code session..." -Level "INFO"

    if ($DryRun) {
        Write-Log "[DRY RUN] Would execute: claude --continue-file `"$PromptFile`"" -Level "DEBUG"
        # Simulate success for dry run
        return $EXIT_SUCCESS
    }

    try {
        Push-Location $ProjectRoot

        # Start Claude Code with the continuation prompt
        if (Test-Path $PromptFile) {
            # Use the continuation prompt file as input
            $promptContent = Get-Content $PromptFile -Raw

            # Create a temp file with the prompt for piping
            $tempFile = [System.IO.Path]::GetTempFileName()
            $promptContent | Set-Content -Path $tempFile -NoNewline

            # Run Claude Code with the prompt
            # Note: Adjust this command based on your Claude Code CLI configuration
            $process = Start-Process -FilePath "claude" `
                -ArgumentList "--dangerously-skip-permissions" `
                -WorkingDirectory $ProjectRoot `
                -Wait `
                -PassThru `
                -RedirectStandardInput $tempFile

            Remove-Item $tempFile -Force -ErrorAction SilentlyContinue

            Pop-Location
            return $process.ExitCode
        }
        else {
            # No prompt file, just start Claude Code
            $process = Start-Process -FilePath "claude" `
                -ArgumentList "--dangerously-skip-permissions" `
                -WorkingDirectory $ProjectRoot `
                -Wait `
                -PassThru

            Pop-Location
            return $process.ExitCode
        }
    }
    catch {
        Pop-Location
        Write-Log "Error starting Claude session: $_" -Level "ERROR"
        return $EXIT_ERROR
    }
}

function Show-LoopStatus {
    <#
    .SYNOPSIS
        Display current loop status
    #>
    $runtime = (Get-Date) - $LoopStartTime

    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  LEO Continuous Loop Status" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  Runtime: $($runtime.ToString('hh\:mm\:ss'))"
    Write-Host "  Retry Count: $RetryCount / $MaxRetries"
    Write-Host "  Consecutive Errors: $ConsecutiveErrors"
    Write-Host "  Circuit Breaker: $(if (Test-CircuitBreakerTripped) { 'TRIPPED' } else { 'OK' })"
    Write-Host "  Continuation Needed: $(Test-ContinuationNeeded)"
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
}

# Main execution
function Main {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host "  LEO Continuous Loop Runner" -ForegroundColor Cyan
    Write-Host "  Cross-Session AUTO-PROCEED Orchestrator" -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Log "Starting LEO Continuous Loop (MaxRetries=$MaxRetries, Cooldown=${CooldownSeconds}s)" -Level "INFO"

    if ($DryRun) {
        Write-Log "Running in DRY RUN mode - no actual sessions will be started" -Level "WARN"
    }

    # Check for existing instance
    if (Test-Lockfile) {
        Write-Log "Another instance of LEO Continuous Loop is already running. Exiting." -Level "ERROR"
        exit 1
    }

    # Set lockfile
    Set-Lockfile

    # Register cleanup on exit
    $cleanupScript = {
        Remove-Lockfile
        Write-Log "LEO Continuous Loop stopped" -Level "INFO"
    }

    Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action $cleanupScript | Out-Null

    try {
        # Main loop
        while ($true) {
            # Check circuit breaker
            if (Test-CircuitBreakerTripped) {
                Write-Log "Circuit breaker tripped! Waiting $CircuitBreakerResetMinutes minutes before retry..." -Level "WARN"
                Start-Sleep -Seconds ($CircuitBreakerResetMinutes * 60)
                continue
            }

            # Check max retries
            if ($RetryCount -ge $MaxRetries) {
                Write-Log "Maximum retries ($MaxRetries) reached. Exiting loop." -Level "WARN"
                break
            }

            # Generate continuation prompt if needed
            if (Test-ContinuationNeeded) {
                Write-Log "Continuation needed - generating prompt..." -Level "INFO"
                if (-not (Invoke-GenerateContinuationPrompt)) {
                    $script:ConsecutiveErrors++
                    $script:LastErrorTime = Get-Date
                    $script:RetryCount++

                    $cooldown = Get-CooldownWithBackoff -RetryAttempt $RetryCount
                    Write-Log "Prompt generation failed. Waiting $cooldown seconds..." -Level "WARN"
                    Start-Sleep -Seconds $cooldown
                    continue
                }
            }

            # Start Claude session
            $promptFile = if (Test-Path $ContinuationPromptFile) { $ContinuationPromptFile } else { $null }
            $exitCode = Start-ClaudeSession -PromptFile $promptFile

            Write-Log "Claude session exited with code: $exitCode" -Level "INFO"

            switch ($exitCode) {
                $EXIT_SUCCESS {
                    # Session completed successfully
                    Write-Log "Session completed successfully" -Level "SUCCESS"
                    $script:ConsecutiveErrors = 0

                    # Check if more work is needed
                    if (-not (Test-ContinuationNeeded)) {
                        Write-Log "No continuation needed. Loop complete." -Level "SUCCESS"
                        break
                    }
                }

                $EXIT_INCOMPLETE {
                    # Session incomplete - needs continuation
                    Write-Log "Session incomplete (exit code 3) - will continue" -Level "INFO"
                    $script:ConsecutiveErrors = 0
                    $script:RetryCount++

                    # Rate limiting
                    $cooldown = Get-CooldownWithBackoff -RetryAttempt 1
                    Write-Log "Waiting $cooldown seconds before next session..." -Level "INFO"
                    Start-Sleep -Seconds $cooldown
                }

                default {
                    # Error exit
                    $script:ConsecutiveErrors++
                    $script:LastErrorTime = Get-Date
                    $script:RetryCount++

                    Write-Log "Session failed with exit code: $exitCode" -Level "ERROR"

                    $cooldown = Get-CooldownWithBackoff -RetryAttempt $RetryCount
                    Write-Log "Waiting $cooldown seconds before retry..." -Level "WARN"
                    Start-Sleep -Seconds $cooldown
                }
            }

            Show-LoopStatus
        }
    }
    finally {
        # Cleanup
        Remove-Lockfile
    }

    # Final status
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host "  LEO Continuous Loop Complete" -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host "  Total Retries: $RetryCount"
    Write-Host "  Total Runtime: $((Get-Date) - $LoopStartTime)"
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host ""
}

# Run main
Main
