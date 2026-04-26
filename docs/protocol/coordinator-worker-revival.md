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

## Cross-References

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
