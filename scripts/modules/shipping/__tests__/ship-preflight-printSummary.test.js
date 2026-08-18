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

    const lines = logSpy.mock.calls.map((call) => call.join(' '));
    const lineIndex = lines.findIndex((l) => l.includes('Multi-Repo Coordination'));
    expect(lineIndex).toBeGreaterThan(-1);

    // Adversarial review finding (PR #7255): the icon selector is
    // `passed ? checkmark : (warning ? warn : cross)` -- asserting anywhere
    // in the FULL joined output previously passed even when the icon itself
    // stayed a plain green check, because the details line (checked
    // separately below) already contained the warning text. Pin the icon
    // line itself: it must NOT be the plain green check, and the details
    // line right after it must carry the truncation warning.
    expect(lines[lineIndex]).not.toContain('✅');
    expect(lines[lineIndex]).toContain('⚠️');
    expect(lines[lineIndex + 1]).toMatch(/PARTIAL/i);
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

    const lines = logSpy.mock.calls.map((call) => call.join(' '));
    const lineIndex = lines.findIndex((l) => l.includes('Multi-Repo Coordination'));
    expect(lineIndex).toBeGreaterThan(-1);
    expect(lines[lineIndex]).toContain('✅');
    expect(lines[lineIndex + 1]).not.toMatch(/PARTIAL/i);
  });
});

// NOTE (adversarial review, PR #7255): main()'s companion fix --
// `if (results.multiRepoCoordination.partial === true) results.hasWarnings = true;`
// so the process exit code reflects a partial-but-passed scan, not just the
// printed text -- is NOT unit-testable here. main() is not exported and
// orchestrates the full CLI pipeline (branch verification, state
// reconciliation, live MultiRepoCoordinator, TestExecutionVerifier,
// process.exit calls), so covering it would require mocking the entire
// pipeline for a 2-line conditional. Verified by direct code inspection
// instead (scripts/ship-preflight.js, Step 3 of main()) -- see this SD's
// user story evidence for the citation.
