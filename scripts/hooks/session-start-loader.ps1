# session-start-loader.ps1
# Fires at session start - automatically outputs preserved state
# SD-LEO-INFRA-UNIFY-CONTEXT-PRESERVATION-001: Now outputs state directly (no manual read needed)

param()

$ErrorActionPreference = "SilentlyContinue"
$ProjectDir = $env:CLAUDE_PROJECT_DIR
if (-not $ProjectDir) {
    $ProjectDir = "C:\Users\rickf\Projects\_EHG\EHG_Engineer"
}

$UnifiedStateFile = Join-Path $ProjectDir ".claude\unified-session-state.json"

# Check if we have a recent unified state (less than 30 min old)
$hasRecentState = $false
$state = $null
if (Test-Path $UnifiedStateFile) {
    $stateAge = (Get-Date) - (Get-Item $UnifiedStateFile).LastWriteTime
    if ($stateAge.TotalMinutes -lt 30) {
        $hasRecentState = $true
        try {
            $state = Get-Content $UnifiedStateFile -Raw | ConvertFrom-Json
        } catch {
            $hasRecentState = $false
        }
    }
}

# Output context restoration automatically (no manual action needed!)
if ($hasRecentState -and $state) {
    Write-Host ""
    Write-Host "============================================================"
    Write-Host "[CONTEXT RESTORED] Session state from $($state.timestamp)"
    Write-Host "============================================================"

    # Git info
    if ($state.git) {
        Write-Host "[GIT] Branch: $($state.git.branch)"
        if ($state.git.status) {
            $changes = ($state.git.status -split "`n" | Where-Object { $_ }).Count
            if ($changes -gt 0) {
                Write-Host "[GIT] Uncommitted changes: $changes"
            }
        }
        if ($state.git.recentCommits -and $state.git.recentCommits.Count -gt 0) {
            Write-Host "[GIT] Latest: $($state.git.recentCommits[0])"
        }
    }

    # SD info
    if ($state.sd -and $state.sd.id) {
        Write-Host "[SD] Working on: $($state.sd.id)"
        if ($state.sd.phase) {
            Write-Host "[SD] Phase: $($state.sd.phase)"
        }
    }

    # Pending actions
    if ($state.summaries -and $state.summaries.pendingActions) {
        $actionCount = $state.summaries.pendingActions.Count
        if ($actionCount -gt 0) {
            Write-Host "[TODO] Pending actions: $actionCount"
            $state.summaries.pendingActions | Select-Object -First 3 | ForEach-Object {
                Write-Host "       - $_"
            }
        }
    }

    Write-Host "============================================================"
    Write-Host "[RESTORED] Context automatically loaded - ready to continue"
    Write-Host ""
} else {
    # No recent state - just show tip
    Write-Host ""
    Write-Host "[SESSION] New session - no recent state to restore"
}

# Always show SD hint
Write-Host "[TIP] Run 'npm run sd:next' to see the SD queue"
Write-Host ""
