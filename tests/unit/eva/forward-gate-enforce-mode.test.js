// SD-LEO-INFRA-DECISION-FILTER-ENFORCE-MODE-001 (chairman ruling 2026-06-22, stage 1 = canary):
// the staged enforce-mode canary records a `would_hold` shadow verdict but NEVER touches chairman
// authority — advisory:true is always set, it only records, and an unknown mode fails safe toward
// advisory (never enforces by accident). These pin the pure helpers.
import { describe, it, expect } from 'vitest';
import {
  buildEnforceMetadata,
  resolveEnforceMode,
  ENFORCE_MODE_ADVISORY,
  ENFORCE_MODE_CANARY,
} from '../../../lib/eva/forward-gate.js';

describe('buildEnforceMetadata (SD-LEO-INFRA-DECISION-FILTER-ENFORCE-MODE-001)', () => {
  const holdVerdict = { auto_proceed: false, recommendation: 'review: high cost' };
  const proceedVerdict = { auto_proceed: true, recommendation: 'auto-proceed' };

  it('TS-1: advisory mode -> {advisory:true, mode:advisory}, no would_hold', () => {
    const m = buildEnforceMetadata(holdVerdict, ENFORCE_MODE_ADVISORY);
    expect(m).toEqual({ advisory: true, mode: ENFORCE_MODE_ADVISORY });
    expect(m.would_hold).toBeUndefined();
  });

  it('TS-2: enforce-canary + auto_proceed===false -> would_hold:true with hold_reason', () => {
    const m = buildEnforceMetadata(holdVerdict, ENFORCE_MODE_CANARY);
    expect(m.mode).toBe(ENFORCE_MODE_CANARY);
    expect(m.would_hold).toBe(true);
    expect(m.hold_reason).toBe('review: high cost');
    expect(m.reversible).toBe(true);
  });

  it('TS-3: enforce-canary + auto_proceed===true -> would_hold:false', () => {
    expect(buildEnforceMetadata(proceedVerdict, ENFORCE_MODE_CANARY).would_hold).toBe(false);
  });

  it('TS-4: an unknown mode resolves to advisory (fail-safe, never enforces)', () => {
    expect(buildEnforceMetadata(holdVerdict, 'block-everything')).toEqual({ advisory: true, mode: ENFORCE_MODE_ADVISORY });
  });

  it('TS-5: advisory:true is set in EVERY mode (chairman authority untouched)', () => {
    expect(buildEnforceMetadata(holdVerdict, ENFORCE_MODE_ADVISORY).advisory).toBe(true);
    expect(buildEnforceMetadata(holdVerdict, ENFORCE_MODE_CANARY).advisory).toBe(true);
  });

  it('missing recommendation -> hold_reason null (no crash)', () => {
    expect(buildEnforceMetadata({ auto_proceed: false }, ENFORCE_MODE_CANARY).hold_reason).toBeNull();
  });
});

describe('resolveEnforceMode', () => {
  it('explicit opt wins', () => {
    expect(resolveEnforceMode(ENFORCE_MODE_CANARY)).toBe(ENFORCE_MODE_CANARY);
    expect(resolveEnforceMode('nonsense')).toBe(ENFORCE_MODE_ADVISORY);
  });

  it('undefined opt + no env -> advisory default', () => {
    const prev = process.env.DECISION_FILTER_ENFORCE_MODE;
    delete process.env.DECISION_FILTER_ENFORCE_MODE;
    try {
      expect(resolveEnforceMode(undefined)).toBe(ENFORCE_MODE_ADVISORY);
    } finally {
      if (prev !== undefined) process.env.DECISION_FILTER_ENFORCE_MODE = prev;
    }
  });
});
