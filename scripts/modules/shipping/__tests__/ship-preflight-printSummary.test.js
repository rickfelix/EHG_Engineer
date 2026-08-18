/**
 * Regression test for SD-LEO-INFRA-SHIP-PREFLIGHT-REPORTS-001 FR-6.
 *
 * MultiRepoCoordinator.js already computes and returns `partial` (true when
 * its 60s SCAN_DEADLINE_MS is exceeded mid-scan -- MultiRepoCoordinator.js
 * :28/75/92), but printSummary() never read it: a truncated scan rendered
 * identically to a complete one, silently hiding that "PASS" was only ever
 * confirmed for the repos reached before the deadline. printSummary() is
 * exported specifically so this test can call it directly without invoking
 * the CLI (main() is guarded by isMainModule(import.meta.url), so importing
 * this file is safe).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { printSummary } from '../../../ship-preflight.js';

describe('ship-preflight printSummary — partial multi-repo scan warning (SD-LEO-INFRA-SHIP-PREFLIGHT-REPORTS-001 TS-7/FR-6)', () => {
  let logSpy;

  afterEach(() => {
    logSpy?.mockRestore();
  });

  it('flags a truncated (partial) scan with a visible warning even when it reports PASS', () => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    printSummary({
      overallPassed: true,
      hasWarnings: false,
      multiRepoCoordination: {
        passed: true,
        partial: true,
        branches: [{ repo: 'EHG_Engineer' }],
        coordinationPlan: [],
      },
    });

    const output = logSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toMatch(/PARTIAL/i);
    expect(output).toContain('⚠️');
  });

  it('does not print a truncation warning for a complete (non-partial) scan', () => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    printSummary({
      overallPassed: true,
      hasWarnings: false,
      multiRepoCoordination: {
        passed: true,
        partial: false,
        branches: [{ repo: 'EHG_Engineer' }],
        coordinationPlan: [],
      },
    });

    const output = logSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).not.toMatch(/PARTIAL/i);
  });
});
