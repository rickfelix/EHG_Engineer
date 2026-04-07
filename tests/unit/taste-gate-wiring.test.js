/**
 * Tests for taste gate scoring and wiring into eva-orchestrator.
 * SD-LEO-FIX-STITCH-INTEGRATION-NON-001
 */

import { describe, it, expect } from 'vitest';
import { scoreTasteGate, buildTasteSummary, getTasteRubric, TASTE_VERDICT } from '../../lib/eva/taste-gate-scorer.js';

describe('Taste Gate Scorer', () => {
  describe('getTasteRubric', () => {
    it('returns rubric for S10 (Design)', () => {
      const rubric = getTasteRubric(10);
      expect(rubric).not.toBeNull();
      expect(rubric.name).toBe('Design');
      expect(rubric.dimensions).toHaveLength(5);
    });

    it('returns rubric for S13 (Scope)', () => {
      const rubric = getTasteRubric(13);
      expect(rubric).not.toBeNull();
      expect(rubric.name).toBe('Scope');
      expect(rubric.dimensions).toHaveLength(3);
    });

    it('returns rubric for S16 (Architecture)', () => {
      const rubric = getTasteRubric(16);
      expect(rubric).not.toBeNull();
      expect(rubric.name).toBe('Architecture');
      expect(rubric.dimensions).toHaveLength(4);
    });

    it('returns null for non-taste-gate stages', () => {
      expect(getTasteRubric(5)).toBeNull();
      expect(getTasteRubric(15)).toBeNull();
    });
  });

  describe('scoreTasteGate', () => {
    it('returns APPROVE when scores exceed threshold for S13', () => {
      const result = scoreTasteGate(13, {
        stage_fit: 4,
        roi_clarity: 4,
        cognitive_load: 4,
      });
      expect(result.verdict).toBe(TASTE_VERDICT.APPROVE);
      expect(result.meanScore).toBeGreaterThanOrEqual(3.0);
    });

    it('returns ESCALATE when no scores provided', () => {
      const result = scoreTasteGate(13, {});
      expect(result.verdict).toBe(TASTE_VERDICT.ESCALATE);
      expect(result.reason).toContain('No dimension scores');
    });

    it('returns ESCALATE when scores are critically low', () => {
      const result = scoreTasteGate(13, {
        stage_fit: 1,
        roi_clarity: 1,
        cognitive_load: 1,
      });
      expect(result.verdict).toBe(TASTE_VERDICT.ESCALATE);
    });

    it('returns CONDITIONAL when scores are near threshold', () => {
      // S13 threshold is 3.0, conditional margin is 0.15
      const result = scoreTasteGate(13, {
        stage_fit: 3,
        roi_clarity: 3,
        cognitive_load: 2.7,
      });
      expect(result.verdict).toBe(TASTE_VERDICT.CONDITIONAL);
    });

    it('throws for invalid stage number', () => {
      expect(() => scoreTasteGate(5, {})).toThrow('No taste rubric defined');
    });
  });

  describe('buildTasteSummary', () => {
    it('builds APPROVE summary within 240 chars', () => {
      const result = scoreTasteGate(13, { stage_fit: 4, roi_clarity: 4, cognitive_load: 4 });
      const summary = buildTasteSummary(result, 13);
      expect(summary).toContain('APPROVED');
      expect(summary.length).toBeLessThanOrEqual(240);
    });

    it('builds ESCALATE summary', () => {
      const result = scoreTasteGate(13, {});
      const summary = buildTasteSummary(result, 13);
      expect(summary).toContain('ESCALATE');
    });
  });
});
