/**
 * The out-of-process half of the clock-skew hook — SD-LEO-INFRA-CLOCK-SKEW-CI-SWEEP-001 (FR-1,
 * FR-3). Follows the same shape as tests/unit/setup/credential-fence-ordering.spawn.test.js.
 *
 * WHY THIS EXISTS. The interaction FR-1 must prove — that vi.setSystemTime() is reapplied for
 * EVERY test, so a sibling test's own vi.useRealTimers() call cannot leave a later test unskewed
 * — cannot be observed from inside a normal (unskewed) vitest run: it requires deliberately
 * setting TEST_CLOCK_OFFSET_MS and reading the setup hook's own ledger from OUTSIDE the run that
 * produced it. This is deliberately the same class of proof as credential-fence-ordering: the
 * property under test is about vitest's OWN hook-ordering behavior, not about application logic.
 *
 * NESTED VITEST DOES NOT RUN UNDER THIS CI (documented precedent in
 * credential-fence-ordering.spawn.test.js) — this suite self-skips there, VISIBLY. What is lost:
 * in CI, nothing exercises the G1/G2 reapplication property directly. What still covers it: this
 * suite locally on every dev run before a PR, and FR-2's real weekly scheduled skew job, which
 * exercises the full unit tier (not a 2-test fixture) under the real offset in production.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const FIXTURE_PATH = 'tests/unit/hygiene/clock-skew-fixture.test.js';
const OFFSET_MS = 45 * 24 * 60 * 60 * 1000; // +45 days, matching FR-2's real sweep offset

function runChildVitest(testPath, extraEnv) {
  // SD-LEO-INFRA-CLOCK-SKEW-SWEEP-001 (EXEC-TO-PLAN TESTING finding): both clock vars must
  // default to unset here, not inherited from this process's own env -- otherwise a parent
  // process that happens to export either var leaks it into every child, inverting the
  // negative-control cases (which need the var ABSENT unless a test explicitly sets it).
  const env = {
    ...process.env,
    TEST_CLOCK_OFFSET_MS: '',
    TEST_CLOCK_PIN_ISO: '',
    ...extraEnv,
    VITEST_DB_ALLOW_REF: '',
    CI: '1',
  };
  const res = spawnSync(
    'npx',
    ['vitest', 'run', '--project', 'unit', testPath],
    { cwd: REPO, env, encoding: 'utf8', shell: process.platform === 'win32', timeout: 240000 },
  );
  return { status: res.status, output: `${res.stdout || ''}${res.stderr || ''}` };
}

function readLedger(ledgerPath) {
  if (!fs.existsSync(ledgerPath)) return [];
  return fs.readFileSync(ledgerPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

// See credential-fence-ordering.spawn.test.js for the measured rationale.
const NESTED_VITEST_AVAILABLE = !process.env.CI;

describe.skipIf(!NESTED_VITEST_AVAILABLE)('clock-skew setup hook (child process)', () => {
  it(
    'reapplies the skew for G2 even though G1 reset to real timers (FR-1 AC-1)',
    () => {
      const ledgerPath = path.join(os.tmpdir(), `clock-skew-ledger-${process.pid}-${Date.now()}.jsonl`);
      try {
        const { output } = runChildVitest(FIXTURE_PATH, {
          TEST_CLOCK_OFFSET_MS: String(OFFSET_MS),
          CLOCK_SKEW_LEDGER_PATH: ledgerPath,
        });
        expect(output).toMatch(/Tests\s+2 passed/);
        expect(output).not.toMatch(/Tests\s+\d+ failed/);
        expect(output).toContain('[clock-skew] TEST_CLOCK_OFFSET_MS active');

        const ledger = readLedger(ledgerPath);
        // AC-2: ledger.length === executed test count. A shorter ledger means the hook silently
        // stopped firing for one of the two tests.
        expect(ledger.length).toBe(2);
        // The decisive assertion: BOTH entries — including G2, the test that was blind before
        // this SD's fix — show the offset in effect. Tolerance covers wall-clock drift between
        // the beforeEach call and RealDate.now() inside it (milliseconds, not days).
        const TOLERANCE_MS = 5000;
        for (const entry of ledger) {
          expect(Math.abs(entry.observed_offset_ms - OFFSET_MS)).toBeLessThan(TOLERANCE_MS);
        }
      } finally {
        fs.rmSync(ledgerPath, { force: true });
      }
    },
    300000,
  );

  it(
    'TEST_CLOCK_OFFSET_MS unset writes no ledger and changes nothing (FR-1 AC-3)',
    () => {
      const ledgerPath = path.join(os.tmpdir(), `clock-skew-ledger-unset-${process.pid}-${Date.now()}.jsonl`);
      try {
        const { output } = runChildVitest(FIXTURE_PATH, { CLOCK_SKEW_LEDGER_PATH: ledgerPath });
        expect(output).toMatch(/Tests\s+2 passed/);
        expect(output).not.toContain('[clock-skew] TEST_CLOCK_OFFSET_MS active');
        expect(fs.existsSync(ledgerPath)).toBe(false);
      } finally {
        fs.rmSync(ledgerPath, { force: true });
      }
    },
    300000,
  );

  it(
    'malformed TEST_CLOCK_OFFSET_MS fails safe instead of throwing (FR-1 TR-2 / TS-9)',
    () => {
      const ledgerPath = path.join(os.tmpdir(), `clock-skew-ledger-malformed-${process.pid}-${Date.now()}.jsonl`);
      try {
        const { output } = runChildVitest(FIXTURE_PATH, {
          TEST_CLOCK_OFFSET_MS: 'not-a-number',
          CLOCK_SKEW_LEDGER_PATH: ledgerPath,
        });
        expect(output).toMatch(/Tests\s+2 passed/);
        expect(output).not.toContain('[clock-skew] TEST_CLOCK_OFFSET_MS active');
        expect(fs.existsSync(ledgerPath)).toBe(false);
      } finally {
        fs.rmSync(ledgerPath, { force: true });
      }
    },
    300000,
  );

  it(
    'SD-LEO-INFRA-CLOCK-SKEW-SWEEP-001 piece (c): reapplies the ABSOLUTE pin for G2 even though G1 reset to real timers',
    () => {
      const ledgerPath = path.join(os.tmpdir(), `clock-skew-ledger-pin-${process.pid}-${Date.now()}.jsonl`);
      const pinIso = '2026-10-28T09:00:00.000Z'; // arbitrary future instant, +45d-class skew
      try {
        const { output } = runChildVitest(FIXTURE_PATH, {
          TEST_CLOCK_PIN_ISO: pinIso,
          CLOCK_SKEW_LEDGER_PATH: ledgerPath,
        });
        expect(output).toMatch(/Tests\s+2 passed/);
        expect(output).not.toMatch(/Tests\s+\d+ failed/);
        expect(output).toContain('[clock-skew] TEST_CLOCK_PIN_ISO active');

        const ledger = readLedger(ledgerPath);
        expect(ledger.length).toBe(2); // AC-2, mirrored: both G1 and G2 show the pin
        const TOLERANCE_MS = 5000;
        for (const entry of ledger) {
          expect(entry.mode).toBe('pin');
          expect(entry.pinned_iso).toBe(pinIso);
          expect(Math.abs(entry.observed_offset_ms)).toBeLessThan(TOLERANCE_MS); // ~0: the pin held, not drifted
        }
      } finally {
        fs.rmSync(ledgerPath, { force: true });
      }
    },
    300000,
  );

  it(
    'SD-LEO-INFRA-CLOCK-SKEW-SWEEP-001 piece (c): pins to an instant inside the 22:00-06:00 ET SMS quiet window',
    () => {
      const ledgerPath = path.join(os.tmpdir(), `clock-skew-ledger-quiet-${process.pid}-${Date.now()}.jsonl`);
      // 2027-01-14T23:00:00 ET (EST, UTC-5 -- January is unambiguously outside DST) = 04:00 UTC
      // the next calendar day. Verified against lib/time/chairman-et-wall-clock.js's own
      // SMS_QUIET_START_HOUR=22 / SMS_QUIET_END_HOUR=6 (hour >= 22 matches).
      const pinIso = '2027-01-15T04:00:00.000Z';
      try {
        const { output } = runChildVitest(FIXTURE_PATH, {
          TEST_CLOCK_PIN_ISO: pinIso,
          CLOCK_SKEW_LEDGER_PATH: ledgerPath,
        });
        expect(output).toMatch(/Tests\s+2 passed/);
        expect(output).toContain('[clock-skew] TEST_CLOCK_PIN_ISO active');
        const etHour = new Date(pinIso).toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit' });
        expect(Number(etHour) >= 22 || Number(etHour) < 6).toBe(true); // fixture premise: really inside the quiet window
        expect(readLedger(ledgerPath).every((e) => e.mode === 'pin')).toBe(true);
      } finally {
        fs.rmSync(ledgerPath, { force: true });
      }
    },
    300000,
  );

  it(
    'SD-LEO-INFRA-CLOCK-SKEW-SWEEP-001 piece (c): TEST_CLOCK_PIN_ISO wins when both vars are set (never combined)',
    () => {
      const ledgerPath = path.join(os.tmpdir(), `clock-skew-ledger-precedence-${process.pid}-${Date.now()}.jsonl`);
      const pinIso = '2026-10-28T09:00:00.000Z';
      try {
        const { output } = runChildVitest(FIXTURE_PATH, {
          TEST_CLOCK_PIN_ISO: pinIso,
          TEST_CLOCK_OFFSET_MS: String(45 * 24 * 60 * 60 * 1000),
          CLOCK_SKEW_LEDGER_PATH: ledgerPath,
        });
        expect(output).toContain('[clock-skew] TEST_CLOCK_PIN_ISO active');
        expect(output).toContain('ignored, PIN takes precedence');
        expect(readLedger(ledgerPath).every((e) => e.mode === 'pin' && e.pinned_iso === pinIso)).toBe(true);
      } finally {
        fs.rmSync(ledgerPath, { force: true });
      }
    },
    300000,
  );

  it(
    'SD-LEO-INFRA-CLOCK-SKEW-SWEEP-001 piece (c): malformed TEST_CLOCK_PIN_ISO fails safe instead of throwing',
    () => {
      const ledgerPath = path.join(os.tmpdir(), `clock-skew-ledger-pin-malformed-${process.pid}-${Date.now()}.jsonl`);
      try {
        const { output } = runChildVitest(FIXTURE_PATH, {
          TEST_CLOCK_PIN_ISO: 'not-a-date',
          CLOCK_SKEW_LEDGER_PATH: ledgerPath,
        });
        expect(output).toMatch(/Tests\s+2 passed/);
        expect(output).not.toContain('[clock-skew] TEST_CLOCK_PIN_ISO active');
        expect(fs.existsSync(ledgerPath)).toBe(false);
      } finally {
        fs.rmSync(ledgerPath, { force: true });
      }
    },
    300000,
  );

  it(
    'POSITIVE CONTROL: this harness can observe a child failure',
    () => {
      const { status } = runChildVitest('tests/unit/hygiene/__no_such_file_exists__.test.js', {});
      expect(status).not.toBe(0);
    },
    300000,
  );
});
