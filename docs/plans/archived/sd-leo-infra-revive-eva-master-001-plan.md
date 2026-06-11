<!-- Archived from: C:\Users\rickf\AppData\Local\Temp\_p0_scheduler.md -->
<!-- SD Key: SD-LEO-INFRA-REVIVE-EVA-MASTER-001 -->
<!-- Archived at: 2026-06-09T16:13:40.208Z -->

# Revive the EVA Master Scheduler cadence daemon (generate-but-await-acceptance)

## Type
infrastructure

## Priority
high

## Objective
Revive the dead EVA Master Scheduler daemon (`lib/eva/eva-master-scheduler.js`, heartbeat stale since 2026-02-24) — the single point of failure behind the fleet's stale weekly/monthly performance artifacts (Friday meeting, weekly management review, monthly OKR generation, OKR snapshots, CEO reports, gap-analysis cadence are all 0/stale DESPITE fully-wired consumers). Re-establish the cadence so the existing machinery produces real artifacts again, under a chairman-decided generate-but-await-acceptance policy.

## Scope
- Stand up `lib/eva/eva-master-scheduler.js` as a real cron / long-lived service. It already registers friday_meeting / weekly_management_review / OKR rounds / gap rounds, but `scripts/cron/` has only quality/cascade/build jobs — nothing runs it (VERIFIED). Add the missing scheduler job/service.
- DEFINE each cadence as an explicit LOOP before scheduling it — a loop needs a defined workflow to run. For friday_meeting / weekly_management_review / monthly OKR generation / CEO report / gap round, specify: trigger cadence, inputs, the artifact it produces, and its acceptance state. Apply the loop-engineering discipline from the LEO Harness research: these are DURABLE STRATEGIC cadences, NOT session-scoped `/loop` (which hard-expires at 7 days and dies on session close) — use the durable scheduler tier; treat the generate-but-await-acceptance state below as each loop's exit/handoff contract.
- Add a liveness alarm on `eva_scheduler_heartbeat` (alert when stale beyond threshold) so a future death is detected, not silent.
- CADENCE POLICY (chairman-decided 2026-06-09): the scheduler AUTO-GENERATES each cadence artifact on schedule, but STRATEGIC ones (Friday agenda, management review, monthly OKR generation, CEO reports) land in a `pending_chairman_acceptance` state rather than auto-applying; the chairman accepts in the Friday rhythm. Non-destructive snapshots (e.g. `okr_snapshots` capture) may auto-persist. The `lib/eva/jobs/okr-monthly-generator.js` currently DEFAULTS TO DRY-RUN (never persists) — change it to persist into the pending-acceptance state, not dry-run.
- Clean the ~43,185 test-pollution rows from `management_reviews` so the real cadence is not drowned (quarantine/delete test rows; preserve any genuine reviews).
- Prefer NO new schema; if a pending-acceptance flag is needed, add a minimal additive status column/value rather than a new table.

## Acceptance Criteria
- The scheduler runs on a real cron/service and refreshes `eva_scheduler_heartbeat`; the liveness alarm fires when the heartbeat goes stale.
- A Friday / management-review / OKR cycle produces artifacts in `pending_chairman_acceptance` state (not auto-applied).
- `okr-monthly-generator.js` persists (to pending-acceptance), no longer dry-run-only.
- `management_reviews` test-pollution removed.

## Success Metrics
- `eva_scheduler_heartbeat` stays fresh (younger than its cadence interval).
- At least one real artifact generated per cadence type after revival.
- `management_reviews` row count reflects genuine reviews, not ~43K test rows.

## Rationale
VERIFIED dead since 2026-02-24; `scripts/cron/` has no scheduler job (VERIFIED). This single revival simultaneously reanimates OKR refresh, Friday, management review, and gap analysis — near-zero new build, the largest blast radius in the whole plan. Foundational: nothing downstream can be honestly demonstrated until the cadence runs. No dependencies. See docs/protocol/README.md (LEO Harness) and the performance-framework plan.
