# precompact-snapshot.ps1
# Fires before Claude auto-compacts - saves critical state to file
# SD-LEO-INFRA-UNIFY-CONTEXT-PRESERVATION-001: Now uses unified state manager

param()

$ErrorActionPreference = "SilentlyContinue"
$ProjectDir = $env:CLAUDE_PROJECT_DIR
if (-not $ProjectDir) {
    $ProjectDir = "C:\Users\rickf\Projects\_EHG\EHG_Engineer"
}

$OutDir = Join-Path $ProjectDir ".claude"
$UnifiedStateFile = Join-Path $OutDir "unified-session-state.json"

# Ensure directory exists
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# Get git info
$branch = git -C $ProjectDir branch --show-current 2>$null
$status = git -C $ProjectDir status --porcelain 2>$null
$recentCommits = git -C $ProjectDir log -5 --oneline 2>$null
$stagedChanges = git -C $ProjectDir diff --cached --stat 2>$null
$modifiedFiles = git -C $ProjectDir diff --name-only HEAD~5 2>$null | Select-Object -First 20

# Try to get current SD from existing state
$sdId = $null
$sdPhase = $null
$sessionState = Join-Path $OutDir "session-state.md"
if (Test-Path $sessionState) {
    $stateContent = Get-Content $sessionState -Raw
    if ($stateContent -match "SD[- ]?ID[:\s]*([A-Z0-9-]+)") {
        $sdId = $Matches[1]
    }
    if ($stateContent -match "Phase[:\s]*([A-Z_]+)") {
        $sdPhase = $Matches[1]
    }
}

# Build unified state JSON
$timestamp = Get-Date -Format "yyyy-MM-ddTHH:mm:ss.fffZ"
$state = @{
    version = "1.0.0"
    timestamp = $timestamp
    trigger = "precompact"
    git = @{
        branch = if ($branch) { $branch.Trim() } else { "unknown" }
        status = if ($status) { $status.Trim() } else { "" }
        recentCommits = if ($recentCommits) { @($recentCommits -split "`n" | Where-Object { $_ }) } else { @() }
        stagedChanges = if ($stagedChanges) { $stagedChanges.Trim() } else { "" }
        modifiedFiles = if ($modifiedFiles) { @($modifiedFiles -split "`n" | Where-Object { $_ }) } else { @() }
    }
    sd = @{
        id = $sdId
        title = $null
        phase = $sdPhase
        progress = $null
    }
    workflow = @{
        currentPhase = if ($sdPhase) { $sdPhase } else { "unknown" }
        lastHandoff = $null
        toolExecutions = 0
    }
    summaries = @{
        contextHighlights = @("Pre-compaction state captured automatically")
        keyDecisions = @()
        pendingActions = @("Restore context after session start")
    }
}

# Write unified state (atomic write via temp file)
$tempFile = "$UnifiedStateFile.tmp"
$state | ConvertTo-Json -Depth 10 | Out-File -FilePath $tempFile -Encoding UTF8 -Force
Move-Item -Path $tempFile -Destination $UnifiedStateFile -Force

# Output comprehensive state summary for Claude to see immediately
Write-Host ""
Write-Host "============================================================"
Write-Host "[PRECOMPACT] Comprehensive state saved"
Write-Host "============================================================"
Write-Host "[GIT] Branch: $($state.git.branch)"
$changeCount = ($status -split "`n" | Where-Object { $_ }).Count
if ($changeCount -gt 0) {
    Write-Host "[GIT] Uncommitted changes: $changeCount"
}
if ($recentCommits) {
    $latestCommit = ($recentCommits -split "`n")[0]
    Write-Host "[GIT] Latest: $latestCommit"
}
if ($sdId) {
    Write-Host "[SD] Working on: $sdId"
    if ($sdPhase) {
        Write-Host "[SD] Phase: $sdPhase"
    }
}
Write-Host "============================================================"
Write-Host "[WARNING] COMPACTION ABOUT TO OCCUR - Full state preserved"
Write-Host "[FILE] .claude/unified-session-state.json"
Write-Host ""
