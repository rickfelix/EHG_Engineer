/**
 * Unit Tests for Urgency Scorer
 * Part of SD-LEO-ENH-AUTO-PROCEED-001-11
 */
import {
  BAND_THRESHOLDS,
  scoreToBand,
  bandToNumeric,
  calculateUrgencyScore,
  shouldReprioritize,
  checkJitterProtection,
  compareByUrgency,
  sortByUrgency,
  CONFIG
} from '../../../scripts/modules/auto-proceed/urgency-scorer.js';

describe('Urgency Scorer', () => {
  describe('scoreToBand', () => {
    it('should return P0 for scores >= 0.85', () => {
      expect(scoreToBand(0.85)).toBe('P0');
      expect(scoreToBand(0.90)).toBe('P0');
      expect(scoreToBand(1.0)).toBe('P0');
    });

    it('should return P1 for scores >= 0.65 and < 0.85', () => {
      expect(scoreToBand(0.65)).toBe('P1');
      expect(scoreToBand(0.70)).toBe('P1');
      expect(scoreToBand(0.849)).toBe('P1');
    });

    it('should return P2 for scores >= 0.40 and < 0.65', () => {
      expect(scoreToBand(0.40)).toBe('P2');
      expect(scoreToBand(0.50)).toBe('P2');
      expect(scoreToBand(0.649)).toBe('P2');
    });

    it('should return P3 for scores < 0.40', () => {
      expect(scoreToBand(0.39)).toBe('P3');
      expect(scoreToBand(0.20)).toBe('P3');
      expect(scoreToBand(0.0)).toBe('P3');
    });

    it('should handle edge cases', () => {
      expect(scoreToBand(null)).toBe('P3');
      expect(scoreToBand(undefined)).toBe('P3');
      expect(scoreToBand(NaN)).toBe('P3');
      expect(scoreToBand(-0.5)).toBe('P3'); // Clamped to 0
      expect(scoreToBand(1.5)).toBe('P0'); // Clamped to 1
    });
  });

  describe('bandToNumeric', () => {
    it('should convert bands to numeric values', () => {
      expect(bandToNumeric('P0')).toBe(0);
      expect(bandToNumeric('P1')).toBe(1);
      expect(bandToNumeric('P2')).toBe(2);
      expect(bandToNumeric('P3')).toBe(3);
    });

    it('should return 3 for unknown bands', () => {
      expect(bandToNumeric('P4')).toBe(3);
      expect(bandToNumeric(null)).toBe(3);
      expect(bandToNumeric(undefined)).toBe(3);
    });
  });

  describe('calculateUrgencyScore', () => {
    it('should return baseline score for empty SD', () => {
      const result = calculateUrgencyScore({ sd: {} });
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
      expect(result.band).toBeDefined();
      expect(result.model_version).toBe('v1.3.0');
    });

    it('should boost score for critical priority', () => {
      const result = calculateUrgencyScore({ sd: { priority: 'critical' } });
      expect(result.score).toBeGreaterThan(0.5);
      expect(result.reason_codes).toContain('priority_critical');
    });

    it('should reduce score for low priority', () => {
      const result = calculateUrgencyScore({ sd: { priority: 'low' } });
      expect(result.score).toBeLessThan(0.5);
    });

    it('should boost score for active patterns', () => {
      const result = calculateUrgencyScore({
        sd: { priority: 'medium' },
        patterns: [
          { status: 'active', severity: 'critical' },
          { status: 'active', severity: 'high' }
        ]
      });
      expect(result.score).toBeGreaterThan(0.5);
      expect(result.reason_codes).toContain('patterns_2');
    });

    it('should boost score for blocking dependencies', () => {
      const result = calculateUrgencyScore({
        sd: { metadata: { blocks_count: 3 } }
      });
      expect(result.score).toBeGreaterThan(0.5);
      expect(result.reason_codes).toContain('blocks_3');
    });

    it('should blend learning update signals', () => {
      const result = calculateUrgencyScore({
        sd: { priority: 'low' },
        learningUpdate: {
          urgency_score: 0.95,
          reason_codes: ['deadline_detected']
        }
      });
      // Learning signal should boost the score (weight 0.20)
      expect(result.score).toBeGreaterThan(0.45);
      expect(result.reason_codes).toContain('deadline_detected');
    });

    it('should boost score with OKR impact via parameter', () => {
      const result = calculateUrgencyScore({
        sd: { priority: 'medium' },
        okrImpact: { totalScore: 40 }
      });
      // OKR weight 0.20, normalized 40/50 = 0.8, boost = 0.16
      expect(result.score).toBeGreaterThan(0.5);
      expect(result.reason_codes).toContain('okr_priority');
    });

    it('should boost score with OKR impact from metadata', () => {
      const result = calculateUrgencyScore({
        sd: { priority: 'medium', metadata: { okr_impact_score: 50 } }
      });
      // Max OKR: 50/50 = 1.0, boost = 0.20
      expect(result.score).toBeGreaterThan(0.6);
      expect(result.reason_codes).toContain('okr_priority');
    });

    it('should not boost when OKR impact is zero or absent', () => {
      const withoutOkr = calculateUrgencyScore({ sd: { priority: 'medium' } });
      const withZeroOkr = calculateUrgencyScore({
        sd: { priority: 'medium', metadata: { okr_impact_score: 0 } }
      });
      expect(withoutOkr.score).toBe(withZeroOkr.score);
      expect(withoutOkr.reason_codes).not.toContain('okr_priority');
    });

    it('should cap OKR impact normalization at 1.0', () => {
      const result = calculateUrgencyScore({
        sd: { priority: 'medium' },
        okrImpact: { totalScore: 100 }
      });
      // 100/50 = 2.0, capped to 1.0, boost = 0.20
      expect(result.score).toBeLessThanOrEqual(1.0);
      expect(result.reason_codes).toContain('okr_priority');
    });
  });

  describe('shouldReprioritize', () => {
    it('should return true when delta exceeds threshold', () => {
      expect(shouldReprioritize(0.5, 0.7)).toBe(true); // Delta 0.20
      expect(shouldReprioritize(0.3, 0.5)).toBe(true); // Delta 0.20
    });

    it('should return false when delta is below threshold', () => {
      expect(shouldReprioritize(0.5, 0.6)).toBe(false); // Delta 0.10
      expect(shouldReprioritize(0.5, 0.55)).toBe(false); // Delta 0.05
    });

    it('should handle boundary cases', () => {
      // Exactly at threshold
      expect(shouldReprioritize(0.5, 0.65)).toBe(true); // Delta 0.15 = threshold
      expect(shouldReprioritize(0.5, 0.649)).toBe(false); // Delta 0.149 < threshold
    });
  });

  describe('checkJitterProtection', () => {
    it('should allow same band changes', () => {
      const result = checkJitterProtection({
        oldBand: 'P2',
        newBand: 'P2',
        scoreDelta: 0.10,
        lastChangeAt: new Date()
      });
      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('same_band');
    });

    it('should allow override delta changes', () => {
      const result = checkJitterProtection({
        oldBand: 'P3',
        newBand: 'P0',
        scoreDelta: 0.50, // > 0.30 override delta
        lastChangeAt: new Date()
      });
      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('override_delta');
    });

    it('should defer changes within jitter window', () => {
      const result = checkJitterProtection({
        oldBand: 'P2',
        newBand: 'P1',
        scoreDelta: 0.20,
        lastChangeAt: new Date() // Just now
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('deferred_due_to_jitter');
    });

    it('should allow changes after jitter window', () => {
      const oldTime = new Date(Date.now() - 3000); // 3 seconds ago
      const result = checkJitterProtection({
        oldBand: 'P2',
        newBand: 'P1',
        scoreDelta: 0.20,
        lastChangeAt: oldTime
      });
      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('jitter_window_passed');
    });
  });

  describe('compareByUrgency', () => {
    it('should prioritize lower band numbers (P0 > P3)', () => {
      const a = { urgency_band: 'P0', urgency_score: 0.85 };
      const b = { urgency_band: 'P3', urgency_score: 0.30 };
      expect(compareByUrgency(a, b)).toBeLessThan(0);
    });

    it('should compare by score within same band', () => {
      const a = { urgency_band: 'P1', urgency_score: 0.80 };
      const b = { urgency_band: 'P1', urgency_score: 0.70 };
      expect(compareByUrgency(a, b)).toBeLessThan(0); // Higher score first
    });

    it('should compare by time for equal scores', () => {
      const a = { urgency_band: 'P2', urgency_score: 0.50, created_at: '2026-01-01' };
      const b = { urgency_band: 'P2', urgency_score: 0.50, created_at: '2026-01-02' };
      expect(compareByUrgency(a, b)).toBeLessThan(0); // Earlier first (FIFO)
    });
  });

  describe('sortByUrgency', () => {
    it('should sort array by urgency', () => {
      const sds = [
        { id: 'c', urgency_band: 'P3', urgency_score: 0.30, created_at: '2026-01-01' },
        { id: 'a', urgency_band: 'P0', urgency_score: 0.90, created_at: '2026-01-03' },
        { id: 'b', urgency_band: 'P1', urgency_score: 0.70, created_at: '2026-01-02' }
      ];

      const sorted = sortByUrgency(sds);

      expect(sorted[0].id).toBe('a'); // P0
      expect(sorted[1].id).toBe('b'); // P1
      expect(sorted[2].id).toBe('c'); // P3
    });

    it('should maintain stability for equal items', () => {
      const sds = [
        { id: '1', urgency_band: 'P2', urgency_score: 0.50, created_at: '2026-01-01' },
        { id: '2', urgency_band: 'P2', urgency_score: 0.50, created_at: '2026-01-01' },
        { id: '3', urgency_band: 'P2', urgency_score: 0.50, created_at: '2026-01-01' }
      ];

      const sorted = sortByUrgency(sds);

      // Should maintain original order for identical items
      expect(sorted[0].id).toBe('1');
      expect(sorted[1].id).toBe('2');
      expect(sorted[2].id).toBe('3');
    });

    it('should handle empty array', () => {
      expect(sortByUrgency([])).toEqual([]);
    });

    it('should handle non-array input', () => {
      expect(sortByUrgency(null)).toEqual([]);
      expect(sortByUrgency(undefined)).toEqual([]);
    });
  });

  describe('BAND_THRESHOLDS', () => {
    it('should have correct threshold values', () => {
      expect(BAND_THRESHOLDS.P0).toBe(0.85);
      expect(BAND_THRESHOLDS.P1).toBe(0.65);
      expect(BAND_THRESHOLDS.P2).toBe(0.40);
      expect(BAND_THRESHOLDS.P3).toBe(0.00);
    });
  });
});
