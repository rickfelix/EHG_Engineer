/**
 * QF-20260727-876: printSummary()'s Branch Verification line previously said
 * "No unmerged branches" identically whether or not any stack-context siblings were
 * recognized -- silently hiding that N sibling PRs exist (same silent-truncation
 * concern the multi-repo partial-scan warning above it already closes).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { printSummary } from '../../../ship-preflight.js';

describe('ship-preflight printSummary — stack-context visibility (QF-20260727-876)', () => {
  let logSpy;

  afterEach(() => {
    logSpy?.mockRestore();
  });

  it('names the recognized stack siblings even though Branch Verification still PASSes', () => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    printSummary({
      overallPassed: true,
      hasWarnings: false,
      branchVerification: { passed: true, openPRs: [], unmergedBranches: [], stackContext: [{}, {}, {}] },
    });

    const lines = logSpy.mock.calls.map((call) => call.join(' '));
    const lineIndex = lines.findIndex((l) => l.includes('Branch Verification'));
    expect(lineIndex).toBeGreaterThan(-1);
    expect(lines[lineIndex + 1]).toMatch(/3 stack sibling/i);
  });

  it('says nothing extra when there is no recognized stack (unchanged prior behavior)', () => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    printSummary({
      overallPassed: true,
      hasWarnings: false,
      branchVerification: { passed: true, openPRs: [], unmergedBranches: [], stackContext: [] },
    });

    const lines = logSpy.mock.calls.map((call) => call.join(' '));
    const lineIndex = lines.findIndex((l) => l.includes('Branch Verification'));
    expect(lineIndex).toBeGreaterThan(-1);
    expect(lines[lineIndex + 1]).toMatch(/No unmerged branches/i);
    expect(lines[lineIndex + 1]).not.toMatch(/stack sibling/i);
  });
});
