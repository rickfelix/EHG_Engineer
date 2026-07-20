---
category: protocol
status: active
version: 1.0
author: SD-LEO-INFRA-FLEET-SPAWN-CONTROL-001
last_updated: 2026-07-20
tags: [fleet, spawn-control, session-lifecycle, singleton-refresh, window-handle]
---

# Fleet Spawn-Control: Six-Verb Session Control Layer

**SD**: `SD-LEO-INFRA-FLEET-SPAWN-CONTROL-001`
**Module**: `lib/fleet/spawn-control.js`, `lib/fleet/window-handle.js`, `lib/fleet/session-registry-adapter.js`
**Status**: shipped, default-OFF (see Activation Gate below)

This is the CONTROL layer of the fleet launcher (chairman-approved, D-0719-BUILDGO=A + Solomon scope verdict G3/U1/U3). It exposes exactly **six governed verbs** over live fleet sessions — no more, by design:

| Verb | Purpose |
|---|---|
| `spawn` | Launch a detached, visible Windows Terminal session and capture its window handle |
| `attach` | Card → registry → real terminal window (focus via the captured handle) |
| `stop` | Release a live session without spawning a replacement |
| `restart` | Same-account respawn — role-serial for singletons, parallel for workers |
| `relaunchUnderProfile` | The ratified account-switch verb — relaunches one session under a different `CLAUDE_CONFIG_DIR` profile |
| `drainAndRestart` | Waits for the idle boundary (`claim-boundary-probe.cjs`) before restarting |

It composes existing primitives rather than duplicating them: `scripts/fleet/worker-spawn-executor.cjs`'s spawn-detached pattern, `lib/coordinator/singleton-refresh-sequencer.cjs`'s register-then-retire mutex, `lib/fleet/claim-boundary-probe.cjs`'s idle-boundary probe, and a thin DB adapter (`lib/fleet/session-registry-adapter.js`) over SD-A's pure `session-registry.js`/`session-manifest.js` libs (`SD-LEO-INFRA-FLEET-REGISTRY-MANIFEST-001`).

## Activation Gate (default-OFF)

Mirrors the existing `WORKER_SPAWN_EXECUTOR_LIVE` convention (`docs/protocol/coordinator-worker-revival.md`):

- **`FLEET_SPAWN_CONTROL_LIVE`** (default off) — gates the live OS-spawn surface. With the flag unset, every verb that would spawn/relaunch a process instead logs the invocation it WOULD run and returns `{ live: false, invocation }` — zero OS side effects.
- **`FLEET_ACCOUNT_PROFILES_DIR`** — required for `relaunchUnderProfile()`. The base directory under which per-account `CLAUDE_CONFIG_DIR` profiles live. `resolveProfileDir()` accepts only a bare alnum/dash/underscore profile *name* (never a raw path) and joins it under this base dir — rejects traversal/absolute-path attempts outright.

**Operator gate before flipping `FLEET_SPAWN_CONTROL_LIVE=true`**: the exact `wt.exe` invocation in `buildLiveSpawnInvocation()` is host-specific and must be validated on the target fleet host first, exactly as `worker-spawn-executor.cjs`'s own README section requires for its live flag.

## Safety Invariants (enforced in code, not just documented)

- **Spawn-detached**: every spawn uses `child_process.spawn(..., { detached: true, stdio: 'ignore' }); child.unref()` — the supervisor is never the OS process-parent, so a supervisor crash/kill never kills a fleet session.
- **CLAUDE_CONFIG_DIR isolation**: `relaunchUnderProfile()` injects the profile dir only into the *spawned child's* env object — never `process.env` of the supervisor — with a runtime assertion (`supervisorConfigDirBefore !== supervisorConfigDirAfter` throws) that catches any future regression immediately.
- **No premature session release**: `restart()`/`relaunchUnderProfile()` never mark the old session released unless the replacement genuinely spawned live (`spawnResult.live === true`) — calling these verbs in the default (non-live) configuration is a documented no-op, not a silent capacity loss.
- **Metadata merge, not overwrite**: the post-spawn window-handle persist reads the current `claude_sessions.metadata` first and merges client-side (never a bare `.update({ metadata: {...} })`), scoped by `session_id` with a freshness check on `created_at` — never a bare OS-recyclable `pid` match.
- **Role-serial / worker-parallel respawn**: singleton roles (`coordinator`/`adam`/`solomon`) restart through the EXISTING `sequenceSingletonRefresh()` register-then-retire mutex (never a bespoke sequence); worker restarts are parallel-safe, deduped by callsign via the same `resolveSpawnDecisions()` decision logic `worker-spawn-executor.cjs` already uses.
- **Event emission allowlist**: every verb call emits a `coordination_events` row via `logCoordinationEvent()` with a payload hard-locked to `{verb, outcome, at}` — no extension point, so a `CLAUDE_CONFIG_DIR` path or profile directory can never leak into the event log.

## Known, Accepted Limitations

- **TOCTOU race in dedup-by-callsign**: `spawn()`'s already-live check reads a point-in-time snapshot with no reservation/lock before the OS spawn — two near-simultaneous calls for the same callsign can both proceed. Inherited from `resolveSpawnDecisions()`'s own shape (shared with `worker-spawn-executor.cjs`); acceptable for a default-OFF, low-concurrency control surface.
- **Live OS-spawn path unexercised**: the visible-Windows-Terminal + window-handle-capture + profile-injection path is unit-tested with injected/mocked I/O only — it has not been run against a real `wt.exe` process. Requires the operator host-validation step above before `FLEET_SPAWN_CONTROL_LIVE=true`.

## Sibling SDs (fleet launcher program)

- **SD-A** `SD-LEO-INFRA-FLEET-REGISTRY-MANIFEST-001` (completed) — the session-registry/manifest SSOT this SD adapts (`lib/fleet/session-registry-adapter.js`).
- **SD-C** `SD-LEO-INFRA-FLEET-VIEW-BADGES-001` — pure read/render consumer of the lifecycle event feed this SD emits.
- **SD-E** `SD-LEO-INFRA-FLEET-WATCHDOG-001` (shipped) — `lib/fleet/session-watchdog.js`'s AUTH-LOST remediation string names `relaunchUnderProfile()` by name (verb/state-model alignment, FR-10).

## Cross-References

- [Coordinator-Side Worker Revival Contract](./coordinator-worker-revival.md) — sibling default-OFF live-spawn-gate pattern (`WORKER_SPAWN_EXECUTOR_LIVE`)
- Retrospective: `SD-LEO-INFRA-FLEET-SPAWN-CONTROL-001` (quality_score 90) — documents the 2 CRITICAL data-integrity bugs an independent adversarial review caught and fixed before merge, and the CI-only cross-platform path-join bug

## Reference

- `lib/fleet/spawn-control.js` — the six verbs
- `lib/fleet/window-handle.js` — bounded-retry `MainWindowHandle` capture + `SetForegroundWindow` focus
- `lib/fleet/session-registry-adapter.js` — DB adapter over SD-A's pure libs
- Tests: `tests/unit/fleet/spawn-control.test.js`, `tests/unit/fleet/window-handle.test.js`, `tests/unit/fleet/session-registry-adapter.test.js` (72 tests)
