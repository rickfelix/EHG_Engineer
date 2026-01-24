# session-start-loader.ps1
# Fires at session start - loads preserved state back into context

param()

$ErrorActionPreference = "SilentlyContinue"
$ProjectDir = $env:CLAUDE_PROJECT_DIR
if (-not $ProjectDir) {
    $ProjectDir = "C:\Users\rickf\Projects\_EHG\EHG_Engineer"
}

$StateFile = Join-Path $ProjectDir ".claude\session-state.md"
$SnapshotFile = Join-Path $ProjectDir ".claude\compaction-snapshot.md"

# Check if we have a recent compaction snapshot (less than 30 min old)
$hasRecentSnapshot = $false
if (Test-Path $SnapshotFile) {
    $snapshotAge = (Get-Date) - (Get-Item $SnapshotFile).LastWriteTime
    if ($snapshotAge.TotalMinutes -lt 30) {
        $hasRecentSnapshot = $true
    }
}

# Output context restoration message
if ($hasRecentSnapshot) {
    Write-Host ""
    Write-Host "[RESTORE] CONTEXT RESTORATION AVAILABLE"
    Write-Host "=================================="
    Write-Host "Recent compaction detected. State files:"
    Write-Host "  > .claude/compaction-snapshot.md (git state)"
    Write-Host "  > .claude/session-state.md (work state)"
    Write-Host ""
    Write-Host ">>> READ THESE FILES to restore context before continuing."
    Write-Host ""
}

# Show SD hint (without running slow npm command)
Write-Host "[TIP] Run 'npm run sd:next' to see the SD queue"
