# Fixture-prefix exclusion — stop ZZZ_/UAT test rows leaking into real metrics/gauges

## Type
bugfix

## Target Repos
EHG_Engineer

## Summary
Coordinator belt-low #3 remainder 2026-07-17: fixture/test rows (ZZZ_-prefixed, UAT-prefixed) leak into real gauges and counts — the same class as the ~half-unflagged-synthetic ventures problem that makes raw venture/SD metrics untrustworthy. This directly corrupts the plan-adherence + roadmap gauges the PM lens reads, so it is gauge-integrity work, not cosmetic.

## Functional Requirements
### FR-1: Enumerate the leak surfaces
Grep the metric/count/rollup paths (dashboards, KPI computations, roadmap progress_pct, coordinator gauges) for queries over ventures / SDs / results that do NOT already exclude fixture prefixes (ZZZ_, UAT, __e2e, TEST-HARNESS-) or the is_synthetic/is_demo flags. Produce the concrete list of leaking call sites before editing.
### FR-2: Centralize the exclusion predicate
Add ONE shared exclusion helper (name pattern + synthetic/demo flags) and apply it at every leaking site — do not scatter ad-hoc NOT LIKE clauses. Prefer a reusable predicate/view so a new fixture prefix is added in one place. Where a synthetic flag exists but is unset (the half-unflagged-ventures class), the name-prefix predicate is the backstop.
### FR-3: Test the exclusion
Seed a fixture-prefixed row and assert it is absent from each corrected gauge/count; assert a real row is still present (no over-exclusion).

## Success Metrics
- metric: fixture rows appearing in real gauges/counts; target: 0
- metric: real rows wrongly excluded; target: 0
- metric: leaking call sites remaining after fix; target: 0 (enumerated list all closed)

## Smoke Test Steps
1. instruction: Seed a ZZZ_-prefixed venture + SD, recompute the roadmap/coordinator gauges; expected_outcome: neither appears in any real count.
2. instruction: Confirm a genuine active venture/SD still counts; expected_outcome: present.

## Sizing / Notes
Tier 2. SOURCE-AND-GO. Gauge-integrity — ties the ventures-half-synthetic + is_synthetic traps. Wave-1 foundation. No security/schema keywords (read-path filter + one migration only if a view is added; if so, additive-view no-RLS delegated-apply path applies).
