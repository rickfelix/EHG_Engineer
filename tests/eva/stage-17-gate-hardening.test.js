/**
 * Tests for Stage 17 Gate Hardening
 * SD-LEO-INFRA-VENTURE-BUILD-READINESS-001-B
 *
 * Validates:
 * - evaluatePromotionGate with configurable thresholds
 * - PASS/REVIEW_NEEDED/FAIL paths with completeness
 * - Chairman override
 */
import { describe, it, expect } from 'vitest';
import { evaluatePromotionGate, PROMOTION_THRESHOLDS } from '../../lib/eva/stage-templates/stage-17.js';

describe('Stage 17 Gate Hardening', () => {
  describe('evaluatePromotionGate', () => {
    it('returns PASS when quality >= 70, completeness >= 80%, no critical gaps', () => {
      const result = evaluatePromotionGate({
        overall_quality_score: 80,
        overall_completeness_pct: 90,
        critical_gaps: [],
      });
      expect(result.pass).toBe(true);
      expect(result.decision).toBe('PASS');
      expect(result.blockers).toHaveLength(0);
      expect(result.rationale).toContain('80');
      expect(result.rationale).toContain('90');
    });

    it('returns REVIEW_NEEDED when quality >= 50, critical gaps <= 2', () => {
      const result = evaluatePromotionGate({
        overall_quality_score: 55,
        overall_completeness_pct: 70,
        critical_gaps: [
          { severity: 'critical', phase: 'The Truth', stage: 1, artifact_type: 'truth_idea_brief' },
        ],
      });
      expect(result.pass).toBe(false);
      expect(result.decision).toBe('REVIEW_NEEDED');
      expect(result.blockers.length).toBeGreaterThan(0);
    });

    it('returns FAIL when quality < 50 or critical gaps > 2', () => {
      const result = evaluatePromotionGate({
        overall_quality_score: 30,
        overall_completeness_pct: 40,
        critical_gaps: [
          { severity: 'critical', phase: 'A', stage: 1, artifact_type: 'a' },
          { severity: 'critical', phase: 'B', stage: 2, artifact_type: 'b' },
          { severity: 'critical', phase: 'C', stage: 3, artifact_type: 'c' },
        ],
      });
      expect(result.pass).toBe(false);
      expect(result.decision).toBe('FAIL');
    });

    it('returns FAIL when quality is good but completeness too low', () => {
      const result = evaluatePromotionGate({
        overall_quality_score: 85,
        overall_completeness_pct: 50,
        critical_gaps: [],
      });
      // quality >= 70 but completeness < 80, so PASS threshold not met
      // quality >= 50 and critical gaps <= 2, so REVIEW_NEEDED
      expect(result.decision).toBe('REVIEW_NEEDED');
    });

    it('supports configurable thresholds via options.thresholds', () => {
      // With default thresholds, quality=75 and completeness=85 would PASS
      const passResult = evaluatePromotionGate(
        { overall_quality_score: 75, overall_completeness_pct: 85, critical_gaps: [] },
      );
      expect(passResult.decision).toBe('PASS');

      // With stricter thresholds, same data should NOT pass
      const reviewResult = evaluatePromotionGate(
        { overall_quality_score: 75, overall_completeness_pct: 85, critical_gaps: [] },
        { thresholds: { pass: 80, review: 60, completeness_pass: 90 } },
      );
      expect(reviewResult.decision).toBe('REVIEW_NEEDED');
    });

    it('returns OVERRIDE on chairman override', () => {
      const result = evaluatePromotionGate(
        { overall_quality_score: 20, overall_completeness_pct: 10, critical_gaps: [] },
        { chairmanOverride: { approved: true, justification: 'Strategic decision' } },
      );
      expect(result.pass).toBe(true);
      expect(result.decision).toBe('OVERRIDE');
      expect(result.rationale).toContain('Strategic decision');
    });

    it('handles null/undefined reviewData gracefully', () => {
      const result = evaluatePromotionGate(null);
      expect(result.pass).toBe(false);
      expect(result.decision).toBe('FAIL');
    });

    it('filters only critical gaps for PASS evaluation', () => {
      const result = evaluatePromotionGate({
        overall_quality_score: 80,
        overall_completeness_pct: 90,
        critical_gaps: [
          { severity: 'high', phase: 'A', stage: 6, artifact_type: 'test' },
        ],
      });
      // 'high' severity gap is not 'critical', so PASS should still work
      expect(result.decision).toBe('PASS');
    });
  });

  describe('PROMOTION_THRESHOLDS', () => {
    it('includes completeness thresholds', () => {
      expect(PROMOTION_THRESHOLDS.pass).toBe(70);
      expect(PROMOTION_THRESHOLDS.review).toBe(50);
      expect(PROMOTION_THRESHOLDS.completeness_pass).toBe(80);
      expect(PROMOTION_THRESHOLDS.completeness_review).toBe(60);
    });
  });
});
