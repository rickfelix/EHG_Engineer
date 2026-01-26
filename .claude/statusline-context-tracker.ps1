# ============================================================================
# Status Line Context Tracker (PowerShell Native)
# ============================================================================
# Purpose: Capture accurate token usage from Claude Code status line
#
# Features:
#   - Wide traffic signal bar (green=running / red=idle)
#   - Server-authoritative token counting (via current_usage)
#   - Cache-aware calculations (includes cache_read tokens)
#   - USABLE context percentage (accounts for 45K auto-compact buffer)
#   - Threshold alerts (WARNING @ 60%, CRITICAL @ 80%, EMERGENCY @ 95%)
#   - Compaction detection (non-monotonic usage)
#
# Installation:
#   Add to .claude/settings.local.json:
#   "statusLine": {
#     "type": "command",
#     "command": "powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\\Users\\rickf\\Projects\\_EHG\\EHG_Engineer\\.claude\\statusline-context-tracker.ps1"
#   }
# ============================================================================

$ErrorActionPreference = "SilentlyContinue"

# Ensure UTF-8 output for Unicode characters
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# Configuration
$LogDir = "C:\Users\rickf\Projects\_EHG\EHG_Engineer\.claude\logs"
$StateFile = "$LogDir\.context-state.json"

# Thresholds
$ContextWindow = 200000
$AutocompactBuffer = 45000
$WarningThreshold = 60
$CriticalThreshold = 80
$EmergencyThreshold = 95

# Ensure log directory exists
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

# Read JSON from stdin
$inputJson = [Console]::In.ReadToEnd()

try {
    $data = $inputJson | ConvertFrom-Json
} catch {
    Write-Host "? JSON parse error"
    exit 0
}

# Extract model info
$model = if ($data.model.display_name) { $data.model.display_name } else { "Unknown" }
$modelId = if ($data.model.id) { $data.model.id } else { "unknown" }

# Abbreviate model name
$modelShort = switch -Regex ($model) {
    "Opus.*4\.5" { "O4.5" }
    "Opus.*4" { "O4" }
    "Sonnet.*4" { "S4" }
    "Sonnet.*3\.5" { "S3.5" }
    "Haiku.*3\.5" { "H3.5" }
    "Haiku" { "H" }
    default { $model.Substring(0, [Math]::Min(4, $model.Length)) }
}

# Extract context window size
$contextSize = if ($data.context_window.context_window_size) {
    [int]$data.context_window.context_window_size
} else {
    200000
}

# Extract current usage
$currentUsage = $data.context_window.current_usage
$inputTokens = if ($currentUsage.input_tokens) { [int]$currentUsage.input_tokens } else { 0 }
$outputTokens = if ($currentUsage.output_tokens) { [int]$currentUsage.output_tokens } else { 0 }
$cacheCreation = if ($currentUsage.cache_creation_input_tokens) { [int]$currentUsage.cache_creation_input_tokens } else { 0 }
$cacheRead = if ($currentUsage.cache_read_input_tokens) { [int]$currentUsage.cache_read_input_tokens } else { 0 }

# Calculate context usage
$contextUsed = $inputTokens + $cacheCreation + $cacheRead
$usableContext = $contextSize - $AutocompactBuffer
if ($usableContext -le 0) { $usableContext = $contextSize }

$percentUsed = [Math]::Min(100, [int]($contextUsed * 100 / $usableContext))

# Extract session info
$sessionId = if ($data.session_id) { $data.session_id } else { "unknown" }
$cwd = if ($data.cwd) { $data.cwd } else { "unknown" }

# Get project name
$projectName = Split-Path -Leaf $cwd

# Get git branch
$gitBranch = ""
$gitDirty = ""
$gitDir = Join-Path $cwd ".git"
if (Test-Path $gitDir) {
    Push-Location $cwd
    try {
        $gitBranch = git symbolic-ref --short HEAD 2>$null
        if (-not $gitBranch) {
            $gitBranch = git describe --tags --exact-match 2>$null
            if (-not $gitBranch) { $gitBranch = "detached" }
        }
        # Check for uncommitted changes
        $diffOutput = git diff --quiet 2>$null
        $diffCachedOutput = git diff --cached --quiet 2>$null
        if ($LASTEXITCODE -ne 0) { $gitDirty = "*" }
    } catch { }
    Pop-Location
}

# Determine status
$status = "HEALTHY"
$icon = ""
if ($percentUsed -ge $EmergencyThreshold) {
    $status = "EMERGENCY"
    $icon = " !"
} elseif ($percentUsed -ge $CriticalThreshold) {
    $status = "CRITICAL"
    $icon = " !"
} elseif ($percentUsed -ge $WarningThreshold) {
    $status = "WARNING"
    $icon = " *"
}

# Read previous state for activity detection
$activityState = "idle"
$lastActive = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

if (Test-Path $StateFile) {
    try {
        $prevState = Get-Content $StateFile -Raw | ConvertFrom-Json

        # Check hook-triggered state
        if ($prevState.hook_triggered -eq $true) {
            $activityState = $prevState.activity_state
        } else {
            # Fallback: detect from token changes
            $prevOutput = if ($prevState.last_output_tokens) { [int]$prevState.last_output_tokens } else { 0 }
            $prevInput = if ($prevState.last_input_tokens) { [int]$prevState.last_input_tokens } else { 0 }
            $prevLastActive = if ($prevState.last_active_epoch) { [long]$prevState.last_active_epoch } else { 0 }

            $totalInput = if ($data.context_window.total_input_tokens) { [int]$data.context_window.total_input_tokens } else { 0 }
            $totalOutput = if ($data.context_window.total_output_tokens) { [int]$data.context_window.total_output_tokens } else { 0 }

            $currentEpoch = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

            if ($totalOutput -gt $prevOutput -or $totalInput -gt $prevInput) {
                $lastActive = $currentEpoch
            } else {
                $lastActive = $prevLastActive
            }

            $timeSinceActive = $currentEpoch - $lastActive
            if ($timeSinceActive -le 4) {
                $activityState = "running"
            }
        }
    } catch { }
}

# ANSI escape codes
$esc = [char]27

# Activity bar colors
if ($activityState -eq "running") {
    $activityColor = "$esc[97;42m"  # White on green
    $label = "  WORKING   "
} else {
    $activityColor = "$esc[97;41m"  # White on red
    $label = " YOUR TURN  "
}
$reset = "$esc[0m"

$activitySignal = "${activityColor}[${label}]${reset}"

# Progress bar colors
if ($percentUsed -ge $EmergencyThreshold) {
    $barColor = "$esc[1;31m"  # Bold red
} elseif ($percentUsed -ge $CriticalThreshold) {
    $barColor = "$esc[0;31m"  # Red
} elseif ($percentUsed -ge $WarningThreshold) {
    $barColor = "$esc[0;33m"  # Yellow
} else {
    $barColor = "$esc[0;32m"  # Green
}

# Build progress bar
$barWidth = 20
$filled = [int]($percentUsed * $barWidth / 100)
$empty = $barWidth - $filled
$fillChar = [char]0x2588  # Full block
$emptyChar = [char]0x2591  # Light shade

$bar = ($fillChar.ToString() * $filled) + ($emptyChar.ToString() * $empty)

# Build project info
if ($gitBranch) {
    $projectInfo = "${projectName}:${gitBranch}${gitDirty}"
} else {
    $projectInfo = $projectName
}

# Read AUTO-PROCEED status from leo-status-line cache (SD-LEO-ENH-AUTO-PROCEED-001-13)
$autoProceedInfo = ""
$leoStatusFile = Join-Path $cwd ".leo-status.json"
if (Test-Path $leoStatusFile) {
    try {
        $leoStatus = Get-Content $leoStatusFile -Raw | ConvertFrom-Json
        if ($leoStatus.autoProceed -and $leoStatus.autoProceed.isActive) {
            $apStatus = if ($leoStatus.autoProceed.isActive) { "ON" } else { "OFF" }
            $apPhase = if ($leoStatus.autoProceed.phase) { $leoStatus.autoProceed.phase } else { "?" }
            $apProgress = if ($null -ne $leoStatus.autoProceed.progress) { $leoStatus.autoProceed.progress } else { "?" }
            $autoProceedInfo = " | AP:${apStatus}/${apPhase}/${apProgress}%"
        }
    } catch { }
}

# Build output
$output = "${activitySignal} ${projectInfo}${autoProceedInfo} ${barColor}[${bar}]${reset} ${percentUsed}% (${modelShort})${icon}"

# Update state file
$totalInput = if ($data.context_window.total_input_tokens) { [int]$data.context_window.total_input_tokens } else { 0 }
$totalOutput = if ($data.context_window.total_output_tokens) { [int]$data.context_window.total_output_tokens } else { 0 }

$newState = @{
    last_context_used = $contextUsed
    last_percent = $percentUsed
    usable_context = $usableContext
    last_status = $status
    last_update = (Get-Date -Format "o")
    last_update_epoch = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    last_output_tokens = $totalOutput
    last_input_tokens = $totalInput
    last_active_epoch = $lastActive
    session_id = $sessionId
    activity_state = $activityState
    hook_triggered = $false
}

$newState | ConvertTo-Json | Set-Content $StateFile -Force

# Output the status line
Write-Host $output
