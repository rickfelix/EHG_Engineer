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
| Desired-manifest table (chairman-gated DDL, **NOT applied**) | `database/migrations/20260720_fleet_desired_slots_STAGED.sql` (+ `_DOWN`) |
| Reader / writer / capture / roster translator | `lib/fleet/desired-slots-store.js` (`loadDesiredSlots`, `upsertDesiredSlot`, `captureResumeUuid`, `slotsToRoster`) |
| `resume_uuid` capture at SessionStart | `scripts/hooks/capture-session-id.cjs` (`metadata.resume_uuid := session_id`) |
| `--resume` spawn path | `lib/fleet/spawn-control.js` `buildLiveSpawnInvocation({..., resumeUuid})` |
| Runner (read → roster → per-slot resume relaunch → emit events) | `lib/fleet/reboot-respawn-runner.js` + entrypoint `scripts/fleet/reboot-respawn.cjs` |
| ONSTART/ONLOGON scheduled task | `scripts/setup-reboot-respawn-task.mjs` |
| Drill runner (PASS/FAIL checks) | `lib/fleet/reboot-respawn-drill-runner.js` |

## ⚠️ Preconditions (all mandatory)

1. **Desired manifest exists.** Either apply the chairman-gated migration and seed
   `fleet_desired_slots`, or supply a fixture manifest. Each slot that should reattach needs a
   `resume_uuid` (populated automatically at SessionStart, or via `captureResumeUuid`). With the table
   unapplied, `loadDesiredSlots` fail-softs to `[]` and the runner respawns nothing (loud stderr canary).
2. **Canary account only for the full run.** The FULL live-execution runs on Child B's dedicated canary
   account/profile — never against a live-fleet session. (Solomon-owned.)
3. **Live flag scoped to this shell only.** `FLEET_SPAWN_CONTROL_LIVE=true` for the drill shell; it is
   default-OFF everywhere else and must never be set in a live-fleet session.
4. **Desktop for `wt.exe`.** The scheduled task defaults to `/SC ONSTART`, which runs in **session 0 with
   no desktop** — `wt.exe` may fail to open a visible tab. Prefer `--onlogon` (a logged-in desktop is
   available) where acceptable; otherwise document/accept the headless session-0 constraint and validate
   the wt.exe invocation on the real host before relying on it.

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

```pwsh
node scripts/setup-reboot-respawn-task.mjs --onlogon           # register (INERT wrapper by default)
node scripts/setup-reboot-respawn-task.mjs --onlogon --live    # wrapper sets FLEET_SPAWN_CONTROL_LIVE=true
node scripts/setup-reboot-respawn-task.mjs --dry-run           # print wrapper + schtasks argv, mutate nothing
node scripts/setup-reboot-respawn-task.mjs --status            # query
node scripts/setup-reboot-respawn-task.mjs --remove            # delete
```

## Full canary live-execution (DEFERRED → Solomon)

The full run — register the ONSTART/ONLOGON task on the canary host, **actually reboot**, and confirm the
fleet is relaunched with reattached sessions — is Solomon's, on Child B's canary account, and is tracked
as a completion-flag follow-up. Do NOT claim a live pass anywhere until this has run for real.

## Why unit tests are insufficient here

`tests/unit/fleet/*` lock the pure/deterministic parts (fail-soft reader, roster shape, `--resume` argv
append + back-compat, `schtasks` argv builder, and the drill checks via injected seams that exercise the
REAL runner). But a real host reboot killing every session and the OS relaunching them via a scheduled
task is unmockable — hence this live tier.
