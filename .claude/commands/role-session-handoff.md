# Role Session Handoff Protocol

SD-LEO-INFRA-ROLE-SESSION-HANDOFF-PROTOCOL-001-A — coordinator identity write-path invariants.

These four rules govern every transition of the coordinator identity (who holds `is_coordinator=true`).

## The Four Rules

### Rule 1 — Never 0, Never 2 holders

At no instant should the fleet have zero coordinator holders (no coordinator → workers go dark) or two concurrent holders (split-brain → workers route to stale pointer). The protocol maintains exactly one holder at all times.

### Rule 2 — Register new before retiring old

When a new coordinator session calls `setActiveCoordinator` (under `COORDINATOR_TWOWAY_V2=on`), the sequence is:

1. UPSERT the new session's `is_coordinator=true` into the DB (durable registration)
2. THEN retire all other `is_coordinator` sessions via `clearCoordinatorFlagFromSession` (metadata-only, NO pointer delete)
3. THEN write `.claude/active-coordinator.json` (pointer written LAST — always points at an already-DB-registered session)

This order guarantees no 0-holder gap: the new holder is durable before any incumbent is removed.

### Rule 3 — DB canonical, pointer file is advisory cache

`claude_sessions.metadata.is_coordinator` is the authoritative source of truth. `.claude/active-coordinator.json` is a local advisory cache that speeds up `getActiveCoordinatorId` resolution. The file may be absent or stale (e.g., after a `git checkout` clobbers it) — the DB is always definitive.

The `post-checkout-role-restore.cjs` hook (`scripts/hooks/post-checkout-role-restore.cjs`) rebuilds the pointer from the DB after any git checkout, so `session-role-orient.cjs` keeps emitting the `COORDINATOR` role banner correctly.

### Rule 4 — Auto split-brain resolve to the canonical winner

When the sweep's `runAndLogDetectors` detects `SPLIT_BRAIN` (multiple fresh `is_coordinator` sessions) and `COORDINATOR_TWOWAY_V2=on`, it takes a single consistent snapshot of all `is_coordinator` sessions, elects the canonical winner via `pickCanonicalCoordinator(snapshot)` (coordinator_since DESC, session_id ASC), and clears all losers. The winner is NEVER cleared. The resolve is idempotent: ≤1 holder → no-op.

## Key implementation locations

| Concern | Location |
|---------|----------|
| `setActiveCoordinator` (register-before-retire) | `lib/coordinator/resolve.cjs` |
| `clearCoordinatorFlagFromSession` (metadata-only clear) | `lib/coordinator/resolve.cjs` |
| `clearActiveCoordinator` (pointer delete + metadata clear, existing callers) | `lib/coordinator/resolve.cjs` |
| Auto split-brain resolve | `lib/coordinator/coordination-events.cjs` `runAndLogDetectors` |
| Post-checkout pointer restore hook | `scripts/hooks/post-checkout-role-restore.cjs` |
| Feature flag | `COORDINATOR_TWOWAY_V2=on` (all new behavior is default-OFF) |

## Feature flag

All new write-path behavior is gated behind `COORDINATOR_TWOWAY_V2=on`. With the flag unset or `off`, `setActiveCoordinator` is byte-identical to the pre-FR-1 legacy behavior, and the auto-resolve block is skipped. The post-checkout hook is flag-free (pointer restoration is always safe).
