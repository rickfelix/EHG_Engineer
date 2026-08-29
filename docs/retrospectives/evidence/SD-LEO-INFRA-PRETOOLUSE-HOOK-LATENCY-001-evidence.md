# SD-LEO-INFRA-PRETOOLUSE-HOOK-LATENCY-001 — Latency Evidence

## Pre-fix (PowerShell, 5-run baseline)
914-1054ms per invocation (powershell.exe -NoProfile -File set-activity-state.ps1).
VALIDATION sub-agent independently confirmed with a bare `powershell.exe -Command "exit 0"`
(no script body): 639-905ms, isolating cold-start-of-runtime as the cause, not script logic.

## Post-fix (Node, 100-run soak test)
p50=35.3ms, p95=77.6ms, max=122.5ms, timeouts (2000ms cap)=0/100.
Improvement: ~12-14x latency reduction, zero timeout-cap risk.

## Reader census
Live reader: .claude/statusline.cjs (configured in settings.json statusLine block).
Reads: activity_state, last_active_epoch, hook_triggered. Merge semantics preserved
(new hook only sets these 3 fields; all other statusline-written keys survive --
verified by live execution diff: lost_keys=[]).
Dead/unreferenced: .claude/statusline-context-tracker.{ps1,sh}, .claude/set-activity-state.sh
(not wired into settings.json or package.json).

## Call sites fixed (3, in .claude/settings.json)
PreToolUse (matcher: all tools), UserPromptSubmit, Stop -- all now call
`node scripts/hooks/set-activity-state.cjs <state>` instead of
`powershell.exe -NoProfile -File .claude/set-activity-state.ps1 -State <state>`.

## Known same-class defect, correctly out of scope
PostToolUse hook (matcher: Bash) still uses `powershell.exe -NoProfile -Command "..."`
for a one-line string match -- same ~639-905ms cold-start tax, but on Bash calls only
(narrower hot path than the fixed PreToolUse-all-tools hook). SD scope explicitly
excludes "any other hook"; flagged as a completion-flag finding for a follow-up QF.
