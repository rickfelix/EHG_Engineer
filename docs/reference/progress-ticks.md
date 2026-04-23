# Progress Ticks — Intra-Phase Worker Signaling

**Source**: SD-LEO-INFRA-SD-INTRAPHASE-PROGRESS-001
**Audience**: LEO workers (automated and interactive) operating during a phase

## Purpose

The fleet dashboard (`scripts/fleet-dashboard.cjs`) and burn-rate forecast (`scripts/sd-burnrate.js`) both read `strategic_directives_v2.progress_percentage`. Before this feature, that column was only advanced by handoff-boundary writers (the `trigger_sd_progress_recalc` DB trigger and `scripts/modules/handoff/executors/lead-final-approval/helpers.js` at completion). A worker midway through a 30-minute EXEC phase therefore looked identical to a dead-silent stalled one — both showed the same `progress_percentage` value until a handoff row landed.

Progress ticks close that gap: a worker emits a single `progress-tick` command at natural checkpoints, which bumps `strategic_directives_v2.progress_percentage` (monotonically) to a chosen value in `[0, 100]`. The dashboard and burn-rate forecast advance accordingly, with no client-side code changes.

## CLI

```bash
node scripts/progress-tick.js <SD-KEY> <pct 0-100> [label]
```

Examples:

```bash
node scripts/progress-tick.js SD-FOO-001 25 "exploration-done"
node scripts/progress-tick.js SD-FOO-001 50 "first-file-committed"
node scripts/progress-tick.js SD-FOO-001 75 "tests-green"
```

## Contract

| Property | Behavior |
|----------|----------|
| **Latency** | p95 < 200ms on a warm connection (single SELECT + single UPDATE) |
| **Monotonic** | A `pct` less than or equal to the current `progress_percentage` is a no-op. Ticks never walk the value backwards. |
| **Idempotent** | Re-running with the same `pct` is a no-op. |
| **Fail-soft** | CLI never throws. Errors exit 1 (invalid input) or 2 (DB error); the calling worker must not rely on a 0 exit for correctness. |
| **Bounded** | `pct` outside `[0, 100]` is rejected at the client; handoff-boundary writers still own the canonical 0→100 progression at real phase transitions. |

## Recommended Checkpoint Convention

For any phase expected to take more than ~10 minutes, emit ticks at natural points:

| Checkpoint | Semantic meaning |
|------------|------------------|
| `5%`  | Phase entered (emitted automatically by `sd-start.js` after claim success) |
| `25%` | Exploration / planning for this phase complete |
| `50%` | First implementation file committed (or PLAN equivalent: PRD draft inserted) |
| `75%` | Tests passing locally (or PLAN equivalent: sub-agents clean) |
| `100%` | Reserved for handoff-boundary writers. Don't emit 100 from `progress-tick.js`; let the handoff trigger own that transition. |

Short phases (< 10 min) generally don't need manual ticks — the entry signal from `sd-start` and the next handoff-boundary update are enough.

## When NOT to emit

- **Hot loops.** The CLI is a separate Node process invocation (~100ms startup + DB round-trip). Don't call it from a per-iteration loop. Cap frequency at roughly O(10) emissions per SD-phase.
- **Uncertain `pct`.** Emitting a round number just to signal liveness is worse than no tick at all because it pollutes forecast data. Use the existing heartbeat (`claude_sessions.heartbeat_at`) for process-liveness; use ticks only when you have a real checkpoint to report.
- **Inside an exception handler for a fatal error.** If the worker is about to die, let the heartbeat staleness signal that. Don't race to emit a "90%" tick that would mislead the dashboard into thinking the phase is near success.

## Integration Points

| Surface | Behavior |
|---------|----------|
| `scripts/sd-start.js` | Auto-emits a 5% entry tick on successful claim (fail-soft; any error logged as a warning but does not abort sd-start). Monotonic — re-acquiring an SD already past 5% is a no-op. |
| `strategic_directives_v2.progress_percentage` | Canonical integer 0-100 column. Written by the CLI, by existing handoff-boundary writers, and by the DB trigger `trigger_sd_progress_recalc`. All writers are monotonic or semantically final (100 at completion). |
| `scripts/fleet-dashboard.cjs` | No change — reads `progress_percentage` as before; now sees mid-phase values. |
| `scripts/sd-burnrate.js` | No change — `progress_percentage > 0` filter still works; now flips on the first tick instead of the first handoff. |

## Observability

Each successful tick writes one log line to stdout:

```
2026-04-23T12:34:56.789Z SD-FOO-001 EXEC tick=50 first-file-committed
```

This format is pickup-able by follow-up tooling (e.g., a future `fleet-coaching.cjs` enhancement that detects stalled workers by last-tick-age). The label is optional free text — keep it short and specific.

## Failure Modes

| Exit Code | Cause | Impact on Worker |
|-----------|-------|------------------|
| 0 | Success, or monotonic no-op | Continue as normal |
| 1 | Invalid input (unknown SD, pct out of range, missing args) | Worker should log and continue; a bad tick invocation is a caller bug, not an SD-level failure |
| 2 | DB error (connection, constraint violation) | Fleet-wide DB availability issue; worker should continue its main work; heartbeat staleness will surface the outage |

## Interaction with Handoff-Boundary Writers

`progress_percentage` is co-owned with two existing writers:

1. **`trigger_sd_progress_recalc`** (DB trigger on `sd_phase_handoffs`). Fires when a handoff row lands and recomputes the column from handoff progress.
2. **`scripts/modules/handoff/executors/lead-final-approval/helpers.js`** (direct `UPDATE` to `100` at LEAD-FINAL-APPROVAL).

Progress ticks are **advisory between boundaries**. At each real phase boundary, the authoritative writers re-establish the canonical value. In practice this means a worker's tick might briefly read higher than a simultaneous handoff rewrite — but since ticks only walk the value up and real boundaries write either recalculated or terminal values, any read from the dashboard will see a consistent forward progression.

## Rollback

Safe to roll back simply by removing `scripts/progress-tick.js` and the entry-tick block in `scripts/sd-start.js`. No schema changes to revert. `strategic_directives_v2.progress_percentage` was already the canonical column — this SD added another writer to it, nothing else.

## History

An earlier draft of this SD's implementation attempted to extend a separate `sd_phase_progress` table (assumed to exist per migration `20251012_create_phase_progress_table.sql`). That migration was never applied during the 2025-11-30 database consolidation; the table does not exist. See migration `20260423_progress_tick_cleanup.sql` for the cleanup of two orphan functions left behind by the first attempt's partial application. The pivoted design in this document does not depend on `sd_phase_progress`.
