import { describe, it, expect } from 'vitest';
import { weakerGrade, computeWeakestLinkGrade, computeEffectiveGrade, GRADE_ORDER } from '../../../lib/value-authenticity/weakest-link.js';

describe('value-authenticity weakest-link propagation', () => {
  it('GRADE_ORDER is E0 (weakest) to E3 (strongest)', () => {
    expect(GRADE_ORDER).toEqual(['E0', 'E1', 'E2', 'E3']);
  });

  describe('weakerGrade', () => {
    it('returns the weaker of two grades', () => {
      expect(weakerGrade('E2', 'E0')).toBe('E0');
      expect(weakerGrade('E0', 'E2')).toBe('E0');
      expect(weakerGrade('E3', 'E3')).toBe('E3');
    });

    it('throws on an invalid grade', () => {
      expect(() => weakerGrade('E9', 'E0')).toThrow(/invalid evidence grade/);
    });
  });

  describe('computeWeakestLinkGrade', () => {
    it('TS-4: returns the MINIMUM grade across domain claims, never the average or the strongest', () => {
      const claims = [{ evidence_grade: 'E2' }, { evidence_grade: 'E0' }, { evidence_grade: 'E1' }];
      expect(computeWeakestLinkGrade(claims)).toBe('E0');
    });

    it('returns the single grade for a single-claim input', () => {
      expect(computeWeakestLinkGrade([{ evidence_grade: 'E3' }])).toBe('E3');
    });

    it('returns E3 when all claims are E3 (never falsely downgrades)', () => {
      expect(computeWeakestLinkGrade([{ evidence_grade: 'E3' }, { evidence_grade: 'E3' }])).toBe('E3');
    });

    it('throws on an empty domainClaims array', () => {
      expect(() => computeWeakestLinkGrade([])).toThrow(/non-empty array/);
    });

    it('throws on a non-array input', () => {
      expect(() => computeWeakestLinkGrade(null)).toThrow(/non-empty array/);
    });
  });

  describe('computeEffectiveGrade', () => {
    it('TS-4: a strong canonical grade with a weak domain claim is never laundered upward -- effective_grade is E0, not E2', () => {
      const result = computeEffectiveGrade('E2', [{ evidence_grade: 'E0' }, { evidence_grade: 'E2' }]);
      expect(result.computedWeakestLinkGrade).toBe('E0');
      expect(result.effectiveGrade).toBe('E0');
    });

    it('effective grade equals canonical grade when domain claims are all at least as strong', () => {
      const result = computeEffectiveGrade('E1', [{ evidence_grade: 'E2' }, { evidence_grade: 'E3' }]);
      expect(result.computedWeakestLinkGrade).toBe('E2');
      expect(result.effectiveGrade).toBe('E1');
    });
  });
});
