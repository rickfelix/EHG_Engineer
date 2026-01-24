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
    Write-Host "🔄 CONTEXT RESTORATION AVAILABLE"
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    Write-Host "Recent compaction detected. State files:"
    Write-Host "  📁 .claude/compaction-snapshot.md (git state)"
    Write-Host "  📁 .claude/session-state.md (work state)"
    Write-Host ""
    Write-Host "⚡ READ THESE FILES to restore context before continuing."
    Write-Host ""
}

# Always show current SD status hint
$sdNext = & npm run sd:next --silent 2>$null | Select-Object -First 10
if ($sdNext) {
    Write-Host "📋 Current SD Queue (run 'npm run sd:next' for full view)"
}
