// Clock-skew setup hook — SD-LEO-INFRA-CLOCK-SKEW-CI-SWEEP-001 (FR-1), extended by
// SD-LEO-INFRA-CLOCK-SKEW-SWEEP-001 piece (c) with an absolute pin.
//
// Opt-in via TEST_CLOCK_OFFSET_MS (milliseconds, unit tier only) — a MOVING window, relative
// to whenever the run happens to execute. When set to a finite, non-zero number, re-applies
// vi.setSystemTime() in beforeEach — before EVERY test, not once at module load — and appends
// a {file, test, observed_offset_ms} ledger entry proving the offset was in effect at that
// test's start.
//
// SD-LEO-INFRA-CLOCK-SKEW-SWEEP-001 (piece c): TEST_CLOCK_PIN_ISO (an ISO-8601 instant) is a
// FROZEN absolute pin, for skew classes an offset cannot reach reproducibly — e.g. "an instant
// inside the 22:00-06:00 ET SMS quiet window" is a specific wall-clock moment, not a fixed
// distance from whenever CI happens to run. If both are set, PIN wins (a loud line names the
// conflict) — the two express different intents and are never meant to combine.
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
// test, see tests/unit/hygiene/clock-skew-reapplication.spawn.test.js) positively assert
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

/** Fail-safe by construction, mirroring parseOffsetMs: an invalid/empty ISO string is "not set". */
function parsePinMs(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

// Fail-safe by construction: any non-finite or zero value (unset, empty, 'not-a-number', '0')
// is treated identically to "not set" — never throws, never applies a NaN/zero-offset skew.
const OFFSET_MS = parseOffsetMs(process.env.TEST_CLOCK_OFFSET_MS);
const PIN_MS = parsePinMs(process.env.TEST_CLOCK_PIN_ISO);
// PIN wins when both are set (see the file-header note) — never combined, never both applied.
const ACTIVE_MODE = PIN_MS !== null ? 'pin' : (OFFSET_MS !== null ? 'offset' : null);

// Configurable so an isolated test harness can point the ledger at its own scratch path
// without colliding with (or being cleared by) a real skewed run's ledger.
const LEDGER_PATH = process.env.CLOCK_SKEW_LEDGER_PATH
  || path.join(process.cwd(), 'test-results', 'clock-skew-ledger.jsonl');

if (ACTIVE_MODE !== null) {
  const effectiveMs = ACTIVE_MODE === 'pin' ? PIN_MS : RealDate.now() + OFFSET_MS;
  const effectiveDate = new RealDate(effectiveMs).toISOString();
  // Loud, unmistakable activation line (TR-2): an accidental TEST_CLOCK_OFFSET_MS/TEST_CLOCK_PIN_ISO
  // leak into a normal PR run must be immediately visible in CI logs, never silent.
  // process.stdout.write, NOT console.log — tests/setup.unit.js (loaded first) replaces
  // global.console with vi.fn() mocks to reduce noise, so a console.log here is captured and never
  // actually printed. Same lesson already applied to this file's credential-fence guard for the
  // identical reason.
  const label = ACTIVE_MODE === 'pin' ? `TEST_CLOCK_PIN_ISO active: pinned to ${effectiveDate}` : `TEST_CLOCK_OFFSET_MS active: +${OFFSET_MS}ms -> effective test date ${effectiveDate}`;
  process.stdout.write(`[clock-skew] ${label}\n`);
  if (ACTIVE_MODE === 'pin' && OFFSET_MS !== null) {
    process.stdout.write(`[clock-skew] TEST_CLOCK_OFFSET_MS (+${OFFSET_MS}ms) was ALSO set -- ignored, PIN takes precedence\n`);
  }
  fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
  // FOLLOW-UP FIX (post-merge, full-tier verification): this module-load block runs once per
  // TEST FILE (setupFiles re-evaluates per file), not once per run. At full-tier scale (3200+
  // files, multiple concurrent `pool: forks` workers), an unconditional writeFileSync used to
  // truncate this SHARED ledger path every time ANY file's setup loaded -- racing with, and
  // silently discarding, every OTHER file's already-appended entries from the SAME run. `wx`
  // (exclusive create) makes exactly one file/worker win the reset; every later file sees
  // EEXIST and skips straight to appending. A real fs error (e.g. permissions) still throws.
  try {
    fs.writeFileSync(LEDGER_PATH, '', { flag: 'wx' });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

beforeEach((ctx) => {
  if (ACTIVE_MODE === null) return; // neither var set (the normal PR path): no-op.
  const file = ctx?.task?.file?.filepath || ctx?.task?.suite?.file?.filepath || 'unknown';
  const test = ctx?.task?.name || 'unknown';
  if (ACTIVE_MODE === 'pin') {
    // Reapplied every test for the same reason the offset leg is (see WHY PER-TEST
    // REAPPLICATION above): a sibling test's vi.useRealTimers() must never leave a later
    // test in this file unpinned. observed_offset_ms measures drift FROM THE PIN, not from
    // real time — it should stay ~0ms; a non-trivial value means the pin did not hold.
    vi.setSystemTime(new RealDate(PIN_MS));
    const observedOffsetMs = Date.now() - PIN_MS;
    fs.appendFileSync(LEDGER_PATH, `${JSON.stringify({ file, test, mode: 'pin', pinned_iso: new RealDate(PIN_MS).toISOString(), observed_offset_ms: observedOffsetMs })}\n`);
    return;
  }
  vi.setSystemTime(new RealDate(RealDate.now() + OFFSET_MS));
  const observedOffsetMs = Date.now() - RealDate.now();
  fs.appendFileSync(LEDGER_PATH, `${JSON.stringify({ file, test, mode: 'offset', observed_offset_ms: observedOffsetMs })}\n`);
});
