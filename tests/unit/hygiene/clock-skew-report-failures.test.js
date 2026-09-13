/**
 * SD-LEO-INFRA-CLOCK-SKEW-CI-SWEEP-001 (FR-2). extractFailingFiles is pure; reportFailures takes
 * an injectable `run` so it's testable without spawning a real child process.
 */
import { describe, it, expect, vi } from 'vitest';
import { extractFailingFiles, reportFailures, isIncompleteOutcome, reportIncompleteSweep } from '../../../scripts/clock-skew-report-failures.mjs';

describe('extractFailingFiles', () => {
  it('extracts distinct file paths from FAIL lines, ignoring the test-name suffix', () => {
    const log = `
 RUN  v4.1.4

 FAIL  |unit| scripts/singleton-relaunch-restore.test.js > some test name here
 FAIL  |unit| tests/unit/heal-vision/heal-vision.test.js > T3 (smoke)

 Test Files  2 failed | 3210 passed (3212)
`;
    expect(extractFailingFiles(log)).toEqual([
      'scripts/singleton-relaunch-restore.test.js',
      'tests/unit/heal-vision/heal-vision.test.js',
    ]);
  });

  it('deduplicates multiple failing tests within the SAME file to one entry', () => {
    const log = `
 FAIL  |unit| scripts/hooks/__tests__/stop-loop-wakeup-reminder.test.js > case A
 FAIL  |unit| scripts/hooks/__tests__/stop-loop-wakeup-reminder.test.js > case B
`;
    expect(extractFailingFiles(log)).toEqual(['scripts/hooks/__tests__/stop-loop-wakeup-reminder.test.js']);
  });

  it('returns [] for a clean run with no FAIL lines', () => {
    const log = '\n RUN  v4.1.4\n\n Test Files  1 passed (1)\n      Tests  2 passed (2)\n';
    expect(extractFailingFiles(log)).toEqual([]);
  });
});

describe('reportFailures', () => {
  it('invokes log-harness-bug.js once per distinct failing file, with --file as the dedup key', () => {
    const run = vi.fn();
    const reported = reportFailures(['a.test.js', 'b.test.js'], { run });
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[0][1]).toEqual(
      expect.arrayContaining(['--file', 'a.test.js', '--severity', 'high']),
    );
    expect(run.mock.calls[1][1]).toEqual(
      expect.arrayContaining(['--file', 'b.test.js', '--severity', 'high']),
    );
    expect(reported).toEqual(['a.test.js', 'b.test.js']);
  });

  it('one failing report does not stop the remaining files from being reported', () => {
    const run = vi.fn()
      .mockImplementationOnce(() => { throw new Error('network blip'); })
      .mockImplementationOnce(() => {});
    const reported = reportFailures(['a.test.js', 'b.test.js'], { run });
    expect(run).toHaveBeenCalledTimes(2);
    expect(reported).toEqual(['b.test.js']); // only the successful one is recorded as reported
  });
});

// QF-20260912-364: the report step's `if: always()` needs the script to distinguish a genuine
// failure (parse the log) from a run that never completed (report "did not complete" instead of
// silently concluding "no FAIL lines, nothing to report" -- the four-runs-in-a-row silent-pass
// this sweep shipped under the old `if: failure()` condition).
describe('isIncompleteOutcome', () => {
  it('is false for a clean success', () => {
    expect(isIncompleteOutcome('success')).toBe(false);
  });
  it('is false for a genuine failure (the log is trustworthy, parse it)', () => {
    expect(isIncompleteOutcome('failure')).toBe(false);
  });
  it('is true for a cancelled step (the timeout-minutes ceiling firing)', () => {
    expect(isIncompleteOutcome('cancelled')).toBe(true);
  });
  it('is true for a skipped step', () => {
    expect(isIncompleteOutcome('skipped')).toBe(true);
  });
  it('is false when no outcome was supplied at all (missing env var)', () => {
    expect(isIncompleteOutcome(null)).toBe(false);
    expect(isIncompleteOutcome(undefined)).toBe(false);
    expect(isIncompleteOutcome('')).toBe(false);
  });
});

describe('reportIncompleteSweep', () => {
  it('invokes log-harness-bug.js with the outcome in the symptom text, no --file', () => {
    const run = vi.fn();
    const ok = reportIncompleteSweep('cancelled', { run });
    expect(ok).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
    const [cmd, args] = run.mock.calls[0];
    expect(cmd).toBe('node');
    expect(args).toEqual(expect.arrayContaining(['--severity', 'high']));
    expect(args).not.toEqual(expect.arrayContaining(['--file']));
    expect(args.some((a) => typeof a === 'string' && a.includes("outcome='cancelled'"))).toBe(true);
  });

  it('returns false (non-fatal) when the report call itself fails', () => {
    const run = vi.fn(() => { throw new Error('network blip'); });
    expect(reportIncompleteSweep('cancelled', { run })).toBe(false);
  });
});
