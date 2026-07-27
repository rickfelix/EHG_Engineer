<#
.SYNOPSIS
  Idempotently (re)point the "LEO LLM Cost Check" scheduled task at the TRACKED
  cost-check script. QF-20260727-360.

.DESCRIPTION
  WHAT WENT WRONG. The task was registered against an UNTRACKED wrapper:

      wscript.exe "<repo>\scripts\ops\llm-cost-check-hidden.vbs"

  That .vbs was never in git (git ls-files scripts/ops/ lists only
  llm-cost-check.ps1 and set-gemini-key.ps1, and .gitignore covers the .log and the
  alert .txt, not a .vbs). So a clean, a checkout or a reset deleted it and nothing
  restored it. Measured on 2026-07-27: the task fired at 08:00:01 with
  LastTaskResult 2147943467 = 0x8007042B ERROR_PROCESS_ABORTED and
  NumberOfMissedRuns 0 — firing reliably, failing reliably. Output side agreed:
  llm-cost-check.log last written 2026-07-11, LLM-COST-ALERT.txt 2026-07-02. About
  16 days with NO LLM cost monitoring, on a system where plan quota IS the cost
  currency.

  WHY THIS SCRIPT EXISTS RATHER THAN A ONE-OFF schtasks COMMAND. Recreating the
  missing .vbs would re-arm the identical failure — the row says so explicitly, and
  it is right: the untracked-ness was the defect, not the file's contents. This
  provisioning step is therefore TRACKED, so the task can be re-applied after any
  host reset without depending on somebody remembering the incantation.

  The real script (scripts/ops/llm-cost-check.ps1) is tracked and resolves its own
  paths from $PSScriptRoot, so it needs no working directory. Hidden execution comes
  from -WindowStyle Hidden on powershell.exe itself, which is what the .vbs wrapper
  was only ever there to provide.

  NOT CHANGED HERE, deliberately: Principal.LogonType. The whole EHG task family is
  registered Interactive and pops visible consoles — that is QF-20260726-677, a
  different defect on the same family, and its row says "file both, do not merge".
  This script preserves whatever principal the existing task already has.

.NOTES
  Safe to re-run. Reports the before/after action so a run is self-evidencing.
  Requires the same elevation the original registration needed.
#>

[CmdletBinding()]
param(
  [string] $TaskName = 'LEO LLM Cost Check',
  # Resolve the MAIN repo root, NOT the caller's cwd. --git-common-dir points at the
  # main .git even from inside a linked worktree, so running this from a worktree
  # cannot register an ephemeral path — which would be the very bug this fixes.
  [string] $RepoRoot
)

$ErrorActionPreference = 'Stop'

if (-not $RepoRoot) {
  $commonDir = (& git rev-parse --path-format=absolute --git-common-dir 2>$null)
  if (-not $commonDir) { throw 'Not inside a git repository and no -RepoRoot supplied.' }
  $RepoRoot = Split-Path -Parent ($commonDir -replace '/', '\')
}

$Target = Join-Path $RepoRoot 'scripts\ops\llm-cost-check.ps1'
if (-not (Test-Path $Target)) {
  throw "Cost-check script not found at $Target - refusing to register a task pointing at a missing file (that is the bug this closes)."
}

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
  Write-Output '=== BEFORE ==='
  foreach ($a in $existing.Actions) { Write-Output ("  " + $a.Execute + " " + $a.Arguments) }
} else {
  Write-Output '=== BEFORE === (task not registered)'
}

$action = New-ScheduledTaskAction `
  -Execute 'powershell.exe' `
  -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}"' -f $Target)

if ($existing) {
  # Repoint ONLY the action. Trigger, principal and settings are left exactly as the
  # host already has them (see the LogonType note above).
  Set-ScheduledTask -TaskName $TaskName -Action $action | Out-Null
} else {
  $trigger = New-ScheduledTaskTrigger -Daily -At 08:00
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger | Out-Null
}

$after = Get-ScheduledTask -TaskName $TaskName
Write-Output '=== AFTER ==='
foreach ($a in $after.Actions) { Write-Output ("  " + $a.Execute + " " + $a.Arguments) }
Write-Output ''
Write-Output ("Verify with: Start-ScheduledTask -TaskName '{0}' then Get-ScheduledTaskInfo -TaskName '{0}'" -f $TaskName)
Write-Output 'Expect LastTaskResult 0 and a fresh write to scripts/ops/llm-cost-check.log.'
