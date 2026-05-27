# precompact-snapshot.ps1
# Fires before Claude auto-compacts - saves critical state to file
# SD-LEO-INFRA-UNIFY-CONTEXT-PRESERVATION-001: Now uses unified state manager
#
# CANONICAL: this PS1 is the ONLY PreCompact hook wired in .claude/settings.json.
# QF-20260526-344 removed the parallel scripts/hooks/precompact-unified.js (never
# wired) to eliminate two-implementation confusion that previously misled an RCA
# (QF-20260524-337). The deleted JS carried two dormant capabilities not present
# here:
#   - PAT-CLMCOMPACT-01: extend claude_sessions.heartbeat_at in DB before
#     compaction (prevents claim staleness during 30-60s compactions).
#   - SD-LEO-INFRA-COMPACTION-CLAIM-001: persist session_id alongside SD state
#     for post-compaction re-claim.
# If either becomes a real pain again, restore by either porting the DB writes
# into this PS1 (preferred — single chokepoint) or adding a PS1->node bridge
# call AFTER the state file Move-Item below. Recover the prior JS via git show
# pre-merge-of-QF-20260526-344~1:scripts/hooks/precompact-unified.js.

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

# QF-20260524-337: Preserve protocol-file-read tracking across compaction.
# This hook previously scratch-built $state and overwrote the file, dropping
# protocolFilesRead/protocolFileReadStatus/etc. Post-compaction /sd-create then
# re-blocked with "CLAUDE_CORE.md has not been read" (sd-key-generator.js Case 1,
# feedback 6bbe551f). Read the existing state and carry these keys forward so a
# session that already read the protocol files stays unblocked after compaction.
$preservedKeys = @(
    'protocolFilesRead', 'protocolFilesReadAt', 'protocolFileReadStatus',
    'protocolGate', 'protocolFilesPartiallyRead', 'protocolReadConfirmations',
    'protocolFileEscalations'
)
$preserved = @{}
if (Test-Path $UnifiedStateFile) {
    try {
        $existingRaw = Get-Content $UnifiedStateFile -Raw -ErrorAction Stop
        if ($existingRaw) {
            $existingState = ($existingRaw.TrimStart([char]0xFEFF) | ConvertFrom-Json -ErrorAction Stop)
            foreach ($key in $preservedKeys) {
                if (($existingState.PSObject.Properties.Name -contains $key) -and ($null -ne $existingState.$key)) {
                    $preserved[$key] = $existingState.$key
                }
            }
        }
    } catch {
        # Corrupt/unreadable existing state - proceed without preservation (fail-open)
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

# QF-20260524-337: Merge preserved protocol-read tracking back into the new state.
foreach ($key in $preserved.Keys) {
    $state[$key] = $preserved[$key]
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

# Signal to context-compact-nudge that compaction occurred
$FlagDir = Join-Path $env:USERPROFILE ".claude\flags"
New-Item -ItemType Directory -Force -Path $FlagDir | Out-Null

# Clear the nudge flag (no longer needed - compaction is happening)
$NudgeFlag = Join-Path $FlagDir "context-compact-needed.json"
if (Test-Path $NudgeFlag) { Remove-Item $NudgeFlag -Force }

# Write compaction marker so nudge resets its cooldown
$CompactionMarker = Join-Path $FlagDir "last-compaction.json"
@{ timestamp = $timestamp; sessionId = $env:CLAUDE_SESSION_ID; trigger = "auto-precompact" } | ConvertTo-Json | Out-File -FilePath $CompactionMarker -Encoding UTF8 -Force
