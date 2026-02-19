/**
 * Tests for Vision Score Gate: validateVisionScore
 * SD-EVA-QUALITY-VISION-GOVERNANCE-TESTS-001
 *
 * The vision-score gate is a soft/informational gate in LEAD-TO-PLAN.
 * It always returns valid:true and score:100 regardless of the vision score.
 * Low scores produce warnings but never block the handoff.
 */

import { describe, it, expect } from 'vitest';
import { validateVisionScore } from '../../../scripts/modules/handoff/executors/lead-to-plan/gates/vision-score.js';

describe('vision-score-gate: validateVisionScore', () => {
  describe('Path 1: no score available', () => {
    it('passes with score 100 when SD has no vision_score and supabase returns empty', async () => {
      const sd = { sd_key: 'SD-TEST', vision_score: null, vision_score_action: null };
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
      expect(result.valid).toBe(true);
      expect(result.score).toBe(100);
      expect(result.warnings).toEqual([]);
    });

    it('passes with score 100 when supabase is null', async () => {
      const sd = { sd_key: 'SD-TEST', vision_score: null, vision_score_action: null };
      const result = await validateVisionScore(sd, null);
      expect(result.valid).toBe(true);
      expect(result.score).toBe(100);
      expect(result.warnings).toEqual([]);
    });

    it('passes with score 100 when SD has no sd_key', async () => {
      const sd = { vision_score: null, vision_score_action: null };
      const result = await validateVisionScore(sd, null);
      expect(result.valid).toBe(true);
      expect(result.score).toBe(100);
    });
  });

  describe('Path 2: escalation score', () => {
    it('passes but adds warning for score with escalate action', async () => {
      const sd = { sd_key: 'SD-TEST', vision_score: 40, vision_score_action: 'escalate' };
      const result = await validateVisionScore(sd, null);
      expect(result.valid).toBe(true);
      expect(result.score).toBe(100);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('40');
    });

    it('adds warning containing ESCALATE keyword', async () => {
      const sd = { sd_key: 'SD-TEST', vision_score: 30, vision_score_action: 'escalate' };
      const result = await validateVisionScore(sd, null);
      expect(result.warnings[0]).toContain('ESCALATE');
    });
  });

  describe('Path 3: gap_closure score', () => {
    it('passes with warning for gap_closure_sd tier', async () => {
      const sd = { sd_key: 'SD-TEST', vision_score: 55, vision_score_action: 'gap_closure_sd' };
      const result = await validateVisionScore(sd, null);
      expect(result.valid).toBe(true);
      expect(result.score).toBe(100);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('GAP_CLOSURE');
    });

    it('warns for score 50 with gap_closure_sd action', async () => {
      const sd = { sd_key: 'SD-TEST', vision_score: 50, vision_score_action: 'gap_closure_sd' };
      const result = await validateVisionScore(sd, null);
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBe(1);
    });
  });

  describe('Path 4: minor_sd score', () => {
    it('passes with no warnings for minor_sd tier', async () => {
      const sd = { sd_key: 'SD-TEST', vision_score: 75, vision_score_action: 'minor_sd' };
      const result = await validateVisionScore(sd, null);
      expect(result.valid).toBe(true);
      expect(result.score).toBe(100);
      expect(result.warnings).toEqual([]);
    });
  });

  describe('Path 5: accept score', () => {
    it('passes with no warnings for accept tier', async () => {
      const sd = { sd_key: 'SD-TEST', vision_score: 95, vision_score_action: 'accept' };
      const result = await validateVisionScore(sd, null);
      expect(result.valid).toBe(true);
      expect(result.score).toBe(100);
      expect(result.warnings).toEqual([]);
    });

    it('passes with no warnings for perfect score', async () => {
      const sd = { sd_key: 'SD-TEST', vision_score: 100, vision_score_action: 'accept' };
      const result = await validateVisionScore(sd, null);
      expect(result.valid).toBe(true);
      expect(result.score).toBe(100);
      expect(result.warnings).toEqual([]);
    });
  });

  describe('Soft gate invariant', () => {
    it('always returns valid:true regardless of score (soft gate)', async () => {
      for (const score of [0, 30, 49, 50, 69, 70, 84, 85, 93, 100]) {
        const sd = { sd_key: 'SD-TEST', vision_score: score };
        const result = await validateVisionScore(sd, null);
        expect(result.valid).toBe(true);
        expect(result.score).toBe(100);
      }
    });
  });

  describe('Supabase fallback lookup', () => {
    it('looks up latest score from eva_vision_scores when SD has no cached score', async () => {
      const sd = { sd_key: 'SD-TEST', vision_score: null, vision_score_action: null };
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
      expect(result.valid).toBe(true);
      expect(result.score).toBe(100);
      expect(result.warnings).toEqual([]);
      expect(result.details).toContain('88');
    });

    it('gracefully handles supabase query error', async () => {
      const sd = { sd_key: 'SD-TEST', vision_score: null, vision_score_action: null };
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
      expect(result.valid).toBe(true);
      expect(result.score).toBe(100);
    });
  });
});
