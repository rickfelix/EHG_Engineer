// QF-20260906-589: validateUAT() ignored --force-complete although --help documents it
// ("UAT MUST be verified... bypass via --force-complete") and the sibling validateTests()
// already forwards {forceComplete, reason} (QF-20260509-552 #1). Mirrors that fix's shape
// and its own test pattern 1:1.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { validateUAT } = await import(
  '../../../scripts/modules/complete-quick-fix/verification.js'
);

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('QF-20260906-589: validateUAT honors {forceComplete}', () => {
  it('returns true when UAT is verified (baseline)', () => {
    expect(validateUAT(true)).toBe(true);
  });

  it('returns false when UAT not verified and no flags (legacy gate behavior)', () => {
    expect(validateUAT(false)).toBe(false);
  });

  it('returns false when UAT not verified and flags object empty (default {} arg)', () => {
    expect(validateUAT(false, {})).toBe(false);
  });

  it('returns true when UAT not verified BUT flags.forceComplete is set', () => {
    const r = validateUAT(false, {
      forceComplete: true,
      reason: 'Task Scheduler registrar UAT cannot run non-interactively (schtasks S4U password prompt)'
    });
    expect(r).toBe(true);
  });

  it('logs the reason in audit trail when bypassing', () => {
    const logs = [];
    vi.spyOn(console, 'log').mockImplementation((m) => logs.push(m));
    validateUAT(false, { forceComplete: true, reason: 'audit-test-reason' });
    expect(logs.some((l) => typeof l === 'string' && l.includes('audit-test-reason'))).toBe(true);
    expect(logs.some((l) => typeof l === 'string' && l.includes('--force-complete'))).toBe(true);
  });
});
