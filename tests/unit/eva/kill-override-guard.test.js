import { describe, it, expect } from 'vitest';
import { shouldBlockKillApproval, extractKillGateVerdict } from '../../../lib/eva/kill-override-guard.js';

describe('shouldBlockKillApproval (SD-LEO-INFRA-VENTURE-SELECTION-DEMAND-001)', () => {
  it('blocks approval of a computed-kill verdict without override (TS-1)', () => {
    expect(shouldBlockKillApproval({ briefData: { decision: 'kill' }, overrideKill: false })).toBe(true);
  });

  it('allows approval of a computed-kill verdict with explicit override (TS-2)', () => {
    expect(shouldBlockKillApproval({ briefData: { decision: 'kill' }, overrideKill: true })).toBe(false);
  });

  it('allows approval when the verdict is not kill (TS-3)', () => {
    expect(shouldBlockKillApproval({ briefData: { decision: 'pass' }, overrideKill: false })).toBe(false);
  });

  it('allows approval when brief_data has no decision field (TS-4)', () => {
    expect(shouldBlockKillApproval({ briefData: { quality_score: 80 }, overrideKill: false })).toBe(false);
  });

  it('allows approval when briefData is null/undefined (TS-5)', () => {
    expect(shouldBlockKillApproval({ briefData: null, overrideKill: false })).toBe(false);
    expect(shouldBlockKillApproval({ briefData: undefined, overrideKill: false })).toBe(false);
  });
});

describe('extractKillGateVerdict', () => {
  it('extracts the 4 verdict fields when decision is present', () => {
    const payload = { decision: 'kill', blockProgression: true, reasons: [{ message: 'x' }], remediationRoute: 'pivot', otherField: 'ignored' };
    expect(extractKillGateVerdict(payload)).toEqual({
      decision: 'kill',
      blockProgression: true,
      reasons: [{ message: 'x' }],
      remediationRoute: 'pivot',
    });
  });

  it('returns {} when payload has no decision field', () => {
    expect(extractKillGateVerdict({ quality_score: 80 })).toEqual({});
  });

  it('returns {} for null/undefined payload', () => {
    expect(extractKillGateVerdict(null)).toEqual({});
    expect(extractKillGateVerdict(undefined)).toEqual({});
  });
});
