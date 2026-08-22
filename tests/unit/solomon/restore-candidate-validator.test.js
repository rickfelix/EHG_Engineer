// SD-LEO-GEN-STAGE-DECISION-RESTORE-001 (FR-1): TS-1/TS-2.
import { describe, it, expect } from 'vitest';
import { validateRestoreCandidate } from '../../../lib/solomon/restore-candidate-validator.js';

describe('validateRestoreCandidate (SD-LEO-GEN-STAGE-DECISION-RESTORE-001 FR-1)', () => {
  it('TS-1: returns valid:true when the candidate normalizes to the current value', () => {
    const result = validateRestoreCandidate('adam-08049808 (era closure notes)', 'adam-08049808');
    expect(result.valid).toBe(true);
    expect(result.reason).toContain('adam-08049808');
  });

  it('TS-2: returns valid:false with a human-readable reason when the candidate mismatches', () => {
    const result = validateRestoreCandidate('solomon-52f5bab8 (different decider)', 'adam-08049808');
    expect(result.valid).toBe(false);
    expect(typeof result.reason).toBe('string');
    expect(result.reason.length).toBeGreaterThan(0);
  });

  it('a candidate whose normalized form is byte-identical to itself (no truncation needed) validates', () => {
    const result = validateRestoreCandidate('adam', 'adam');
    expect(result.valid).toBe(true);
  });

  it('rejects a missing/empty currentDecisionBy', () => {
    expect(validateRestoreCandidate('adam-08049808', '').valid).toBe(false);
    expect(validateRestoreCandidate('adam-08049808', null).valid).toBe(false);
    expect(validateRestoreCandidate('adam-08049808', undefined).valid).toBe(false);
  });

  it('rejects a missing/empty/whitespace-only candidate', () => {
    expect(validateRestoreCandidate('', 'adam-08049808').valid).toBe(false);
    expect(validateRestoreCandidate('   ', 'adam-08049808').valid).toBe(false);
    expect(validateRestoreCandidate(null, 'adam-08049808').valid).toBe(false);
  });

  it('a candidate with prose beyond the 40-char cap is truncated before comparison, matching normalizeDecisionBy\'s own contract', () => {
    const longToken = 'a'.repeat(45);
    const result = validateRestoreCandidate(longToken, 'a'.repeat(40));
    expect(result.valid).toBe(true);
  });
});
