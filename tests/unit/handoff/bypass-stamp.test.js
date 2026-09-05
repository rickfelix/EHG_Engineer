/**
 * SD-LEO-FIX-EXEC-PLAN-ACCEPTED-001 (FR-1/FR-2/FR-7) — tests for the pure bypass-stamp core
 * shared by BaseExecutor.js (stamps) and HandoffRecorder.js (persists). This is the class of
 * fix run 1928432d's own root cause required: a bypass fall-through that never mutated the
 * result, and a recorder that hardcoded validation_passed=true regardless.
 */
import { describe, it, expect } from 'vitest';
import {
  buildBypassStamp,
  applyBypassToResult,
  deriveBypassAwareRecordFields,
  buildPersistedBypassMetadata,
  isBypassResolved,
} from '../../../lib/handoff/bypass-stamp.js';

describe('buildBypassStamp (FR-1)', () => {
  it('builds a stamp with gates defaulting to [gate] when not supplied', () => {
    const s = buildBypassStamp({ source: 'gate_failure', reason: 'r', gate: 'MANDATORY_TESTING_VALIDATION' });
    expect(s.source).toBe('gate_failure');
    expect(s.gate).toBe('MANDATORY_TESTING_VALIDATION');
    expect(s.gates).toEqual(['MANDATORY_TESTING_VALIDATION']);
  });

  it('preserves an explicit gates list instead of defaulting', () => {
    const s = buildBypassStamp({ source: 'gate_failure', gate: 'A', gates: ['A', 'B'] });
    expect(s.gates).toEqual(['A', 'B']);
  });

  it('defaults reason/patternId/followupSdKey to null, never undefined', () => {
    const s = buildBypassStamp({ source: 'authority_fence', gate: 'GATE_COORDINATOR_AUTHORITY_FENCE' });
    expect(s.reason).toBeNull();
    expect(s.patternId).toBeNull();
    expect(s.followupSdKey).toBeNull();
  });

  it('carries patternId/followupSdKey when supplied', () => {
    const s = buildBypassStamp({ source: 'gate_failure', gate: 'G', patternId: 'PAT-001', followupSdKey: null });
    expect(s.patternId).toBe('PAT-001');
    expect(s.followupSdKey).toBeNull();
  });

  it('throws without source or gate — a stamp with no origin is not a stamp', () => {
    expect(() => buildBypassStamp({ gate: 'G' })).toThrow(/source/);
    expect(() => buildBypassStamp({ source: 'gate_failure' })).toThrow(/gate/);
  });

  // SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-B (FR-B1)
  it('defaults ledgerId to null when not supplied', () => {
    const s = buildBypassStamp({ source: 'gate_failure', gate: 'G' });
    expect(s.ledgerId).toBeNull();
  });

  it('carries ledgerId when supplied — symmetric regardless of which call site sets it', () => {
    const gateFailureStamp = buildBypassStamp({ source: 'gate_failure', gate: 'G', ledgerId: 'ledger-1' });
    const authorityFenceStamp = buildBypassStamp({ source: 'authority_fence', gate: 'GATE_COORDINATOR_AUTHORITY_FENCE', ledgerId: 'ledger-1' });
    expect(gateFailureStamp.ledgerId).toBe('ledger-1');
    expect(authorityFenceStamp.ledgerId).toBe('ledger-1');
  });
});

describe('applyBypassToResult (FR-1) — the choke point run 1928432d exposed', () => {
  it('null bypassInfo (no bypass fired) leaves the result unchanged (shallow copy)', () => {
    const base = { success: true, normalizedScore: 87 };
    const r = applyBypassToResult(base, null);
    expect(r).toEqual(base);
    expect(r).not.toBe(base); // never mutates/returns the same reference
  });

  it('a set bypassInfo stamps bypassed:true plus all four bypass fields', () => {
    const base = { success: true, normalizedScore: 87 };
    const stamp = buildBypassStamp({ source: 'gate_failure', reason: 'r', gate: 'MANDATORY_TESTING_VALIDATION', patternId: 'PAT-001' });
    const r = applyBypassToResult(base, stamp);
    expect(r.bypassed).toBe(true);
    expect(r.bypassReason).toBe('r');
    expect(r.bypassedGates).toEqual(['MANDATORY_TESTING_VALIDATION']);
    expect(r.bypassSource).toBe('gate_failure');
    expect(r.bypassPatternId).toBe('PAT-001');
    expect(r.bypassFollowupSdKey).toBeNull();
    // The ORIGINAL fields survive too -- this is a merge, not a replacement.
    expect(r.success).toBe(true);
    expect(r.normalizedScore).toBe(87);
  });

  it('does NOT clobber an executor-supplied bypassed:true when bypassInfo is null (plan-to-exec/index.js class)', () => {
    const base = { success: true, bypassed: true, bypassReason: 'self-stamped by the executor' };
    const r = applyBypassToResult(base, null);
    expect(r.bypassed).toBe(true);
    expect(r.bypassReason).toBe('self-stamped by the executor');
  });

  it("BaseExecutor's own stamp wins when BOTH it and the executor fired (bypassInfo overrides)", () => {
    const base = { success: true, bypassed: true, bypassReason: 'executor self-stamp' };
    const stamp = buildBypassStamp({ source: 'gate_failure', reason: 'BaseExecutor stamp', gate: 'G' });
    const r = applyBypassToResult(base, stamp);
    expect(r.bypassReason).toBe('BaseExecutor stamp');
  });

  // SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-B (FR-B1)
  it('a set bypassInfo with ledgerId stamps bypassLedgerId onto the result', () => {
    const stamp = buildBypassStamp({ source: 'gate_failure', gate: 'G', ledgerId: 'ledger-42' });
    const r = applyBypassToResult({ success: true }, stamp);
    expect(r.bypassLedgerId).toBe('ledger-42');
  });

  it('null bypassInfo leaves bypassLedgerId absent (undefined, never fabricated)', () => {
    const r = applyBypassToResult({ success: true }, null);
    expect(r.bypassLedgerId).toBeUndefined();
  });
});

describe('deriveBypassAwareRecordFields (FR-2) — the recorder-side invariant', () => {
  it('a non-bypassed result: validationPassed follows the baseline, scoreSource unchanged', () => {
    const f = deriveBypassAwareRecordFields({ success: true }, 'measured');
    expect(f.isBypassed).toBe(false);
    expect(f.scoreSource).toBe('measured');
    expect(f.validationPassed).toBe(true);
  });

  it('THE INVARIANT: a bypassed result is NEVER validationPassed, regardless of score/success', () => {
    const f = deriveBypassAwareRecordFields({ success: true, bypassed: true, normalizedScore: 87 }, 'measured');
    expect(f.isBypassed).toBe(true);
    expect(f.validationPassed).toBe(false);
    expect(f.scoreSource).toBe('bypassed'); // overrides the 'measured' baseline
  });

  it('a bypassed result never reads as scoreSource="measured", even when the caller computed one', () => {
    const f = deriveBypassAwareRecordFields({ bypassed: true }, 'measured');
    expect(f.scoreSource).not.toBe('measured');
  });

  it('result.bypassed must be strictly true — a truthy-but-not-true value does not count', () => {
    for (const v of [1, 'yes', 'true', {}]) {
      const f = deriveBypassAwareRecordFields({ bypassed: v }, 'measured');
      expect(f.isBypassed).toBe(false);
    }
  });

  it('missing/undefined result.bypassed is treated as not bypassed', () => {
    expect(deriveBypassAwareRecordFields({}, 'measured').isBypassed).toBe(false);
    expect(deriveBypassAwareRecordFields(undefined, 'measured').isBypassed).toBe(false);
  });
});

describe('buildPersistedBypassMetadata (FR-2/FR-4)', () => {
  it('never fabricates — absent fields become null, not omitted or invented', () => {
    const m = buildPersistedBypassMetadata({}, { actor: 'session-1', nowIso: '2026-09-02T18:00:00.000Z' });
    expect(m).toEqual({
      reason: null,
      actor: 'session-1',
      gates: null,
      bypassed_at: '2026-09-02T18:00:00.000Z',
      pattern_id: null,
      followup_sd_key: null,
    });
  });

  it('carries every bypass* field from the result through to the persisted shape', () => {
    const result = {
      bypassReason: 'gate too strict',
      bypassedGates: ['MANDATORY_TESTING_VALIDATION'],
      bypassPatternId: 'PAT-001',
      bypassFollowupSdKey: 'SD-FOLLOWUP-001',
    };
    const m = buildPersistedBypassMetadata(result, { actor: 'a', nowIso: '2026-09-02T18:00:00.000Z' });
    expect(m.reason).toBe('gate too strict');
    expect(m.gates).toEqual(['MANDATORY_TESTING_VALIDATION']);
    expect(m.pattern_id).toBe('PAT-001');
    expect(m.followup_sd_key).toBe('SD-FOLLOWUP-001');
  });
});

describe('isBypassResolved (FR-4)', () => {
  it('resolved when pattern_id is present', () => {
    expect(isBypassResolved({ pattern_id: 'PAT-001', followup_sd_key: null })).toBe(true);
  });
  it('resolved when followup_sd_key is present', () => {
    expect(isBypassResolved({ pattern_id: null, followup_sd_key: 'SD-X-001' })).toBe(true);
  });
  it('unresolved when both are absent — the run 1a1b3087 class', () => {
    expect(isBypassResolved({ pattern_id: null, followup_sd_key: null })).toBe(false);
    expect(isBypassResolved({})).toBe(false);
    expect(isBypassResolved(undefined)).toBe(false);
  });
});

// ── FR-7: end-to-end proof, at the pure-function seam, that the 1928432d class is closed ──
describe('FR-7 regression: the full bypass pipeline, BaseExecutor stamp -> HandoffRecorder persist', () => {
  it('a BLOCKED-required-gate bypass never reaches validation_passed=true through the real pipeline shape', () => {
    // Simulates exactly what BaseExecutor.js's gate_failure site does, then what
    // HandoffRecorder.js does with the result it receives -- using the SAME shared functions
    // both files actually call, so this is not a re-implementation of the fix under test.
    const stamp = buildBypassStamp({
      source: 'gate_failure',
      reason: 'preflight remediation retry, bypass-validation invoked',
      gate: 'MANDATORY_TESTING_VALIDATION',
      gates: ['MANDATORY_TESTING_VALIDATION', '2D:testingSubAgentVerified'],
      issues: ['TESTING verdict BLOCKED - must be PASS or CONDITIONAL_PASS'],
    });
    const executorResult = applyBypassToResult({ success: true, normalizedScore: 87 }, stamp);

    const { isBypassed, scoreSource, validationPassed } = deriveBypassAwareRecordFields(executorResult, 'measured');
    expect(isBypassed).toBe(true);
    expect(scoreSource).toBe('bypassed');
    expect(validationPassed).toBe(false);

    const persistedBypass = buildPersistedBypassMetadata(executorResult, { actor: 'session-1', nowIso: '2026-09-02T18:00:00.000Z' });
    expect(isBypassResolved(persistedBypass)).toBe(false); // no pattern_id/followup_sd_key given
  });

  it('a genuinely passing (non-bypassed) handoff is completely unaffected end to end', () => {
    const executorResult = applyBypassToResult({ success: true, normalizedScore: 94 }, null);
    const { isBypassed, scoreSource, validationPassed } = deriveBypassAwareRecordFields(executorResult, 'measured');
    expect(isBypassed).toBe(false);
    expect(scoreSource).toBe('measured');
    expect(validationPassed).toBe(true);
    expect(executorResult.bypassed).toBeUndefined();
  });
});
