---
category: reference
status: approved
version: 1.0.0
author: rickfelix
last_updated: 2026-08-17
tags: [reference, testing, ci]
---

# Clock-Skew CI Sweep

**SD**: `SD-LEO-INFRA-CLOCK-SKEW-CI-SWEEP-001`
**Scope**: the `unit` vitest tier only
**Hook**: `tests/setup.clock-skew.js`
**Scheduled workflow**: `.github/workflows/unit-tier-clock-skew.yml`

## What it does

Detects date-window "time-bomb" fixtures — code whose test coverage silently rots once a hardcoded or relative date boundary is crossed — a month before they'd fire for real, by running the full `unit` tier with the system clock pinned 45 days into the future on a weekly schedule (Sunday 05:00 UTC, plus `workflow_dispatch`). It never gates a PR: no `push`/`pull_request` trigger.

## Per-test reapplication (FR-1), not once-at-module-load

`tests/setup.clock-skew.js` is opt-in via `TEST_CLOCK_OFFSET_MS` (milliseconds; unset/empty/zero/non-finite all fail safe to a no-op) and reapplies `vi.setSystemTime()` in a `beforeEach`, **not once when the module loads**.

This is the mechanism the SD's own original proposal got wrong, corrected by a LEAD-phase measurement harness before any implementation code was written: a test's own `vi.useRealTimers()` call cancels the skew for every *subsequent* test in that same file. A once-at-load design measured against this repo's real unit tier would have left ~339 of ~358 tests in the affected 19 files running unskewed while the job still reported green. Per-test reapplication makes each test's skew independent of what any prior test's cleanup did.

A `{file, test, observed_offset_ms}` ledger (JSONL, `CLOCK_SKEW_LEDGER_PATH`, default `test-results/clock-skew-ledger.jsonl`) is appended on every reapplication, giving a positive per-test record instead of inferring coverage from the hook merely having run once.

## Failure reporting (FR-2)

On a failing run, `scripts/clock-skew-report-failures.mjs` parses the captured vitest log for `FAIL |unit| <path>` lines and calls `scripts/log-harness-bug.js` once per distinct failing file (not one aggregated string), so `log-harness-bug.js`'s own dedup/prior-fix lookup keys correctly per test.

## Isolated regression coverage (FR-3) — and its CI blind spot

`tests/unit/hygiene/clock-skew-reapplication.spawn.test.js` spawns a real child `npx vitest run --project unit` process against a 2-test fixture (`clock-skew-fixture.test.js`) to prove the reapplication property out-of-process, following the established `tests/unit/setup/credential-fence-ordering.spawn.test.js` pattern.

**Disclosed limitation, not silently accepted**: nested vitest does not run under this repo's CI, so this suite self-skips there (`describe.skipIf(!process.env.CI ? false : true)`-equivalent gate, matching the credential-fence precedent exactly). Nothing exercises the reapplication property on every PR in CI; the compensating control is this same file's weekly scheduled run against the real, full unit tier. Manually mutation-tested during PLAN_VERIFICATION (temporarily reverted per-test reapply to once-at-load) to confirm the suite's decisive assertion is load-bearing, not decorative — it correctly failed (`expected 3888000000 to be less than 5000`) before being reverted.

## Learning-pipeline fixes bundled in the same SD (FR-4/FR-5)

Not part of the clock-skew mechanism itself, but shipped in the same SD after LEAD-phase sub-agent measurement surfaced a live, unrelated bug: see the "Quarantine guard" and `getSolution()` notes in [`docs/guides/learning-system-explained.md`](../guides/learning-system-explained.md#2-recording-occurrences-learning).
