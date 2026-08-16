// Clock-skew setup hook — SD-LEO-INFRA-CLOCK-SKEW-CI-SWEEP-001 (FR-1).
//
// Opt-in via TEST_CLOCK_OFFSET_MS (milliseconds, unit tier only). When set to a finite,
// non-zero number, re-applies vi.setSystemTime() in beforeEach — before EVERY test, not
// once at module load — and appends a {file, test, observed_offset_ms} ledger entry
// proving the offset was in effect at that test's start.
//
// WHY PER-TEST REAPPLICATION (not a one-time module-load pin): a disposable measurement
// harness proved setupFiles re-runs per FILE (cross-file leakage does not happen), but
// WITHIN a file, any test's own vi.useRealTimers() call cancels the skew for every
// subsequent test in that SAME file. Measured blast radius against this repo's real unit
// tier: 19 files / ~358 tests, ~339 tests (all but the first per file) would run unskewed
// while a once-at-module-load design still reports the job green. Reapplying unconditionally
// in beforeEach makes each test's skew independent of whatever any PRIOR test's cleanup did.
//
// WHY A LEDGER, not just "the hook ran": a setup hook that fired once proves nothing about
// later tests in files that themselves fake timers. Per-test evidence — one line per test,
// with the measured offset — is what lets a consumer (this SD's own isolated regression
// test, see tests/unit/hygiene/clock-skew-reapplication.test.js) positively assert
// ledger.length === executed test count, rather than assume coverage from the hook's mere
// existence.
import { vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Captured before any vi.setSystemTime/useFakeTimers call anywhere in the run. Sinon/vitest
// fake-timers REPLACE globalThis.Date, so a ledger that reads the (possibly-faked)
// globalThis.Date to measure its own offset would corrupt its own measurement in exactly the
// files it most needs to observe correctly.
const RealDate = globalThis.Date;

function parseOffsetMs(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n !== 0 ? n : null;
}

// Fail-safe by construction: any non-finite or zero value (unset, empty, 'not-a-number', '0')
// is treated identically to "not set" — never throws, never applies a NaN/zero-offset skew.
const OFFSET_MS = parseOffsetMs(process.env.TEST_CLOCK_OFFSET_MS);

// Configurable so an isolated test harness can point the ledger at its own scratch path
// without colliding with (or being cleared by) a real skewed run's ledger.
const LEDGER_PATH = process.env.CLOCK_SKEW_LEDGER_PATH
  || path.join(process.cwd(), 'test-results', 'clock-skew-ledger.jsonl');

if (OFFSET_MS !== null) {
  const effectiveDate = new RealDate(RealDate.now() + OFFSET_MS).toISOString();
  // Loud, unmistakable activation line (TR-2): an accidental TEST_CLOCK_OFFSET_MS leak into a
  // normal PR run must be immediately visible in CI logs, never silent. process.stdout.write, NOT
  // console.log — tests/setup.unit.js (loaded first) replaces global.console with vi.fn() mocks
  // to reduce noise, so a console.log here is captured and never actually printed. Same lesson
  // already applied to this file's credential-fence guard for the identical reason.
  process.stdout.write(`[clock-skew] TEST_CLOCK_OFFSET_MS active: +${OFFSET_MS}ms -> effective test date ${effectiveDate}\n`);
  fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
  fs.writeFileSync(LEDGER_PATH, ''); // fresh ledger for this run; appended to per-test below
}

beforeEach((ctx) => {
  if (OFFSET_MS === null) return; // TEST_CLOCK_OFFSET_MS unset (the normal PR path): no-op.
  vi.setSystemTime(new RealDate(RealDate.now() + OFFSET_MS));
  const observedOffsetMs = Date.now() - RealDate.now();
  const file = ctx?.task?.file?.filepath || ctx?.task?.suite?.file?.filepath || 'unknown';
  const test = ctx?.task?.name || 'unknown';
  fs.appendFileSync(LEDGER_PATH, `${JSON.stringify({ file, test, observed_offset_ms: observedOffsetMs })}\n`);
});
