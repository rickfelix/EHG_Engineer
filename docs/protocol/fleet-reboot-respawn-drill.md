# Fleet Reboot-Respawn — Live Drill (G1b / G2)

**SD:** SD-LEO-INFRA-LEO-COMPLETION-001-D · **Owner acceptance:** Solomon (canary leg) · **Tier:** LIVE (operator-run, not CI)

This runbook proves the property unit tests **cannot**: after a host reboot kills every live fleet
session, the reboot-respawn runner reads the **frozen desired manifest**, relaunches each slot via
`claude --resume <uuid>`, and lands a **real** (non-mocked) `fleet_verb_respawn` row in
`coordination_events`.

> ⚠️ **Anti-test-masking (Solomon R1 verdict `0e9e466e`, `no_unit_mock=true` / `trim_forbidden=true`).**
> A mocked-seam unit test does **not** satisfy acceptance. The mechanism (runner + `--resume` spawn path
> + ONSTART/ONLOGON task + drill runner) ships **MECHANISM-READY**; the load-bearing proof is the live
> drill below. **FULL canary live-execution (a real host reboot) is DEFERRED to Solomon on Child B's
> canary account** and captured as a completion-flag follow-up — mirroring sibling E's `u4-drill-runner.js`
> MECHANISM-READY-NOT-LIVE-EXECUTED state.

## Mechanism (what shipped in D)

| Piece | File |
|---|---|
| Desired-manifest table (**applied**, 4 enabled rows: Canary-pilot + the SD-LEO-INFRA-FLEET-CANNOT-SELF-001 singleton roster below) | `database/migrations/20260720_fleet_desired_slots_STAGED.sql` (+ `_DOWN`) |
| Reader / writer / capture / roster translator | `lib/fleet/desired-slots-store.js` (`loadDesiredSlots`, `upsertDesiredSlot`, `captureResumeUuid`, `slotsToRoster`) |
| `resume_uuid` capture at SessionStart | `scripts/hooks/capture-session-id.cjs` (`metadata.resume_uuid := session_id`) |
| `--resume` spawn path | `lib/fleet/spawn-control.js` `buildLiveSpawnInvocation({..., resumeUuid})` |
| Runner (read → roster → per-slot resume relaunch → emit events) | `lib/fleet/reboot-respawn-runner.js` + entrypoint `scripts/fleet/reboot-respawn.cjs` |
| ONSTART/ONLOGON scheduled task | `scripts/setup-reboot-respawn-task.mjs` |
| Drill runner (PASS/FAIL checks) | `lib/fleet/reboot-respawn-drill-runner.js` |

## ⚠️ Preconditions (all mandatory)

1. **Desired manifest exists.** `fleet_desired_slots` is applied and, as of
   SD-LEO-INFRA-FLEET-CANNOT-SELF-001, carries the singleton governance roster (chairman decision
   f9ab8709-7c22-4f08-9be1-ffe5a6de1b3c — singletons only, workers remain operator-started):
   `Canary-pilot` (`worker`/`canary`), `Adam` (`adam`/`host-default`), `Coordinator`
   (`coordinator`/`host-default`), `Solomon` (`solomon`/`host-default`). Each slot that should reattach
   needs a `resume_uuid` (populated automatically at SessionStart, or via `captureResumeUuid`). **Every
   row must carry an explicit `account_profile`** — a real profile name or the literal `'host-default'`
   sentinel (meaning "deliberately no `CLAUDE_CONFIG_DIR` isolation, use the host's default login"). A
   row missing `account_profile` entirely, or one whose value fails to resolve, is now **skipped** (not
   silently spawned un-isolated) — see the FR-1/FR-3 note below.
2. **Canary account only for the full run.** The FULL live-execution runs on Child B's dedicated canary
   account/profile — never against a live-fleet session. (Solomon-owned.)
3. **Live flag scoped to this shell only.** `FLEET_SPAWN_CONTROL_LIVE=true` for the drill shell; it is
   default-OFF everywhere else and must never be set in a live-fleet session.
4. **Desktop for `wt.exe`.** The scheduled task defaults to `/SC ONSTART`, which runs in **session 0 with
   no desktop** — `wt.exe` may fail to open a visible tab. Prefer `--onlogon --ru <user>` (a logged-in
   desktop is available, and the task runs as an actual interactive user rather than SYSTEM); the setup
   script adds `/IT` automatically for a non-SYSTEM `/RU` so the task can run without a stored password.
   **Registering the task with `/RL HIGHEST` requires an ELEVATED (Administrator) calling shell** —
   confirmed via a direct `IsInRole(Administrator)` check; a non-elevated `schtasks /Create` for this
   task fails with `ERROR: Access is denied.` Run the registration command from an elevated
   PowerShell/terminal.

### FR-1 / FR-3 (SD-LEO-INFRA-FLEET-CANNOT-SELF-001) — the runner's per-slot behavior changed

The per-slot loop in `lib/fleet/reboot-respawn-runner.js` no longer degrades a bad/absent
`account_profile` to a silent, un-isolated spawn (the prior fail-soft policy). It now **skips** that one
slot (logs why, `outcome: 'skipped_no_account_profile'` or `'skipped_profile_resolve_failed'` in the
emitted `fleet_verb_respawn` event), while every other slot in the same run still gets attempted. A
narrow, boot-window-gated (15 min, `os.uptime()`) dedup guard also skips the `coordinator` slot
specifically (`outcome: 'skipped_coordinator_already_live'`) when a live coordinator already resolves
**outside** that window — this is to stop a false trigger (e.g. an operator manually running
`schtasks /Run` to validate the task) from displacing a live coordinator, while never suppressing a
genuine post-reboot restore (any resolver uncertainty/timeout fails **toward** attempting the spawn).
Adam and Solomon are unaffected by the dedup guard — they already have their own singleton guards
elsewhere. See PR #7168 for the full design rationale and ship-review-fixed edge cases.

## In-session NON-mocked simulated-reboot drill (deliverable now, pre-canary)

1. **Seed / confirm the manifest.** Ensure `loadDesiredSlots(supabase)` returns the slot(s) with the
   `resume_uuid` you expect (or upsert a fixture via `upsertDesiredSlot`).
2. **Simulate the reboot.** Release/kill the target live sessions (canary only) so the fleet is at the
   "zero live session" state reboot-respawn must recover from.
3. **Run the real runner.**
   ```pwsh
   $env:FLEET_SPAWN_CONTROL_LIVE = "true"   # or leave unset for a dry-run mechanism check
   node scripts/fleet/reboot-respawn.cjs
   ```
   Expect: one intended/attempted relaunch invocation per slot carrying `claude --resume <that slot's
   uuid>`, and one `fleet_verb_respawn` row per slot in `coordination_events`.
4. **Verify real event rows.**
   ```sql
   SELECT id, event_type, payload->>'callsign' AS callsign, payload->>'resume_uuid' AS resume_uuid, created_at
   FROM coordination_events
   WHERE event_type = 'fleet_verb_respawn' AND created_at > '<drill_start_iso>'
   ORDER BY created_at DESC;
   ```
   Expect ≥1 row per slot (positive assertion — `logCoordinationEvent` is fail-open, so absence is silent).
5. **Verify relaunch ATTEMPT semantics, not guaranteed reattachment.** A genuinely expired `--resume`
   token degrades to a fresh session; the drill asserts the ATTEMPT (correct argv + event), which is the
   honest observable.

The drill runner `runRebootRespawnDrill({ loadFn, spawnFn, queryEventsFn, ... })` runs these same four
PASS/FAIL checks (`manifest_loaded`, `roster_built`, `per_slot_resume_relaunch`, `respawn_events_present`)
against the **real** seams.

## Registering the reboot trigger

**Run from an ELEVATED (Administrator) shell** — `schtasks /Create` with `/RL HIGHEST` refuses
non-elevated callers with `ERROR: Access is denied.`, regardless of which flags below are used.

```pwsh
node scripts/setup-reboot-respawn-task.mjs --onlogon --live --ru <your-username>  # recommended: visible, interactive, no stored password
node scripts/setup-reboot-respawn-task.mjs --onlogon           # register (INERT wrapper, SYSTEM run-as, no desktop for wt.exe)
node scripts/setup-reboot-respawn-task.mjs --dry-run           # print wrapper + schtasks argv, mutate nothing
node scripts/setup-reboot-respawn-task.mjs --status            # query
node scripts/setup-reboot-respawn-task.mjs --remove            # delete
```

`--ru <user>` (non-SYSTEM) now automatically adds `/IT` (interactive token) to the `schtasks` argv, so
the task runs only while that user is logged on and needs no stored `/RP` password
(SD-LEO-INFRA-FLEET-CANNOT-SELF-001 FR-4).

## Full canary live-execution (DEFERRED → Solomon)

The full run — register the ONSTART/ONLOGON task on the canary host, **actually reboot**, and confirm the
fleet is relaunched with reattached sessions — is Solomon's, on Child B's canary account, and is tracked
as a completion-flag follow-up. Do NOT claim a live pass anywhere until this has run for real.

## Why unit tests are insufficient here

`tests/unit/fleet/*` lock the pure/deterministic parts (fail-soft reader, roster shape, `--resume` argv
append + back-compat, `schtasks` argv builder, and the drill checks via injected seams that exercise the
REAL runner). But a real host reboot killing every session and the OS relaunching them via a scheduled
task is unmockable — hence this live tier.
