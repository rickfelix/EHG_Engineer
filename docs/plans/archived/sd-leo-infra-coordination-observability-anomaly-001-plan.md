<!-- Archived from: scripts/one-off/_epic4-plan.md -->
<!-- SD Key: SD-LEO-INFRA-COORDINATION-OBSERVABILITY-ANOMALY-001 -->
<!-- Archived at: 2026-06-05T15:04:10.405Z -->

<!-- type: infrastructure -->
<!-- priority: high -->

# Plan: Coordination Observability + Anomaly Detectors (epic #4)

## Target Application
EHG_Engineer

## Goal
Codify the L1–L8 fleet-coordination friction that the coordinator has been resolving manually all session into automated, always-on detection. Add five coordination anomaly detectors to the existing fleet sweep/dashboard. Each detector (a) raises a visible flag in the sweep/dashboard output and (b) logs a structured row to a new `coordination_events` table for later analysis. These events feed epic #3 (the self-improvement loop) downstream.

The whole feature is ADDITIVE and ships DEFAULT-OFF behind a `COORD_DETECTORS_V2` flag. The detectors are strictly READ-ONLY over the claim/session machinery (they observe `claude_sessions`, `strategic_directives_v2`, `session_coordination`, `quick_fixes`) — they MUST NOT modify any claim state, so there is no collision with the atomic work-leasing machinery epic #2 (dade5cc4) is editing in parallel. Depends on the now-complete foundation SD-LEO-INFRA-COMPLETE-TWO-WAY-001.

## Scope
The five detectors, the new events table + emitter, the default-OFF flag wiring into the sweep, and per-detector unit tests. No changes to claim acquisition/release logic.

| Path | Action | Purpose |
| `lib/coordinator/detectors.js` | CREATE | Five pure detector predicates + structured coordination_event builder (READ-only inputs) |
| `lib/coordinator/coordination-events.js` | CREATE | Thin writer that inserts a coordination_event row (fail-open, flag-gated) |
| `database/migrations/coordination_events.sql` | CREATE | New coordination_events table (database-agent BEGIN..ROLLBACK proof) |
| `scripts/claude-session-coordinator.mjs` | MODIFY | Wire detectors into the sweep pass, default-OFF behind COORD_DETECTORS_V2 |
| `tests/unit/coordinator/detectors.test.js` | CREATE | Unit test each detector predicate against synthetic fixtures |

## Strategic Objectives
- Replace manual coordinator vigilance (the L1–L8 friction observed this session) with automated detection that runs every sweep.
- Emit a durable, structured event stream (`coordination_events`) that epic #3's self-improvement loop can consume.
- Prove the observability layer is safe to enable incrementally (default-OFF, read-only, fail-open).

## Acceptance Criteria
- [ ] `coordination_events` table created via reviewed migration (database-agent BEGIN..ROLLBACK proof), columns at minimum: id, event_type, detected_at, severity, payload(jsonb), detector_version.
- [ ] SPLIT_BRAIN detector flags + logs when COUNT(fresh sessions with is_coordinator) > 1.
- [ ] THUNDERING_HERD detector flags + logs when idle_workers > distinct_unclaimed_items.
- [ ] REPLY_STARVATION detector flags + logs when a worker signal is unanswered for longer than threshold T.
- [ ] STUCK_WORKER detector flags + logs when a claimed SD shows no phase progress for longer than X minutes.
- [ ] CLAIM_HALF_WRITE detector flags + logs when a session has sd_key set but the SD-row claiming_session_id is NULL (or vice-versa).
- [ ] All five detectors are DEFAULT-OFF behind COORD_DETECTORS_V2 and emit nothing when the flag is unset.
- [ ] Detectors are READ-ONLY: no writes to claude_sessions/strategic_directives_v2 claim columns; zero collision with epic #2 machinery.
- [ ] Each detector path has a unit test (positive + negative case) against synthetic fixtures.
- [ ] Event writer is fail-open: a DB error logging an event never breaks the sweep.

## Risks
- Migration must be coordinated with the database-agent and proven via BEGIN..ROLLBACK before COMMIT; the additive table must land before any writer is enabled.
- Must remain strictly read-only over claim machinery to avoid colliding with epic #2 (dade5cc4); any shared-file edit is scoped to the sweep entry point only and is additive.
- Default-OFF prevents false-positive alert noise from reaching the live fleet before thresholds are tuned.

## Key Principles
- Additive only; default-OFF behind COORD_DETECTORS_V2; read-only over claim state; fail-open on event-write errors; pure testable detector predicates.

## Success Metrics
- 5/5 detectors implemented with passing unit tests; 0 writes to claim machinery; coordination_events table live; feature inert when flag is off.
