/**
 * Tests for Vision Score Gate: validateVisionScore
 * SD-EVA-QUALITY-VISION-GOVERNANCE-TESTS-001
 * Updated: SD-LEO-FIX-VISION-GATE-PERFECT-SCORE-001
 *
 * The vision-score gate is a HARD enforcement gate in LEAD-TO-PLAN.
 * It blocks when no score exists or score is below the SD-type threshold.
 * Low scores that exceed threshold produce per-dimension warnings (non-blocking).
 *
 * Gate result schema uses `passed` (not `valid`) per gate-result-schema.js.
 */

import { describe, it, expect } from 'vitest';
import { validateVisionScore, SD_TYPE_THRESHOLDS, DIMENSION_WARNING_THRESHOLD } from '../../../scripts/modules/handoff/executors/lead-to-plan/gates/vision-score.js';

describe('vision-score-gate: validateVisionScore', () => {
  describe('Path 1: no score available', () => {
    it('blocks (passed=false) when SD has no vision_score and supabase returns empty', async () => {
      const sd = { sd_key: 'SD-TEST', sd_type: 'infrastructure', vision_score: null, vision_score_action: null };
      const mockSupabase = {
        from: () => ({
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({ data: [], error: null }),
              }),
            }),
          }),
        }),
      };
      const result = await validateVisionScore(sd, mockSupabase);
      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
    });

    it('blocks (passed=false) when supabase is null and no cached score', async () => {
      const sd = { sd_key: 'SD-TEST', sd_type: 'infrastructure', vision_score: null, vision_score_action: null };
      const result = await validateVisionScore(sd, null);
      expect(result.passed).toBe(false);
    });

    it('blocks when SD has no sd_key', async () => {
      const sd = { sd_type: 'infrastructure', vision_score: null };
      const result = await validateVisionScore(sd, null);
      expect(result.passed).toBe(false);
    });
  });

  describe('Path 2: score below threshold', () => {
    it('blocks for escalation-tier score (infrastructure, score=40 < threshold=80)', async () => {
      const sd = { sd_key: 'SD-TEST', sd_type: 'infrastructure', vision_score: 40, vision_score_action: 'escalate' };
      const result = await validateVisionScore(sd, null);
      expect(result.passed).toBe(false);
    });

    it('blocks for feature SD with score below 90 threshold', async () => {
      const sd = { sd_key: 'SD-TEST', sd_type: 'feature', vision_score: 85, vision_score_action: 'gap_closure_sd' };
      const result = await validateVisionScore(sd, null);
      expect(result.passed).toBe(false);
    });

    it('blocks for bugfix SD with score below 70 threshold', async () => {
      const sd = { sd_key: 'SD-TEST', sd_type: 'bugfix', vision_score: 65, vision_score_action: 'gap_closure_sd' };
      const result = await validateVisionScore(sd, null);
      expect(result.passed).toBe(false);
    });
  });

  describe('Path 3: score at or above threshold (boundary conditions)', () => {
    it('passes when score equals threshold exactly (bugfix: score=70, threshold=70)', async () => {
      const sd = { sd_key: 'SD-TEST', sd_type: 'bugfix', vision_score: 70, vision_score_action: 'gap_closure_sd' };
      const result = await validateVisionScore(sd, null);
      expect(result.passed).toBe(true);
      expect(result.score).toBe(100);
      expect(result.maxScore).toBe(100);
    });

    it('passes when score equals threshold exactly (infrastructure: score=80, threshold=80)', async () => {
      const sd = { sd_key: 'SD-TEST', sd_type: 'infrastructure', vision_score: 80, vision_score_action: 'minor_sd' };
      const result = await validateVisionScore(sd, null);
      expect(result.passed).toBe(true);
    });

    it('passes when score equals threshold exactly (feature: score=90, threshold=90)', async () => {
      const sd = { sd_key: 'SD-TEST', sd_type: 'feature', vision_score: 90, vision_score_action: 'accept' };
      const result = await validateVisionScore(sd, null);
      expect(result.passed).toBe(true);
    });
  });

  describe('Path 4: perfect score (100/100) — PAT-AUTO-43b23a7d boundary', () => {
    it('passes for bugfix SD with perfect score=100 (threshold=70)', async () => {
      const sd = { sd_key: 'SD-TEST', sd_type: 'bugfix', vision_score: 100, vision_score_action: 'accept' };
      const result = await validateVisionScore(sd, null);
      expect(result.passed).toBe(true);
      expect(result.score).toBe(100);
    });

    it('passes for feature SD with perfect score=100 (threshold=90)', async () => {
      const sd = { sd_key: 'SD-TEST', sd_type: 'feature', vision_score: 100, vision_score_action: 'accept' };
      const result = await validateVisionScore(sd, null);
      expect(result.passed).toBe(true);
    });

    it('passes for infrastructure SD with perfect score=100 (threshold=80)', async () => {
      const sd = { sd_key: 'SD-TEST', sd_type: 'infrastructure', vision_score: 100, vision_score_action: 'accept' };
      const result = await validateVisionScore(sd, null);
      expect(result.passed).toBe(true);
      expect(result.warnings).toEqual([]);
    });
  });

  describe('Path 5: accept score — no warnings', () => {
    it('passes with no warnings for accept tier', async () => {
      const sd = { sd_key: 'SD-TEST', sd_type: 'infrastructure', vision_score: 95, vision_score_action: 'accept' };
      const result = await validateVisionScore(sd, null);
      expect(result.passed).toBe(true);
      expect(result.score).toBe(100);
      expect(result.warnings).toEqual([]);
    });
  });

  describe('Threshold invariant: strict < means equal passes', () => {
    it('threshold-1 fails, threshold passes, threshold+1 passes for all SD types', async () => {
      const cases = [
        { sd_type: 'bugfix',         threshold: SD_TYPE_THRESHOLDS.bugfix },
        { sd_type: 'infrastructure', threshold: SD_TYPE_THRESHOLDS.infrastructure },
        { sd_type: 'feature',        threshold: SD_TYPE_THRESHOLDS.feature },
      ];

      for (const { sd_type, threshold } of cases) {
        const below = await validateVisionScore({ sd_key: 'SD-TEST', sd_type, vision_score: threshold - 1 }, null);
        expect(below.passed, `${sd_type}: score=${threshold - 1} should fail`).toBe(false);

        const at = await validateVisionScore({ sd_key: 'SD-TEST', sd_type, vision_score: threshold }, null);
        expect(at.passed, `${sd_type}: score=${threshold} (at threshold) should pass`).toBe(true);

        const above = await validateVisionScore({ sd_key: 'SD-TEST', sd_type, vision_score: threshold + 1 }, null);
        expect(above.passed, `${sd_type}: score=${threshold + 1} should pass`).toBe(true);
      }
    });
  });

  describe('Supabase fallback lookup', () => {
    it('looks up latest score from eva_vision_scores when SD has no cached score', async () => {
      const sd = { sd_key: 'SD-TEST', sd_type: 'infrastructure', vision_score: null, vision_score_action: null };
      const mockSupabase = {
        from: () => ({
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  data: [{ total_score: 88, threshold_action: 'accept', scored_at: '2026-01-01' }],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      };
      const result = await validateVisionScore(sd, mockSupabase);
      expect(result.passed).toBe(true);
      expect(result.score).toBe(100);
      expect(result.warnings).toEqual([]);
      expect(result.details).toContain('88');
    });

    it('blocks when supabase query throws (no score = hard block)', async () => {
      const sd = { sd_key: 'SD-TEST', sd_type: 'infrastructure', vision_score: null, vision_score_action: null };
      const mockSupabase = {
        from: () => ({
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => { throw new Error('connection refused'); },
              }),
            }),
          }),
        }),
      };
      const result = await validateVisionScore(sd, mockSupabase);
      expect(result.passed).toBe(false);
    });
  });
});
