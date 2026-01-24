# precompact-snapshot.ps1
# Fires before Claude auto-compacts - saves critical state to file

param()

$ErrorActionPreference = "SilentlyContinue"
$ProjectDir = $env:CLAUDE_PROJECT_DIR
if (-not $ProjectDir) {
    $ProjectDir = "C:\Users\rickf\Projects\_EHG\EHG_Engineer"
}

$OutDir = Join-Path $ProjectDir ".claude"
$SnapshotFile = Join-Path $OutDir "compaction-snapshot.md"
$StateFile = Join-Path $OutDir "session-state.md"

# Ensure directory exists
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# Build snapshot content
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$content = @"
# Pre-Compaction Snapshot
**Created**: $timestamp
**Trigger**: Auto-compaction imminent

## Git Status
``````
$(git -C $ProjectDir status --porcelain 2>$null)
``````

## Recent Changes (diff stat)
``````
$(git -C $ProjectDir diff --stat 2>$null)
``````

## Staged Changes
``````
$(git -C $ProjectDir diff --cached --stat 2>$null)
``````

## Current Branch
$(git -C $ProjectDir branch --show-current 2>$null)

## Recent Commits (last 5)
$(git -C $ProjectDir log -5 --oneline 2>$null)

## Modified Files (last hour)
$(git -C $ProjectDir diff --name-only HEAD~5 2>$null | Select-Object -First 20)

## Active SD (from working directory)

---

**IMPORTANT**: Reload this file after compaction to restore context.
"@

# Write snapshot
$content | Out-File -FilePath $SnapshotFile -Encoding UTF8 -Force

# Output message for Claude to see
Write-Host "[SNAPSHOT] Pre-compaction snapshot saved to .claude/compaction-snapshot.md"
Write-Host "[WARNING] COMPACTION ABOUT TO OCCUR - State preserved"
