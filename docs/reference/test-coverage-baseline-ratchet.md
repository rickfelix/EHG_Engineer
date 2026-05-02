# Test Coverage Baseline Ratchet

## Metadata

- **Source SD**: SD-LEO-INFRA-COVERAGE-CI-TRIAGE-001 (FR-4 + FR-5)
- **Effective Date**: 2026-05-02
- **Status**: ACTIVE (sunsets at ≤100 main-branch test failures — see Sunset Criteria)

## Overview

The Test Coverage Enforcement workflow strict-fails on any non-zero vitest failure. With ~550 pre-existing failures on main, that posture turns every PR red regardless of whether it introduced new failures. This ratchet replaces the binary "any failure = red" gate with a delta gate: a PR fails only if it introduces failures the main snapshot did not have. The ratchet keeps tightening as failures get triaged downward (push-to-main writes a fresh snapshot every run), so each merged PR sets a slightly lower ceiling for the next. When the snapshot reaches ≤100 failures, the ratchet is removed and strict mode returns.

## Purpose

Stop blocking unrelated PRs on pre-existing test failures while the manual triage of those failures completes. Without this gate, the only options are (a) admin-bypass every merge during the campaign, or (b) revert the strict policy that protects against barrel-rot regressions like PR #3211. Neither is acceptable.

The ratchet pairs with the manual triage SD: as triage commits land on main, the failure count drops; the next snapshot captures the lower number; the next PR is held to the lower bar. Sunset criterion: when main-branch failure count reaches ≤100, the systematic-defect class has been worked through and remaining failures are isolated bugs that should not be tolerated as baseline.

## How It Works

### Workflow trigger

`.github/workflows/test-coverage.yml` runs on:
- `push` to `main` and `develop` — captures a fresh snapshot
- `pull_request` against any base — compares to the most recent snapshot for the PR's base branch

### BASELINE_REGRESSION mechanics

After the existing `Run tests with coverage` step parses `test-results.json`, a new step `Compare to main snapshot` runs `node scripts/compare-to-main-snapshot.mjs`. It:

1. Reads `numFailedTests` from `test-results.json`.
2. On `push` events: INSERTs a row into `codebase_health_snapshots` with the current count and a `trend_direction` derived from the prior snapshot (`improving` / `stable` / `declining` / `new`).
3. On `pull_request` events: SELECTs the most recent snapshot for the PR's base branch where `dimension='ci_test_failure_count' AND target_application='EHG_Engineer'`. If the current PR's failure count exceeds the baseline by ≥ 1, the step exits 1 with three GitHub Actions annotations:
   - `::error::BASELINE_REGRESSION: N new test failure(s) vs main snapshot.`
   - `Reproduce locally: node scripts/audit-test-failures.mjs --pr-only --format=json | jq .new_failures`
   - `See docs/reference/test-coverage-baseline-ratchet.md for triage steps.`

If no prior snapshot exists for the base branch (cold start), the step passes and writes the first snapshot on the next push to main.

### audit-test-failures.mjs invocation

The audit script is the canonical bucketer. It is invoked locally by developers (`node scripts/audit-test-failures.mjs --summary`) and referenced in the BASELINE_REGRESSION annotation as the reproduction recipe. The script does not read from the database today — it parses `test-results.json` directly. See CLI Usage below.

## Schema Reference

Snapshot rows live in `codebase_health_snapshots`. Full column reference: [docs/reference/schema/engineer/tables/codebase_health_snapshots.md](schema/engineer/tables/codebase_health_snapshots.md).

The ratchet uses only the `ci_test_failure_count` dimension. Conventions for that dimension:

- `dimension`: literal string `ci_test_failure_count`
- `target_application`: literal string `EHG_Engineer`
- `score`: pass-rate as `0–100` (computed as `(passed / total) * 100`, NUMERIC(5,2))
- `findings`: JSONB **array with exactly one element** — `[{failed_count, branch, commit_sha}]`. The single-element-array shape matches existing `dead_code` and `complexity` dimension consumers; bare-object shape is incompatible.
- `trend_direction`: one of `improving` | `stable` | `declining` | `new` per the table CHECK constraint
- `metadata.workflow_run_id`: GitHub Actions run id for traceability
- `scanned_at` and `created_at`: defaults to `now()`

The comparator query uses array indexing into `findings`:

```sql
SELECT findings->0->>'failed_count' AS baseline_failed
  FROM codebase_health_snapshots
 WHERE dimension = 'ci_test_failure_count'
   AND target_application = 'EHG_Engineer'
   AND findings->0->>'branch' = 'main'
 ORDER BY scanned_at DESC
 LIMIT 1;
```

## Troubleshooting

### `BASELINE_REGRESSION: N new test failure(s)` on a PR

1. Pull the failing run's `test-results-json` artifact (`gh run download <run-id> --name test-results-json`).
2. Run `node scripts/audit-test-failures.mjs --results test-results.json --summary` to see the bucket counts.
3. Diff against the previous run on main to identify the new failures (use `--by-category=<bucket>` to narrow scope).
4. Either fix the new failure (preferred), gate it behind `it.skipIf(...)` with a one-line rationale, or — if the failure was already present on main and the snapshot is stale — push an empty commit to main to regenerate the snapshot.

### Workflow exits 1 with no failure count printed

Historical defect: vitest 1.x → 3.x dropped the `--json` CLI flag, leaving the workflow with empty output. Fixed in [QF-20260426-465 / PR #3380](https://github.com/rickfelix/EHG_Engineer/pull/3380) by switching to `--reporter=json --outputFile=test-results.json`. If you see this symptom recur, verify the workflow YAML still uses `--reporter=json`.

### Snapshot row missing `trend_direction`

The CHECK constraint on `codebase_health_snapshots.trend_direction` accepts only `improving`/`stable`/`declining`/`new`. The helper script (`scripts/compare-to-main-snapshot.mjs`) computes it from the prior snapshot; on cold start it falls back to `'new'`. A NULL `trend_direction` indicates the row was inserted by a non-FR-4 path — investigate the writer.

### `::error::` annotations not rendering on the PR Files-changed view

Annotations only render when stderr lines exactly match `::error::<message>` (no leading whitespace, no trailing comma). The helper script writes them directly via `console.error`; if you wrap that call, preserve the exact format.

## CLI Usage

Mirrors `node scripts/audit-test-failures.mjs --help`:

```
audit-test-failures.mjs — bucket failed vitest results by error signature

USAGE:
  node scripts/audit-test-failures.mjs [options]

OPTIONS:
  --results=<path>          Path to vitest --reporter=json output (default: test-results.json)
  --format=csv|json         Output format (default: csv)
  --summary                 Emit category counts to stderr (CSV stays on stdout)
  --by-category=<name>      Filter rows to one bucket
  --pr-only                 Reserved: compare to baseline snapshot (wired in PR3)
  --branch=<name>           Reserved: DB-read source branch (default: main)
  --no-db                   Force file-fallback (alias for default behavior today)
  --help, -h                Show this message

OUTPUT BUCKETS (in detection-priority order):
  cannot-find-module       Module resolution failure
  must-be-set              Env var crash at module load (PR2 candidate)
  econnrefused             Network unreachable (PR2 candidate)
  mock-mismatch            Mock/spy expectation failure
  real-assertion-failure   Concrete assertion failure
  other                    Unrecognized pattern

EXIT CODES:
  0  Bucketing succeeded
  1  Reserved (PR3 baseline-regression mode)
  2  Invocation or parse error

EXAMPLES:
  node scripts/audit-test-failures.mjs --results=test-results.json
  node scripts/audit-test-failures.mjs --format=json | jq .by_category
  node scripts/audit-test-failures.mjs --summary > failures.csv
  node scripts/audit-test-failures.mjs --by-category=must-be-set --format=json
```

## Sunset Criteria

The ratchet is **temporary** — it exists only while the systematic-defect class of pre-existing failures is being triaged. Sunset trigger: main-branch `ci_test_failure_count` reaches **≤100 failures** for two consecutive snapshots (debounce against transient noise).

Removal procedure (in order — partial removal leaves orphan references):

1. **Workflow step** — delete the `Compare to main snapshot` step from `.github/workflows/test-coverage.yml`. Remove the secrets lines from the ratchet step only (the `Capture test results to database` step keeps its own secrets).
2. **Helper script** — `git rm scripts/compare-to-main-snapshot.mjs` and any unit tests under `tests/unit/compare-to-main-snapshot.test.js`.
3. **This document** — `git rm docs/reference/test-coverage-baseline-ratchet.md`.
4. **Cross-references** — drop the `Related Documentation` bullet from `CLAUDE_EXEC.md`'s Test Coverage Quality Gate section. Drop the `SEE ALSO` line from `scripts/audit-test-failures.mjs` --help output.
5. **Strict mode returns** — the `Run tests with coverage` step's strict-fail behavior is restored automatically (the ratchet only ever lived as a downstream step; removing it leaves the original gate intact).

The historical snapshot rows in `codebase_health_snapshots` are kept — they are useful for trend analysis. The dimension `ci_test_failure_count` is not removed from the table; it just stops being written.

## Related Documentation

- [`CLAUDE_EXEC.md`](../../CLAUDE_EXEC.md) — Test Coverage Quality Gate (EXEC-TO-PLAN), the unrelated coverage gate that protects per-PR coverage on changed files
- Sibling SD: `SD-LEO-INFRA-TEST-COVERAGE-HYGIENE-001` — broader hygiene work that the ratchet enables
- [QF-20260426-465 / PR #3380](https://github.com/rickfelix/EHG_Engineer/pull/3380) — vitest 1.x→3.x `--json` → `--reporter=json` fix that made this workflow's JSON output usable
- [`.github/workflows/test-coverage.yml`](../../.github/workflows/test-coverage.yml) — the workflow this gate lives in
- [`docs/reference/schema/engineer/tables/codebase_health_snapshots.md`](schema/engineer/tables/codebase_health_snapshots.md) — full schema reference for the snapshot table
