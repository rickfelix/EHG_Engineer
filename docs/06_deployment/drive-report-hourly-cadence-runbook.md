# Drive Report Hourly Cadence — Operational Runbook

## Metadata
- **Category**: Infrastructure
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: SD-LEO-INFRA-HOURLY-DRIVE-SCORE-001
- **Last Updated**: 2026-08-13
- **Tags**: drive-loop, drive-report, cron, cadence, activation, deployment

## Overview

Chairman-directed (SMS 2026-08-12 19:16Z): *"I think hourly makes sense, especially if it
helps make any adjustments towards improved drive performance."*

This adds an **hourly** drive-score reading beside the existing **daily** one
(`scripts/cron/drive-report-sweep.mjs`, dispatched by `.github/workflows/drive-report-cron.yml`).
The hourly leg is a new sibling script and workflow, not a parameter on the daily one —
the daily sweep's own logic, tests, and registry identity are untouched by this SD.

**No existing operational documentation covered the drive-report subsystem before this SD** —
this is the first runbook for it (the daily sweep and SMS sweep have equivalent activation
shape and would benefit from the same treatment; out of scope here).

## Architecture

| | Daily | Hourly |
|---|---|---|
| Script | `scripts/cron/drive-report-sweep.mjs` | `scripts/cron/drive-report-hourly-sweep.mjs` |
| Workflow | `.github/workflows/drive-report-cron.yml` | `.github/workflows/drive-report-hourly-cron.yml` |
| Schedule | 2 UTC cron lines covering one ET window (DST-aware) | `0 * * * *` (every UTC hour) |
| Idempotence key | `windowKey()` → `drive-YYYY-MM-DD` | `hourlyWindowKey()` → `drive-hourly-YYYY-MM-DDTHH` (UTC-derived, provably disjoint from the daily scheme and from itself across DST fall-back) |
| `cadence` value | `'scheduled'` | `'hourly'` |
| Registry identity | `SD_KEY` (base SD) | `HOURLY_SD_KEY` (`-sweep` suffixed, own `expectedIntervalSeconds=3600`) |
| Activation gate | always on | `HOURLY_SWEEP_ENABLED` repo variable |

Both legs call the **same** `buildGather()` / `produceDriveReport()` — the hourly leg is not a
second scoring implementation. Six pre-existing consumers of "the latest `drive_reports` row"
were updated to filter `cadence='scheduled'` so an hourly partial can never be read as the
canonical daily report (`lib/chairman/daily-review/roadmap-status-doc.js`,
`scripts/coordinator-drive-report-consume.mjs`, `scripts/cron/drive-report-sms-sweep.mjs`,
`scripts/hooks/session-role-orient.cjs`, plus two `run_id`-scoped identity probes that are safe
by key-space disjointness rather than by filter).

## Activation

The hourly leg ships **inert by design** — two independent gates must both be cleared before
any hourly row is ever written. This is deliberate (PRD TR-2): it decouples the workflow's
merge/deploy from the migration's apply timing.

### Gate 1 — apply the schema migration (chairman-gated)

The `drive_reports.cadence` CHECK constraint must admit `'hourly'` before any insert with that
cadence can succeed (23514 otherwise).

```bash
# database/migrations/20260812_drive_reports_hourly_cadence.sql
node scripts/apply-migration.js --prod-deploy
```

Verify the live constraint before proceeding:

```sql
SELECT pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.drive_reports'::regclass
  AND conname = 'drive_reports_cadence_check';
-- Expect: CHECK ((cadence = ANY (ARRAY['scheduled'::text, 'on_demand'::text, 'hourly'::text])))
```

The migration is idempotent (`DROP CONSTRAINT IF EXISTS` + re-`ADD`) and self-verifying (its own
`DO $verify_hourly_cadence$` block asserts all three values are present after applying).

### Gate 2 — flip the workflow variable

```bash
gh variable set HOURLY_SWEEP_ENABLED --body true --repo rickfelix/EHG_Engineer
```

The CLI checks this with strict string equality (`process.env.HOURLY_SWEEP_ENABLED !== 'true'`)
**before** any credential read or network call — an unset, `'false'`, or `'0'` value fails
closed with zero side effects. No new PR is required to flip it; it takes effect on the next
scheduled tick (top of the next UTC hour) or immediately via `workflow_dispatch`.

**Gate order matters**: flipping Gate 2 before Gate 1 makes every tick hard-fail with an
uncaught 23514 (the `persist()` closure only handles table-absent errors gracefully, not
constraint-violation — see Troubleshooting). Apply the migration first.

## Verification

After both gates are cleared, confirm the first tick actually produced a row:

```sql
SELECT run_id, cadence, generated_at
FROM drive_reports
WHERE cadence = 'hourly'
ORDER BY generated_at DESC
LIMIT 5;
-- run_id should match drive-hourly-YYYY-MM-DDTHH for the current UTC hour
```

Confirm the liveness alarm is clearing (not stuck on the pre-first-tick `armed_never_produced`
state):

```sql
SELECT process_key, last_fired_at, expected_interval_seconds, grace_multiplier
FROM periodic_process_registry
WHERE process_key LIKE '%hourly-drive-score-001-sweep%';
-- last_fired_at should advance every hour; expected_interval_seconds = 3600
```

`periodic-liveness-watcher.mjs` is the only failure alarm for this workflow family — a row that
never advances past `null` reads OVERDUE after `2 × expected_interval_seconds` (2 hours) even
if the job is genuinely running, so this check matters more than it looks.

## Disabling / rollback

There is **no schema rollback** for the migration (PRD TR-3) — `drive_reports` has an
append-only guard trigger (`drive_reports_guard_delete_trg`) requiring an explicit
`SET LOCAL drive_reports.allow_delete = 'on'` to delete rows, so narrowing the CHECK back once
hourly rows exist is not a simple revert.

To stop new hourly rows, flip Gate 2 only:

```bash
gh variable set HOURLY_SWEEP_ENABLED --body false --repo rickfelix/EHG_Engineer
```

This is sufficient and reversible — the workflow exits cleanly on the next tick with no
credential/network access, and the schema stays widened (widening is a strict superset; leaving
it in place does not affect the daily or `on_demand` cadences).

## Troubleshooting

### Every tick fails with a 23514 constraint violation

Gate 2 was flipped before Gate 1. The hourly sweep's `persist()` closure only gracefully
degrades on table-absent errors (`PGRST205`/`42P01`), not on a CHECK violation — this is an
accepted, documented tradeoff (loud CI failure, not silent data corruption). Apply the migration
(Gate 1), then either wait for the next tick or re-run via `workflow_dispatch`.

### Liveness alarm reads OVERDUE despite hourly rows appearing

Confirm the registry row's `process_key` matches `armedProcessKey(HOURLY_SD_KEY)` exactly — a
mismatched key (e.g. from hand-typing instead of deriving it) writes to a row the watcher never
reads. `HOURLY_PROCESS_KEY` in `scripts/cron/drive-report-hourly-sweep.mjs` is the source of truth;
never re-type it.

### SMS/chairman-review-doc showing hourly data instead of the daily report

This would mean one of the six consumer guards regressed. `tests/unit/drive-loop/hourly-cadence-consumer-census.test.js`
pins all four JS/URL guarded sites with a positive control (a deliberately-unguarded seeded site
that the test proves it can still catch) — a green run there is the fast check before manual
investigation.

## Related Documentation

- SD: `SD-LEO-INFRA-HOURLY-DRIVE-SCORE-001` (`strategic_directives_v2`, `product_requirements_v2`)
- Retrospective: `retrospectives` table, `retro_type='SD_COMPLETION'`, id `9251db0f-87c6-4d0b-a249-a273e46aff59`
- Daily sibling cron (unmodified by this SD): `scripts/cron/drive-report-sweep.mjs`,
  `.github/workflows/drive-report-cron.yml`
