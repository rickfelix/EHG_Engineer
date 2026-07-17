# Flag governance — KILL dead flags COORD_DETECTORS_V2 + SURFACE_INERT_WORKER_V1

## Type
chore

## Target Repos
EHG_Engineer

## Summary
Coordinator belt-low #4 candidate 2026-07-17: two feature flags — COORD_DETECTORS_V2 and SURFACE_INERT_WORKER_V1 — are dead (superseded/never-adopted) and should be removed per flag-governance hygiene so they stop appearing as live toggles and confusing gauge/config reads.

## Functional Requirements
### FR-1: Confirm dead before removal
For each flag, confirm it is truly dead: no live code path branches on it meaningfully (or the branch is permanently one-sided), and it is not the durable signal for an in-flight mode. Grep every read site. Do NOT remove a flag that still gates a real path.
### FR-2: Remove flag + dead branches
Remove the flag definition (leo_feature_flags row + any env/config), delete the now-dead branch(es), keeping the surviving path. One flag per commit for clean revert.
### FR-3: Test/lint
Existing tests green; add/adjust a lint or test asserting the flags are gone and no reference remains.

## Success Metrics
- metric: references to the two dead flags after removal; target: 0
- metric: behavior change on the surviving path; target: none (pure removal)

## Smoke Test Steps
1. instruction: Grep the tree for COORD_DETECTORS_V2 and SURFACE_INERT_WORKER_V1; expected_outcome: no references remain.
2. instruction: Run the affected module tests; expected_outcome: green (surviving path unchanged).

## Sizing / Notes
Tier 1 QF (dead-flag removal). SOURCE-AND-GO. Coordinator-requested belt-fill. CAUTION per the controlled-mode-durable-signal lesson: verify neither flag is a live mode signal before deleting. Verify not-dup at materialization.
