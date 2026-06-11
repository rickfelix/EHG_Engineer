<!-- Archived from: C:\Users\rickf\AppData\Local\Temp\sd-lint-setdefault-override.md -->
<!-- SD Key: SD-LEO-INFRA-LINT-ALTER-SET-001 -->
<!-- Archived at: 2026-05-30T12:47:57.698Z -->

# CI Lint: ALTER SET DEFAULT vs Code-Override (F12) Drift Detector

## Type
infrastructure

## Target Application
EHG_Engineer

## Priority
medium

## Goal
The F12 bug class (SD-LEO-INFRA-AUTO-STORY-QUALITY-GATE-001): a migration changes a column's default to express an intent, but production code written before the migration hardcodes a different literal at insert time, silently negating the new default. The audit SD-LEO-INFRA-AUDIT-MIGRATION-SET-001 swept all executable `ALTER COLUMN ... SET DEFAULT` columns and found the original F12 (user_stories.status) already remediated and all other overrides intentional — but that was a one-time check. Codify the F12 detection into a recurring CI lint so a future migration-vs-writer conflict is flagged at PR time.

## Changes
- Add a lint script that enumerates every executable `ALTER COLUMN ... SET DEFAULT` (the genuine F12-risk class — a default changed on an existing table; CREATE TABLE defaults are out of class because they are co-created with their writers).
- For each such column, find production writers and classify: (a) honors (writer omits the column or sets the same value), (b) overrides with a different literal — sub-tagged (i) intentional via an allow-list entry or (ii) drift, (c) ambiguous (computed/variable value → report for human review).
- Fail the lint on any (b)(ii) drift — a writer hardcoding a literal that differs from the column's changed default without an allow-list justification.
- Seed the allow-list with the audit's documented intentional overrides (retrospectives.retrospective_type handoff tags; eva_support_decision_log.decision_kind event kinds; user_stories.status boilerplate→draft) so the current tree passes.
- Wire into CI report-only for one cycle, then promote to required.

## Objectives
- A future migration that changes a default is checked against existing writers, so F12-shaped drift is caught at PR time.
- Intentional overrides are explicitly allow-listed with justification, distinguishing them from drift.
- The lint is scoped to the high-signal `ALTER ... SET DEFAULT` class, not the low-ROI CREATE TABLE default set.

## Acceptance Criteria
- AC-1: the lint enumerates every executable `ALTER COLUMN ... SET DEFAULT` column with its new default and production writers.
- AC-2: it classifies each writer as honors / intentional-override (allow-listed) / drift / ambiguous.
- AC-3: it exits non-zero on any non-allow-listed override (drift) and reports ambiguous cases without failing.
- AC-4: the allow-list is seeded with the audit's documented intentional overrides so the current tree passes.
- AC-5: CI runs the lint on PRs touching `database/migrations/*.sql` or known writer paths.
- AC-6: a unit test introduces a synthetic migration default + a conflicting writer literal and asserts the lint fails.

## Demo
1. Run the lint on the current tree → passes (all overrides allow-listed or honoring).
2. Add a synthetic migration setting a column default to 'X' plus a writer hardcoding 'Y' → lint fails, naming the column + writer.
3. Move that override to the allow-list with a justification → lint passes.
