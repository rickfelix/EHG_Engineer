/**
 * Tests for Corrective Priority Calculator
 * Part of: SD-EHG-ORCH-INTELLIGENCE-INTEGRATION-001-C
 */

import { describe, it, expect } from 'vitest';
import { calculateCorrectivePriority } from '../../../lib/eva/corrective-priority-calculator.js';

describe('Corrective Priority Calculator', () => {
  describe('calculateCorrectivePriority', () => {
    it('should return high or critical for escalation tier with no signals', () => {
      const result = calculateCorrectivePriority({ tier: 'escalation' });
      // Without boosting signals, escalation blends to high (floor prevents medium)
      expect(['critical', 'high']).toContain(result.priority);
      expect(result.source).toBe('intelligence-blended');
      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });

    it('should return critical for escalation with strong OKR signals', () => {
      const result = calculateCorrectivePriority({
        tier: 'escalation',
        okrImpact: { totalScore: 40 },
        patterns: [{ status: 'active', severity: 'critical' }],
        blocking: { blocksCount: 3 },
      });
      expect(result.priority).toBe('critical');
    });

    it('should return high for gap-closure tier with no signals', () => {
      const result = calculateCorrectivePriority({ tier: 'gap-closure' });
      expect(result.priority).toBe('high');
      expect(result.source).toBe('intelligence-blended');
    });

    it('should return medium for minor tier with no signals', () => {
      const result = calculateCorrectivePriority({ tier: 'minor' });
      expect(result.priority).toBe('medium');
      expect(result.source).toBe('intelligence-blended');
    });

    it('should boost priority when OKR impact is high', () => {
      const baseline = calculateCorrectivePriority({ tier: 'gap-closure' });
      const boosted = calculateCorrectivePriority({
        tier: 'gap-closure',
        okrImpact: { totalScore: 45 },
      });

      expect(boosted.score).toBeGreaterThan(baseline.score);
      expect(boosted.reason_codes).toContain('okr_priority');
    });

    it('should boost priority when patterns exist', () => {
      const baseline = calculateCorrectivePriority({ tier: 'minor' });
      const boosted = calculateCorrectivePriority({
        tier: 'minor',
        patterns: [
          { status: 'active', severity: 'critical' },
          { status: 'active', severity: 'high' },
        ],
      });

      expect(boosted.score).toBeGreaterThan(baseline.score);
    });

    it('should boost priority when blocking count is high', () => {
      const baseline = calculateCorrectivePriority({ tier: 'minor' });
      const boosted = calculateCorrectivePriority({
        tier: 'minor',
        blocking: { blocksCount: 5 },
      });

      expect(boosted.score).toBeGreaterThan(baseline.score);
    });

    it('should never drop escalation below high (escalation floor)', () => {
      // Even with no signals, escalation should be at least high
      const result = calculateCorrectivePriority({
        tier: 'escalation',
        okrImpact: null,
        patterns: [],
        blocking: { blocksCount: 0 },
      });

      expect(['critical', 'high']).toContain(result.priority);
    });

    it('should include vision_score in reason_codes when provided', () => {
      const result = calculateCorrectivePriority({
        tier: 'gap-closure',
        visionScore: 72,
      });

      expect(result.reason_codes).toContain('vision_score_72');
    });

    it('should fall back to tier-based priority for unknown tiers', () => {
      const result = calculateCorrectivePriority({ tier: 'unknown-tier' });
      expect(result.source).toBe('tier-fallback');
      expect(result.reason_codes).toContain('tier_fallback');
    });

    it('should return valid band values', () => {
      const validBands = ['P0', 'P1', 'P2', 'P3'];
      for (const tier of ['escalation', 'gap-closure', 'minor']) {
        const result = calculateCorrectivePriority({ tier });
        expect(validBands).toContain(result.band);
      }
    });

    it('should clamp score between 0 and 1', () => {
      // Very high signals
      const result = calculateCorrectivePriority({
        tier: 'escalation',
        okrImpact: { totalScore: 50 },
        patterns: [
          { status: 'active', severity: 'critical' },
          { status: 'active', severity: 'critical' },
          { status: 'active', severity: 'critical' },
        ],
        blocking: { blocksCount: 10 },
      });

      expect(result.score).toBeLessThanOrEqual(1);
      expect(result.score).toBeGreaterThanOrEqual(0);
    });

    it('should produce higher scores for escalation than minor', () => {
      const escalation = calculateCorrectivePriority({ tier: 'escalation' });
      const minor = calculateCorrectivePriority({ tier: 'minor' });

      expect(escalation.score).toBeGreaterThan(minor.score);
    });
  });
});
