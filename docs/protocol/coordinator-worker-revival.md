---
category: protocol
status: active
version: 1.0
author: SD-LEO-INFRA-COORDINATOR-WORKER-REVIVAL-001
last_updated: 2026-04-26
tags: [fleet, coordinator, worker-revival, session-lifecycle, spawn-execution]
---

# Coordinator-Side Worker Revival Contract

**SD**: `SD-LEO-INFRA-COORDINATOR-WORKER-REVIVAL-001`
**Module**: `worker_spawn_requests` table + `coordination_message_type` enum (`SPAWN_REQUEST` value)
**Enforcement points**: `scripts/coordinator-revive.cjs` (writer), `scripts/fleet-dashboard.cjs` (reader, dashboard surface), external spawn-execution layer (consumer — out of scope)

This contract enables the coordinator to file revival requests for worker callsigns without an active session, replacing the manual restart-of-N-CC-instances toil between SD completions. The contract is **request-only**: this SD ships the writer, the dashboard, the schema, and the bus message. The spawn-execution layer that actually starts new Claude Code instances is **out of scope** — it is documented (see "Spawn-Execution Options" below) but not wired.

## Purpose

When all worker sessions exit (after their first SD or post-completion), the coordinator has no DB-side signal mechanism to spawn fresh workers. `session_coordination` only fires when worker sessions are RUNNING and check their inbox. With 0 active workers, the queue stalls until a human re-invokes Claude Code instances. This contract turns that stall into a one-line operator action: `/coordinator revive-all`.

## Schema

`worker_spawn_requests` — see `database/migrations/20260426_worker_spawn_requests.sql` for the canonical definition.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | gen_random_uuid() default |
| `requested_by_session_id` | TEXT (FK→claude_sessions, ON DELETE SET NULL) | Coordinator that filed the request; NULL after audit rotation |
| `requested_callsign` | TEXT NOT NULL | Subset of NATO roster: Alpha, Bravo, Charlie, Delta, Echo, Foxtrot, Golf, Hotel |
| `status` | TEXT (CHECK: pending\|fulfilled\|expired\|cancelled) | Default 'pending' |
| `requested_at` | TIMESTAMPTZ NOT NULL | Default NOW() |
| `fulfilled_by_session_id` | TEXT (FK→claude_sessions, ON DELETE SET NULL) | Worker that picked up the request |
| `fulfilled_at` | TIMESTAMPTZ | Set by the spawn-execution layer when consumed |
| `expires_at` | TIMESTAMPTZ NOT NULL | Default NOW() + INTERVAL '1 hour' |
| `payload` | JSONB | Future expansion |

**Indexes**:
- `idx_wsr_unique_pending_callsign` — partial UNIQUE on `(requested_callsign)` WHERE `status='pending'` (idempotency)
- `idx_wsr_status_requested_at` — for dashboard reads
- `idx_wsr_requested_by_session_id` — for audit queries

**RLS**: enabled; `service_role` policy `service_role_all` permits full access. Application paths (this script + fleet-dashboard.cjs) run via service-role.

## Lifecycle

```
                      ┌────────────┐
                      │  pending   │ ← INSERT by /coordinator revive
                      └─────┬──────┘
            ┌───────────────┼───────────────┐
            ▼               ▼               ▼
       ┌─────────┐    ┌──────────┐    ┌────────────┐
       │fulfilled│    │ expired  │    │ cancelled  │
       └─────────┘    └──────────┘    └────────────┘
       ↑              ↑               ↑
       │              │               │
       │              expires_at      coordinator
       │              < NOW()         override
       │              (consumer       (cancel-revive,
       │              filters)        future)
       │
       spawn-execution layer
       starts a CC instance,
       UPDATEs status + fulfilled_*
```

**No DB-side sweeper** — consumers filter `status='pending' AND expires_at > NOW()`. Expired rows are evidence-of-no-consumer, not garbage.

## Idempotency

The partial unique index enforces: **at most one pending row per callsign at any time**. Repeated `/coordinator revive Bravo` calls within an expiry window are no-ops at the DB layer (unique-violation surfaced as "already pending" by the writer script). This is the canonical mechanism — clients should NOT pre-check `SELECT WHERE callsign='X' AND status='pending'` before insert; rely on the constraint.

## Consumer Responsibilities

A spawn-execution layer that consumes this contract MUST:

1. **Filter** by `status='pending' AND expires_at > NOW()` — never act on expired rows.
2. **Atomically claim** before spawning: `UPDATE worker_spawn_requests SET status='fulfilled', fulfilled_by_session_id=$1, fulfilled_at=NOW() WHERE id=$2 AND status='pending' RETURNING id`. If the UPDATE returns 0 rows, another consumer claimed it — do not spawn.
3. **Honor expiry** — if a consumer is slow, the row may have expired. Re-check `expires_at` after claim, before spawn.
4. **Spawn ONE CC instance per claimed row** — multiple instances per row breaks the idempotency contract.
5. **Subscribe (optional) to `SPAWN_REQUEST` broadcasts** — if the consumer needs real-time notification rather than polling. Broadcasts are best-effort; the canonical contract is the table.

## Spawn-Execution Options

This SD does not pick a spawn-execution layer. Trade-offs for future implementers:

| Layer | Pros | Cons | When to use |
|---|---|---|---|
| **External watchdog daemon** | Simple, pollable, runs anywhere | Need to ship + monitor a separate process; cold-start delay | Dev workstation with a long-running shell; teams that already have a watchdog framework |
| **Desktop notification** | No infra required; human-in-the-loop preserves judgment | Needs OS-specific integration (macOS/Windows/Linux differ); not unattended | One-operator workflows where step-away is short |
| **OS-level supervisor** (systemd, launchd, Task Scheduler) | Survives reboots; native to the OS; well-supported | OS-specific config; harder to test; security review needed for invoking CC binary | Production-grade fleet on a dedicated host |
| **GitHub Actions cron** | No local infra; auditable in CI; integrates with existing GH-Actions toolchain | Spin-up cost (CI minutes); not real-time (5+ min minimum cadence); requires repo write access | Cloud-first teams; already-paying for GHA minutes |

**Default recommendation**: external watchdog for dev, OS-level supervisor for prod. Document the choice in the consumer's own SD when wiring it.

## Operator UX

```
/coordinator revive Bravo
  ✓ Revival requested for Bravo
    row_id: <uuid>
    expires_at: 2026-04-26T19:25:00Z
    broadcast: SPAWN_REQUEST emitted on session_coordination

/coordinator revive Bravo  (run again within expiry window)
  ↺ Bravo: already has a pending revival request.
    No new row inserted (idempotency rule: one pending per callsign).

/coordinator revive-all
  ✓ Charlie: revival requested (row <uuid>)
  ↺ Delta: already pending (idempotency hit, no new row)
  ✓ Echo: revival requested (row <uuid>)

  revive-all: 2 inserted, 1 skipped (already pending), 0 failed
```

The `revival_pending` section of `fleet-dashboard.cjs` displays open requests with age + expires-in. It is hidden when zero rows are pending.

## Ops Wiring & Validation (CHILD C — launch-shape-independent)

> Added by SD-LEO-INFRA-WORKER-REVIVAL-GOLIVE-READINESS-001-D. These steps are
> **independent of the spawn launch model**. The launch model itself
> (interactive-TTY persistent `/loop` vs stateless per-turn runner) is
> **DEFERRED to CHILD A** (SD-...-001-B) — a chairman-routed architecture
> decision. Do NOT infer a launch model from this section.

### Executor (dry-run by default)

```bash
npm run fleet:spawn-executor          # DRY-RUN unless WORKER_SPAWN_EXECUTOR_LIVE=true
```

Gate flags (documented in `.env.example`, both default-safe):
- `WORKER_SPAWN_EXECUTOR_LIVE` (default off) — the live OS-spawn gate; **operator-gated**, never enable autonomously.
- `WORKER_SPAWN_EXECUTOR_PER_TICK_CAP` (default 2) — max spawns per executor tick.

### Supersede expired-pending spawn requests (idempotent)

A pending `worker_spawn_request` past its `expires_at` keeps the
partial-unique-index `idx_wsr_unique_pending_callsign` (UNIQUE per callsign
WHERE `status='pending'`) occupied, blocking a fresh revival re-file for that
callsign. There is **no always-on DB-side sweeper** (per the
SD-LEO-INFRA-WORKER-EXTERNAL-REVIVAL-001 contract) — run the operator step:

```bash
npm run fleet:supersede-expired-spawns
```

It flips `pending AND expires_at<=now()` rows to `expired` (a live pending row,
`expires_at` in the future, is never touched) and is **idempotent** — a second
run supersedes 0 rows. It is a thin wrapper around the canonical reaper
`reapExpiredPendingRequests` (`scripts/coordinator-revive.cjs`).

### Validation: fulfilled-with-live-session vs fulfilled-but-dead

A request marked `fulfilled` only delivered persistent capacity if its session
is actually alive. Partition fulfilled requests using the **authoritative**
liveness surface `v_active_sessions` (same basis the executor's
`deriveLiveCallsigns` uses) — never raw row age:

```sql
SELECT
  wsr.id,
  wsr.requested_callsign,
  wsr.fulfilled_by_session_id,
  CASE WHEN vas.session_id IS NOT NULL AND vas.computed_status = 'active'
       THEN 'fulfilled_live' ELSE 'fulfilled_dead' END AS liveness
FROM worker_spawn_requests wsr
LEFT JOIN v_active_sessions vas
  ON vas.session_id = wsr.fulfilled_by_session_id
WHERE wsr.status = 'fulfilled'
ORDER BY liveness, wsr.requested_callsign;
```

`fulfilled_dead` rows are the signal that a "revival" produced no persistent
worker — the exact failure mode CHILD A's launch-model decision must close.

## Cross-References

- [Fleet Spawn-Control (six-verb session control layer)](./fleet-spawn-control.md) — sibling default-OFF live-spawn-gate pattern (`FLEET_SPAWN_CONTROL_LIVE`), builds a governed spawn/attach/stop/restart/relaunch-under-profile/drain-and-restart API rather than the request-only revival contract here
- [Pre-Claim Cadence Gate](./cadence-gate.md) — sibling protocol contract, similar shape
- [Fleet Coordination Reference](../reference/fleet-coordination.md) — overall fleet model
- [Worker Registry Guide](../reference/worker-registry-guide.md) — callsign roster + identity assignment
- [Claude Code Session Continuation](../reference/claude-code-session-continuation.md) — session_id stability rules

## Reference

- Schema migration: `database/migrations/20260426_worker_spawn_requests.sql`
- Enum migration: `database/migrations/20260426_add_spawn_request_enum.sql`
- Writer script: `scripts/coordinator-revive.cjs`
- Slash command: `.claude/commands/coordinator.md` — `/coordinator revive [callsign]` and `/coordinator revive-all`
- Dashboard reader: `scripts/fleet-dashboard.cjs` — `printRevivalPending(d)` section

## Governance Audit Queries

```sql
-- All revival requests filed in last 7 days
SELECT requested_at, requested_callsign, status, fulfilled_at - requested_at AS time_to_fulfill
FROM worker_spawn_requests
WHERE requested_at > NOW() - INTERVAL '7 days'
ORDER BY requested_at DESC;

-- Expired-without-fulfillment rate (signal: consumer wiring broken)
SELECT
  COUNT(*) FILTER (WHERE status='expired') AS expired,
  COUNT(*) FILTER (WHERE status='fulfilled') AS fulfilled,
  COUNT(*) AS total
FROM worker_spawn_requests
WHERE requested_at > NOW() - INTERVAL '30 days';

-- Pending requests right now (operator dashboard equivalent)
SELECT requested_callsign, NOW() - requested_at AS age, expires_at - NOW() AS expires_in
FROM worker_spawn_requests
WHERE status='pending' AND expires_at > NOW()
ORDER BY requested_at ASC;
```

## Inert on this host (surfaced via sweep detector)

No spawn-execution layer consumes `worker_spawn_requests` on this host, so revival is **inert**: `/coordinator revive` files requests that are never fulfilled (`fulfilled_at` stays NULL). SD-LEO-INFRA-SURFACE-INERT-WORKER-001 adds a READ-ONLY detector to the stale-session sweep that surfaces this instead of letting requests pile up silently.

- **Flag (default-OFF):** `SURFACE_INERT_WORKER_V1=true` enables the detector. Inert (zero reads/writes) when unset.
- **Threshold:** `INERT_WORKER_AGE_MIN` (default 360) — minimum `requested_at` age (minutes) before a pending, unfulfilled request is flagged. Expired-but-still-pending rows count.
- **Alert:** on a match, ONE de-duped `session_coordination` row (`message_type=INFO`, `payload.kind=inert_worker_alert`, `target_session=broadcast-coordinator`, 24h expiry) carries the paste-able fleet-worker `/loop` startup prompt — the only path that restores capacity today. De-dup skips while an unacknowledged, unexpired alert exists.
- **Scope:** detection + operator surfacing only. Building the spawn-execution daemon remains out of scope (see above).

## Idle-Gap Stall Prevention — always arm a ScheduleWakeup

**SD**: `SD-FDBK-ENH-FLEET-WORKER-ATTRITION-001` (attrition cause #4)

Revival (above) is the *cure* for an exited worker. The idle-gap stall is the *cause* of the most common silent exit: an autonomous `/loop` only re-fires on a `ScheduleWakeup` tick (or a human message), so a worker that **ends a turn at an idle/decision point without arming a `ScheduleWakeup` goes silent indefinitely** — it still shows `claude_sessions.loop_state='active'` (phantom-active) but never wakes, and its idle worktree is then reaped by the claim-sweep. The most common trigger is emitting a bare `/compact` and stopping (a worker cannot self-invoke `/compact`, so this just ends the turn with no wakeup armed).

### The mandate (worker-loop guidance)
- **Arm a `ScheduleWakeup` at the END of EVERY iteration** — short delay when work is in-flight, ~20min when idle — **not only** in the no-workable-SD branch. The canonical paste-able wake-prompt (`FLEET_WORKER_STARTUP_PROMPT` in `lib/coordinator/coordination-events.cjs`) states this.
- **Never emit a bare `/compact` and stop.** If context is heavy, the harness auto-summarizes (just continue) or invoke the `/context-compact` skill and keep going.
- **To END the loop on purpose**, set `claude_sessions.loop_state='exited'` for your session, then stop. That is the legitimate, non-stall exit.

### Enforcement hook (default-OFF)
`scripts/hooks/stop-loop-wakeup-reminder.cjs` (Stop hook, gated by `LEO_LOOP_WAKEUP_REMINDER`, default off) detects a `/loop` worker ending a turn with `loop_state='active'` (no wakeup armed) and **blocks the stop once** with a reminder to arm a `ScheduleWakeup` or set `loop_state='exited'`.

- **State signal:** relies on `loop_state` (`loop-state-tracker.cjs`) — `awaiting_tick` means a wakeup IS armed (no reminder); `active` means mid-iteration with none armed (reminder fires); `exited`/null are never reminded.
- **Anti-infinite-loop:** never blocks when `stop_hook_active` is already true (the worker saw the reminder once and chose to stop) — it yields on the second pass.
- **Fail-open:** any error, unresolvable session, or DB-unavailable condition allows the stop (the hook never traps a worker). Default-OFF means the wiring is a runtime no-op until an operator sets the flag.

