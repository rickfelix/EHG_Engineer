# Stale QF disposition sweep

**Category**: Reference
**Status**: Approved
**Version**: 1.0.0
**Author**: SD-LEO-INFRA-STALE-QF-DISPOSITION-SWEEP-001
**Last Updated**: 2026-08-16
**Tags**: quick-fixes, coordinator, disposition, belt

## What this closes

Open, unclaimed `quick_fixes` rows sitting past `STALE_QF_DAYS` (`lib/fleet/qf-auto-start.cjs`)
had no verifier, owner, or expiry — invisible as both work and neglect. Three pre-existing
mechanisms (`qf-auto-start`'s fence, `clear-stale-qf-claims`, `orphan-qf-reaper`) only ever touch
**claimed** or PR-having rows; none dispositions an unclaimed open row. `scripts/coordinator-
stale-qf-disposition-sweep.mjs` closes that gap.

## Pipeline (in order)

1. **Dedupe-first**: cluster past-fence candidates by content fingerprint
   (`lib/shared/content-fingerprint.cjs`). All but the survivor of each multi-row cluster close
   `disposition='duplicate_of'` before any citation check runs on the survivor. Rows with no
   extractable content get their own QF-id-keyed singleton fingerprint so they never falsely
   collide into one cluster.
2. **Citation check** (`lib/eva/quick-fix-citation-checker.js`) — exactly two deterministic,
   no-LLM signals: a named test that runs PASS/FAIL, or a single non-range cited file that is
   completely absent. `ABSENT` → `premise_resolved`. `STILL_PRESENT` → step 3. Everything else
   (no citation, ambiguous citation, cross-repo target, checker error) → `INCONCLUSIVE` →
   `premise_unverified_stale`, preserved via one `feedback` row.
3. **Re-verification**, throttled to `<= seatCount` per run (oldest, highest-severity first):
   `STILL_PRESENT` survivors with `<=3` extracted paths → `re_verified` (stays `open`,
   `verified_at` stamped); `>3` paths → `promoted` (status becomes `escalated`, reusing the
   existing escalation infrastructure — `escalated_to_sd_id` is left for the coordinator's
   manual SD-creation follow-up).
4. **TTL re-lapse**: a `re_verified` row nobody picks up within `REVERIFIED_TTL_DAYS` (30) ages
   back out to `premise_unverified_stale`.

Closing dispositions (`premise_resolved` / `premise_unverified_stale` / `duplicate_of`) transition
`status` to the pre-existing, already-excluded `'closed'`; `promoted` transitions to the
pre-existing `'escalated'`. 7 of 8 cataloged belt/gauge readers needed zero code change; the 8th
(`qf-auto-start.cjs`'s age computation) now uses `GREATEST(verified_at, created_at)` so
`re_verified` rows correctly re-enter auto-start eligibility.

## Running it

```bash
node scripts/coordinator-stale-qf-disposition-sweep.mjs                              # dry-run (default)
node scripts/coordinator-stale-qf-disposition-sweep.mjs --apply --h2-confirmed=2026-08-16
node scripts/coordinator-stale-qf-disposition-sweep.mjs --seat-count 3 --json
```

Dry-run by default (mirrors `scripts/feedback-fingerprint-promoter.mjs`'s convention). `--apply`
refuses until (a) the migration's disposition columns (`database/migrations/
20260816_add_quick_fixes_disposition_columns.sql`) exist live, and (b) `--h2-confirmed=<ISO-date>`
is supplied — attesting the coordinator has already run a one-time, two-sided positive/negative
verification pass (sample 10 `premise_resolved` dry-run candidates, independently re-verify each;
require 10/10 truly resolved) **before** the first bulk `--apply`. This is a coordinator
*procedure*, not something the sweep enforces in code.

The chairman-facing count line ("N duplicates, N unverified-stale, N re-verified, N promoted, N
resolved") is composed and returned by the sweep, never sent from inside it —
`scripts/adam-chairman-sms.mjs` is invoked separately, coordinator-triggered only, never on the
scheduled weekly cron.

## Scheduled run

`.github/workflows/coordinator-stale-qf-disposition-sweep.yml` runs the sweep weekly in
**dry-run only**. `workflow_dispatch` allows a manual `--apply` run, gated positively: `--apply`
is only passed when `github.event_name == 'workflow_dispatch' AND github.event.inputs.dry_run ==
'false'` — any other trigger (including `schedule`) defaults closed to dry-run, with no
fallthrough ambiguity to an empty `github.event.inputs` on a scheduled tick.

## Disposition reason codes

`disposition_reason_code` names the instrument + measurement that produced a `premise_resolved`
closure, e.g. `test_passing:tests/unit/x.test.js` or `file_absent:lib/x.js`. A
`premise_unverified_stale` closure carries the original premise verbatim in its companion
`feedback` row, tagged to avoid `scripts/feedback-fingerprint-promoter.mjs`'s own recurrence
matcher re-promoting it into a fresh QF for the same already-disposed defect.
