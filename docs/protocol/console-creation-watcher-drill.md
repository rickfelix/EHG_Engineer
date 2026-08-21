---
category: protocol
status: approved
version: 1.0.0
author: SD-LEO-INFRA-CONSOLE-REAPER-CREATION-001
last_updated: 2026-08-21
tags: [fleet, console-reaper, wmi, live-drill]
---

# Console-Creation Watcher — Live Drill

**SD:** SD-LEO-INFRA-CONSOLE-REAPER-CREATION-001

## Status: MECHANISM-READY, NOT LIVE-EXECUTED

This mirrors `lib/fleet/reboot-respawn-drill-runner.js`'s own no-false-live-claim pattern
(`printLiveExecutionPrecondition()`), applied here via
`lib/fleet/console-creation-watcher.mjs`'s own `printLiveExecutionPrecondition()`.

**What IS proven** (unit-tested, no live WMI dependency):
- `isConsoleCreationEvent` / `resolveParentage` / `handleProcessCreationEvent`
  (`lib/fleet/console-creation-watcher.mjs`) — exercised against an injected fake event source and
  a fake `lookupFn`, asserting a persisted parentage record for a synthetic OpenConsole.exe
  creation event and a no-op for an unrelated process (TS-1, TS-2).
- The scheduled-task argv builders (`buildCreateArgs`/`buildStartupCreateArgs`,
  `scripts/setup-console-creation-watcher-task.mjs`) and the principal-safety guard
  (`assertSafePrincipal`, reusing `lib/fleet/console-parentage.mjs`'s
  `validateScheduledTaskPrincipal`) — argv-shape and principal-rejection unit tests (TS-3, TS-4).

**What is NOT yet proven**: a real WMI `Win32_ProcessStartTrace` subscription actually firing on a
live Windows host, and the scheduled task actually self-healing a killed subprocess in production.

## Manual live-verification steps

1. On a Windows host with this repo checked out, run:
   ```
   node scripts/run-console-creation-watcher.mjs
   ```
   Confirm it logs `starting WMI subscription subprocess` and does not exit.
2. In a second terminal, launch a fresh `OpenConsole.exe` (e.g. via `wt.exe` or a direct launch)
   with a known parent process.
3. Confirm a new line appears in `.claude/console-parentage.jsonl` with a non-null
   `parent_pid`/`parent_image` for the console just launched, and that it appeared while the
   watcher process was running — not after a subsequent periodic reaper scan.
4. Kill the PowerShell subscription subprocess directly (e.g. via Task Manager, targeting the
   `powershell.exe` child of the Node process, not the Node process itself). Confirm the watcher
   logs a restart and a fresh `starting WMI subscription subprocess` line within
   `RESTART_DELAY_MS` (5s).
5. Register the scheduled task (`node scripts/setup-console-creation-watcher-task.mjs`), kill the
   **Node** process itself, and confirm the scheduled task relaunches it within one
   `/SC MINUTE` interval (5 min).

## Recording a live pass

Once run for real, update this doc's Status section to `LIVE-VERIFIED <date>` with the operator's
name, and file any deviation from the steps above as a follow-up. Do not mark this SD's live-drill
smoke-test step complete without having actually run steps 1-5 above.
