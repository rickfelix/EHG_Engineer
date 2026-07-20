# Fleet Supervisor — Kill-Survival Live Drill (G1a)

**SD:** SD-LEO-INFRA-LEO-COMPLETION-001-C · **Owner acceptance:** Solomon re-run · **Tier:** LIVE (operator-run, not CI)

This runbook proves the property that unit tests **cannot** (SIGKILL is uncatchable, and the gap G1a
closes was itself caused by mocked seams): killing the fleet supervisor process with `kill -9` leaves
its child sessions running, and a **real** (non-mocked) `fleet_verb_*` row lands in `coordination_events`.

## ⚠️ Preconditions (all mandatory)

1. **Canary account only.** Run on Child B's dedicated canary account/profile. The kill drill must
   `assert account_profile === canary` before any kill (Child B assert-before-kill guard). NEVER run
   against a live-fleet session.
2. **Real Windows fleet host.** The survival property is Windows-specific (`wt.exe`, detached process
   groups, Job Objects). Do **not** run under WSL/Linux CI — a parent Job Object with
   `KILL_ON_JOB_CLOSE` would kill children regardless and give a false negative. Use the real host.
3. **Live flag scoped to this shell only.** `FLEET_SPAWN_CONTROL_LIVE=true` for the drill shell; it is
   default-OFF everywhere else and must never be set in a live-fleet session.

## Steps

1. **Start the supervisor (live).**
   ```pwsh
   $env:FLEET_SPAWN_CONTROL_LIVE = "true"
   $env:FLEET_SUPERVISOR_ROSTER = '[{"role":"worker","callsign":"Canary-1","accountProfile":"canary"}]'
   node scripts/fleet/fleet-supervisor.cjs
   ```
   Expect: the supervisor prints its own `pid` and `live=true`, spawns `Canary-1`, and a
   `fleet_verb_spawn` row appears in `coordination_events`.

2. **Record child identity.** Note the supervisor pid AND the child session. The captured pid is the
   `wt.exe` window; the actual `claude` process is a **grandchild** — verify liveness by the
   `claude_sessions` row (`heartbeat_at`, `pid`) for callsign `Canary-1`, not by the `wt.exe` pid alone.

3. **Kill -9 the SUPERVISOR (not the child).**
   ```pwsh
   Stop-Process -Id <supervisor_pid> -Force   # SIGKILL-equivalent; uncatchable
   ```

4. **Verify survival (~30s later).** Re-check `Canary-1`'s `claude_sessions` row: `status` still active
   and `heartbeat_at` advanced past the kill time → the child **survived** the supervisor's death
   (detached + unref'd → OS re-parented it). A cascaded death = FAIL.

5. **Verify a real event row.**
   ```sql
   SELECT id, event_type, created_at FROM coordination_events
   WHERE event_type LIKE 'fleet_verb_%' AND created_at > '<drill_start_iso>'
   ORDER BY created_at DESC;
   ```
   Expect ≥1 row (positive assertion — not "no throw"; `emitVerbEvent` is fail-open so absence is silent).

## Pass criteria (maps to smoke_test_steps AC-1..AC-3)

- Supervisor ran as a real killable OS process and tracked ≥1 canary child.
- After `kill -9` of the supervisor, all canary children remain alive/heartbeating (~30s).
- A real, non-mocked `coordination_events` `fleet_verb_*` row exists for the drill window.

## Teardown / idempotency (MANDATORY — leave nothing hot)

The graceful shutdown path is **non-cascading** (children survive a normal `SIGINT`/`SIGTERM`), so the
surviving `Canary-1` must be cleaned up explicitly so a re-run does not orphan sessions:

1. Stop the surviving canary child(ren): `node -e "..."` or the cockpit stop verb targeting `Canary-1`.
2. Release their `claude_sessions` rows (`status='released'`).
3. **Unset `FLEET_SPAWN_CONTROL_LIVE`** in the drill shell / close it.

Re-running the drill from a clean canary account must reproduce the same pass criteria (idempotent).

## Why unit tests are insufficient here

`tests/unit/fleet/spawn-control.test.js` now asserts the **real** `detached:true`/`stdio:'ignore'`
options reach `child_process.spawn` (mutation-verified: removing `detached:true` turns it red), and
`tests/unit/fleet/fleet-supervisor.test.js` locks the non-cascading teardown + watch-loop remediation.
But OS re-parenting under `kill -9` on the real Windows host is unmockable — hence this live tier.
