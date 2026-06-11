<!-- Archived from: C:\Users\rickf\AppData\Local\Temp\_p1a_cadence_hygiene.md -->
<!-- SD Key: SD-LEO-INFRA-MAKE-EHG-ENGINEER-001 -->
<!-- Archived at: 2026-06-09T16:13:41.412Z -->

# Make the EHG_Engineer cadence generators honest and self-refreshing

## Type
infrastructure

## Priority
high

## Objective
Make the EHG_Engineer-side cadence GENERATORS produce the data their (already-wired) consumers actually read, so that once the scheduler revives, the chairman surfaces show fresh, correct data instead of stale/drifted artifacts.

## Scope
- Reconcile the `management_reviews` schema drift: `scripts/eva/management-review-round.mjs` writes `eva_narrative` / `pipeline_snapshot`, but the EHG `useManagementReviews.ts` hook reads `overall_score` / `reviewer` / `summary`. Align the generator output to the columns the UI consumes (or add a thin mapping) so reviews render.
- The management-review generator hardcodes "OKR tables do not exist" — they DO (`objectives` / `key_results`). Wire the dormant `okr_snapshot` capture into the generator so the OKR scorecard time-series populates each cycle.
- Wire `scripts/design-quality-scorecard.js` generation into `handoff.js`: today `retrospective-enricher.js` READS `design_quality_scores` but the generator is never invoked at handoff, so scores froze at the 2026-03-09 backfill. Invoke it at the appropriate handoff so fresh SDs get fresh scores.

## Acceptance Criteria
- `management_reviews` generator writes the columns the EHG UI reads (no drift); reviews render.
- `okr_snapshots` populate on each review/cadence cycle.
- `design_quality_scores` receive fresh rows on new handoffs (not frozen at 2026-03-09).

## Success Metrics
- Zero schema-drift mismatches between the management-review generator output and the UI hook.
- `okr_snapshots` count grows per cycle.
- `design_quality_scores` has rows newer than 2026-03-09.

## Rationale
These are wired-but-misleading seams; cleaning them converts credible-but-empty dashboards into a trustworthy baseline. Foundational — every later phase renders into these surfaces. Parallel to P0 (no hard dependency). See the performance-framework plan + docs/protocol/README.md.
