---
category: reference
status: approved
version: 1.1.0
author: rickfelix
last_updated: 2026-09-13
tags: [reference, testing, ci]
---

# Clock-Skew CI Sweep

**SD**: `SD-LEO-INFRA-CLOCK-SKEW-CI-SWEEP-001` (extended by `SD-LEO-INFRA-CLOCK-SKEW-SWEEP-001`, pieces c/d)
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

## Absolute clock pin — `TEST_CLOCK_PIN_ISO` (piece c, `SD-LEO-INFRA-CLOCK-SKEW-SWEEP-001`)

`TEST_CLOCK_OFFSET_MS` above is a *moving* window: a fixed distance from whenever the run happens to execute. Some skew classes need a *frozen* wall-clock instant instead — e.g. "a moment inside the 22:00–06:00 ET SMS quiet window" is a specific point in time, not a fixed offset from today. `tests/setup.clock-skew.js` now also reads `TEST_CLOCK_PIN_ISO` (an ISO-8601 instant, parsed via the pre-fake-timer `RealDate.parse` so a faked global `Date` can never corrupt the parse):

- If both `TEST_CLOCK_PIN_ISO` and `TEST_CLOCK_OFFSET_MS` are set, **the pin wins** — a loud `[clock-skew] ... ignored, PIN takes precedence` line names the discarded offset. The two express different intents and are never combined.
- Per-test reapplication and the JSONL ledger both apply unchanged; a pin-mode ledger line additionally carries `mode: 'pin'` and `pinned_iso`.
- A malformed ISO string fails safe to "not set" (same fail-safe contract as a malformed offset) — it never throws and never silently pins to `Invalid Date`.

## Wall-clock test-hygiene lint (piece d, `SD-LEO-INFRA-CLOCK-SKEW-SWEEP-001`)

`scripts/lint/wall-clock-test-lint.mjs` — a static, file-level scan (mirroring `shell-injection-argv-lint.mjs`'s diff-mode/rename-tracking pattern) that flags a test file calling one of a short list of time-sensitive entry points (`reconcileOutboundSms`, `isInQuietHours`, `resolveChairmanZone`, `smsQuietWindowReleaseIso`) with **no fake-clock token anywhere in the file** — i.e., a test that looks like it exercises quiet-hours/SMS-window logic but is actually running against the real system clock.

- **Default mode** is a diff scoped to `mergeBase..HEAD`: a file already violating at the merge base is reported as pre-existing (never blocking); a newly introduced violation sets the exit code.
- `--all` is a whole-tree census over `tests/*.test.js` (diagnostic only, not the CI entry point) — used to measure a real baseline rather than assume one. Measured against this repo on 2026-09-13: 2 genuine violations, both bare `reconcileOutboundSms(sb, { ...new Date() })` calls.
- Escape hatch: `wall-clock-test-lint-disable-file: <reason>` (a **non-empty reason is required**, mirroring `lib/git/hardened-runner.cjs`'s `assertOptOutReasons` contract) — a bare marker with no reason does not clear a violation.
- **Ships advisory-only this increment**: not yet wired into any GitHub Actions workflow. Promoting it to a blocking (or even advisory-reporting) CI step is a separate, later decision — this SD's own LEAD risk assessment deliberately scoped day one to shipping the tool with full unit-test coverage, not to wiring it up.
