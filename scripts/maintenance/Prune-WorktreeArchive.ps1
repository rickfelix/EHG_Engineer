<#
.SYNOPSIS
    Retention maintainer for .worktrees\_archive (the worktree graveyard).

.DESCRIPTION
    The LEO fleet isolates each parallel Claude Code session in its own git
    worktree under .worktrees\<SD-ID>. When an SD completes, the worktree is
    MOVED into .worktrees\_archive\<SD-ID>-<timestamp> as a code-loss snapshot.
    Nothing in the codebase ever reads _archive again, so these snapshots
    accumulate forever (they reached 1,015 entries / 482 GB before this existed).

    This bounds _archive with a cheap, age-based retention policy.

    DESIGN (deliberately low-cost):
      * METADATA-ONLY scan: reads each child dir's timestamp only (milliseconds).
        It NEVER recursively walks the tree to size it (40M files = the thing
        that hung). Free disk space is the size signal.
      * Pure local filesystem. No network, no DB, no git history reads.
      * Runs once per day; deletes only the small daily backlog.

    THREE SAFETY GUARDS (any one alone protects live work):
      1. SCOPE   - only operates on direct children of _archive.
      2. LIVE    - skips any path that 'git worktree list' reports as active.
      3. RECENCY - never deletes an entry modified within -SafetyHours.

    Deletion uses 'rd /s /q' which removes junctions as links (never follows
    them), so a junctioned node_modules can't lead to the main repo being hit.

.PARAMETER RetentionDays   Delete entries older than this. Default 7.
.PARAMETER MaxKeep         Keep at most this many newest (hard space cap). Default 40.
.PARAMETER SafetyHours     Never touch entries modified within this window. Default 12.
.PARAMETER Execute         Actually delete. Without it, DRY RUN (reports only).
.PARAMETER Status          Print a health snapshot and exit. Never deletes.

.EXAMPLE  powershell -File Prune-WorktreeArchive.ps1 -Status
.EXAMPLE  powershell -File Prune-WorktreeArchive.ps1            # dry run
.EXAMPLE  powershell -File Prune-WorktreeArchive.ps1 -Execute   # prune for real

.NOTES
    Env overrides: WORKTREE_ARCHIVE_RETENTION_DAYS, WORKTREE_ARCHIVE_MAX_KEEP,
    WORKTREE_ARCHIVE_SAFETY_HOURS
#>
[CmdletBinding()]
param(
    [int]$RetentionDays = 7,
    [int]$MaxKeep = 40,
    [int]$SafetyHours = 12,
    [switch]$Execute,
    [switch]$Status,
    [string]$ArchiveRoot
)

if ($env:WORKTREE_ARCHIVE_RETENTION_DAYS) { $RetentionDays = [int]$env:WORKTREE_ARCHIVE_RETENTION_DAYS }
if ($env:WORKTREE_ARCHIVE_MAX_KEEP)       { $MaxKeep       = [int]$env:WORKTREE_ARCHIVE_MAX_KEEP }
if ($env:WORKTREE_ARCHIVE_SAFETY_HOURS)   { $SafetyHours   = [int]$env:WORKTREE_ARCHIVE_SAFETY_HOURS }

$RepoRoot  = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$Archive   = Join-Path $RepoRoot '.worktrees\_archive'
if ($ArchiveRoot) { $Archive = $ArchiveRoot }   # optional override (testing / relocated archive)
$LogDir    = Join-Path $RepoRoot '.logs'
$LogFile   = Join-Path $LogDir 'worktree-archive-prune.log'
$HighWater = 200

function Write-Log([string]$msg) {
    $line = '[' + (Get-Date).ToString('yyyy-MM-dd HH:mm:ss') + '] ' + $msg
    Write-Output $line
    if (-not (Test-Path -LiteralPath $LogDir)) { New-Item -ItemType Directory -Force -Path $LogDir | Out-Null }
    Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8
}

function Get-FreeGB { return [math]::Round((Get-PSDrive C).Free / 1GB, 2) }

# Junction-safe recursive delete. Returns $true if the path is gone afterward.
function Remove-Tree([string]$path) {
    cmd.exe /c "rd /s /q `"$path`"" 2>&1 | Out-Null
    return (-not (Test-Path -LiteralPath $path))
}

# --- Pre-flight ---
if (-not (Test-Path -LiteralPath $Archive -PathType Container)) {
    Write-Log 'INFO  _archive does not exist - nothing to maintain.'
    exit 0
}
$ArchiveFull = (Get-Item -LiteralPath $Archive).FullName.TrimEnd('\').ToLower()

# GUARD 2 (LIVE): set of active git-registered worktree paths. cmd handles the
# stderr redirect so PowerShell never sees a native-command error.
$active = @{}
$wtOut = cmd.exe /c "git -C `"$RepoRoot`" worktree list --porcelain 2>nul"
foreach ($ln in $wtOut) {
    if ($ln -like 'worktree *') {
        $p = ($ln.Substring(9)).Trim().Replace('/', '\')
        $active[$p.ToLower().TrimEnd('\')] = $true
    }
}

# --- Cheap metadata scan (NO recursive walk) ---
$entries = @(Get-ChildItem -LiteralPath $Archive -Directory -Force -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending)
$now = Get-Date

# --- Status mode ---
if ($Status) {
    $oldest = 'n/a'; $newest = 'n/a'
    if ($entries.Count -gt 0) {
        $oldest = $entries[-1].LastWriteTime.ToString('yyyy-MM-dd HH:mm')
        $newest = $entries[0].LastWriteTime.ToString('yyyy-MM-dd HH:mm')
    }
    Write-Log ('STATUS  entries=' + $entries.Count + '  oldest=' + $oldest + '  newest=' + $newest + '  free=' + (Get-FreeGB) + 'GB  policy=keep-under-' + $RetentionDays + 'd-newest-' + $MaxKeep)
    if ($entries.Count -gt $HighWater) { Write-Log ('WARN  backlog ' + $entries.Count + ' exceeds high-water ' + $HighWater) }
    exit 0
}

# --- Select candidates ---
$ageCutoff    = $now.AddDays(-$RetentionDays)
$safetyCutoff = $now.AddHours(-$SafetyHours)
$candidates = New-Object System.Collections.Generic.List[object]
$skippedRecent = 0; $skippedActive = 0; $skippedScope = 0

for ($i = 0; $i -lt $entries.Count; $i++) {
    $e = $entries[$i]
    $full = $e.FullName.TrimEnd('\')

    # GUARD 1 (SCOPE): must be a direct child of _archive.
    $parent = (Split-Path $full -Parent).TrimEnd('\').ToLower()
    if ($parent -ne $ArchiveFull) { $skippedScope++; continue }

    $tooOld    = $e.LastWriteTime -lt $ageCutoff
    $beyondCap = $i -ge $MaxKeep
    if (-not ($tooOld -or $beyondCap)) { continue }

    # GUARD 3 (RECENCY): never touch very-recently-modified entries.
    if ($e.LastWriteTime -gt $safetyCutoff) { $skippedRecent++; continue }

    # GUARD 2 (LIVE): never touch an active git worktree.
    if ($active.ContainsKey($full.ToLower())) { $skippedActive++; continue }

    $reason = 'beyond-keep-' + $MaxKeep
    if ($tooOld) { $reason = 'age-over-' + $RetentionDays + 'd' }
    $ageDays = [math]::Round(($now - $e.LastWriteTime).TotalDays, 1)
    $candidates.Add([PSCustomObject]@{ Path = $e.FullName; Name = $e.Name; Age = $ageDays; Reason = $reason })
}

$mode = 'DRY-RUN'
if ($Execute) { $mode = 'EXECUTE' }
$freeBefore = Get-FreeGB
Write-Log ('START  mode=' + $mode + '  scanned=' + $entries.Count + '  candidates=' + $candidates.Count + '  skipped(recent=' + $skippedRecent + ' active=' + $skippedActive + ' scope=' + $skippedScope + ')  free=' + $freeBefore + 'GB  policy=keep-under-' + $RetentionDays + 'd-newest-' + $MaxKeep + '-safety-' + $SafetyHours + 'h')
if ($entries.Count -gt $HighWater) { Write-Log ('WARN  backlog ' + $entries.Count + ' exceeds high-water ' + $HighWater + ' - consider tightening retention.') }

if ($candidates.Count -eq 0) {
    Write-Log 'DONE   nothing to prune.'
    exit 0
}

$deleted = 0; $failed = 0
foreach ($c in $candidates) {
    if (-not $Execute) {
        Write-Log ('  would-prune  ' + $c.Name + '  (age ' + $c.Age + 'd, ' + $c.Reason + ')')
        continue
    }
    if (Remove-Tree $c.Path) {
        $deleted++
        Write-Log ('  pruned       ' + $c.Name + '  (age ' + $c.Age + 'd, ' + $c.Reason + ')')
    } else {
        $failed++
        Write-Log ('  FAILED       ' + $c.Name + '  (locked? will retry next run)')
    }
}

$freeAfter = Get-FreeGB
if ($Execute) {
    Write-Log ('DONE   pruned=' + $deleted + ' failed=' + $failed + '  free=' + $freeBefore + 'GB -> ' + $freeAfter + 'GB (+' + [math]::Round($freeAfter - $freeBefore, 2) + 'GB)')
} else {
    Write-Log ('DONE   dry-run: ' + $candidates.Count + ' entries would be pruned. Re-run with -Execute to act.')
}
