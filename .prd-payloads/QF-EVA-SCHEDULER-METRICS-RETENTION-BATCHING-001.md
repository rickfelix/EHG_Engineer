# eva_scheduler_metrics retention + batching — cap +110k rows/day growth

## Type
bugfix

## Target Repos
EHG_Engineer

## Summary
Coordinator belt-low #4 candidate 2026-07-17: `eva_scheduler_metrics` grows ~+110k rows/day with no retention or write-batching — unbounded table bloat that degrades query cost on the metrics path and inflates DB storage. Real infra-hygiene with a measurable growth rate.

## Functional Requirements
### FR-1: Ground-truth the write pattern + growth
Confirm the ~110k/day rate, the write call sites, and how the metrics are consumed (which reads actually need row-level granularity vs aggregates). Determine the minimum retention window consumers require before changing anything.
### FR-2: Retention policy
Add a retention policy (time-window prune or roll-up of rows older than the required window into aggregates). Prefer roll-up-then-prune where historical trend matters; hard-delete only where row-level history has no consumer. Retention window is config-driven.
### FR-3: Write batching
Batch metric writes (buffer + flush on interval/size) to cut per-row insert overhead where the write path is chatty, without losing data on shutdown (flush on exit).
### FR-4: Test + guard
Test: retention prunes/rolls-up beyond the window while preserving in-window rows and any aggregates consumers read; batching flushes correctly (incl. on shutdown).

## Success Metrics
- metric: unbounded daily growth of eva_scheduler_metrics; target: bounded by retention window
- metric: metric data loss from batching; target: 0 (flush-on-exit)
- metric: consumer-visible regression; target: none

## Smoke Test Steps
1. instruction: Seed rows older than the retention window and run the policy; expected_outcome: old rows pruned/rolled-up, in-window rows + aggregates intact.
2. instruction: Drive batched writes then force a flush/shutdown; expected_outcome: all buffered metrics persisted.

## Sizing / Notes
Tier 2 QF. SOURCE-AND-GO. Coordinator-requested belt-fill; genuine DB-bloat control (+110k/day is real). If retention needs a scheduled prune job, wire it to the existing scheduler, don't invent one. Verify not-dup at materialization.
