/**
 * SD-LEO-INFRA-CLOCK-SKEW-CI-SWEEP-001 (FR-2). extractFailingFiles is pure; reportFailures takes
 * an injectable `run` so it's testable without spawning a real child process.
 */
import { describe, it, expect, vi } from 'vitest';
import { extractFailingFiles, reportFailures } from '../../../scripts/clock-skew-report-failures.mjs';

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
