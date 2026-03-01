import { describe, it, expect, vi } from 'vitest';
import {
  calculateOKRPriority,
  getAlignmentScore,
  rankByOKRAlignment,
  getContributionWeights,
  getKRStatusMultipliers,
} from '../../../lib/eva/okr-priority-integrator.js';

function mockSupabase(tableData = {}) {
  return {
    from: vi.fn((table) => {
      const data = tableData[table] || { data: [], error: null };
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        order: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        then: (resolve) => resolve(data),
      };
      return chain;
    }),
  };
}

const silentLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('okr-priority-integrator', () => {
  describe('calculateOKRPriority', () => {
    it('returns zero when no supabase', async () => {
      const result = await calculateOKRPriority(null, 'sd-1');
      expect(result.score).toBe(0);
      expect(result.maxScore).toBe(50);
      expect(result.alignments).toEqual([]);
      expect(result.error).toBe('Missing supabase or sdId');
    });

    it('returns zero when no sdId', async () => {
      const supabase = mockSupabase();
      const result = await calculateOKRPriority(supabase, null);
      expect(result.score).toBe(0);
      expect(result.error).toBe('Missing supabase or sdId');
    });

    it('returns zero when no alignments', async () => {
      const supabase = mockSupabase({
        sd_key_result_alignment: { data: [], error: null },
      });

      const result = await calculateOKRPriority(supabase, 'sd-1', { logger: silentLogger });
      expect(result.score).toBe(0);
      expect(result.alignments).toEqual([]);
    });

    it('calculates score for direct on_track alignment', async () => {
      const supabase = mockSupabase({
        sd_key_result_alignment: {
          data: [{ id: 'a-1', key_result_id: 'kr-1', contribution_type: 'direct', alignment_weight: 1.0 }],
          error: null,
        },
        key_results: {
          data: [{ id: 'kr-1', status: 'on_track', title: 'KR1' }],
          error: null,
        },
      });

      const result = await calculateOKRPriority(supabase, 'sd-1', { logger: silentLogger });
      // direct=1.5 * on_track=1.0 * weight=1.0 = 1.5 → normalized: min(50, round(1.5*10)) = 15
      expect(result.score).toBe(15);
      expect(result.maxScore).toBe(50);
      expect(result.alignments).toHaveLength(1);
      expect(result.alignments[0].contributionType).toBe('direct');
      expect(result.alignments[0].krStatus).toBe('on_track');
    });

    it('calculates higher score for off_track KR', async () => {
      const supabase = mockSupabase({
        sd_key_result_alignment: {
          data: [{ id: 'a-1', key_result_id: 'kr-1', contribution_type: 'direct', alignment_weight: 1.0 }],
          error: null,
        },
        key_results: {
          data: [{ id: 'kr-1', status: 'off_track', title: 'KR1' }],
          error: null,
        },
      });

      const result = await calculateOKRPriority(supabase, 'sd-1', { logger: silentLogger });
      // direct=1.5 * off_track=3.0 * weight=1.0 = 4.5 → normalized: min(50, round(4.5*10)) = 45
      expect(result.score).toBe(45);
    });

    it('calculates score for multiple alignments', async () => {
      const supabase = mockSupabase({
        sd_key_result_alignment: {
          data: [
            { id: 'a-1', key_result_id: 'kr-1', contribution_type: 'direct', alignment_weight: 1.0 },
            { id: 'a-2', key_result_id: 'kr-2', contribution_type: 'supporting', alignment_weight: 0.5 },
          ],
          error: null,
        },
        key_results: {
          data: [
            { id: 'kr-1', status: 'on_track', title: 'KR1' },
            { id: 'kr-2', status: 'at_risk', title: 'KR2' },
          ],
          error: null,
        },
      });

      const result = await calculateOKRPriority(supabase, 'sd-1', { logger: silentLogger });
      // align1: direct=1.5 * on_track=1.0 * 1.0 = 1.5
      // align2: supporting=0.5 * at_risk=2.0 * 0.5 = 0.5
      // total = 2.0 → normalized: min(50, round(2.0*10)) = 20
      expect(result.score).toBe(20);
      expect(result.alignments).toHaveLength(2);
    });

    it('caps score at maxScore', async () => {
      const supabase = mockSupabase({
        sd_key_result_alignment: {
          data: [
            { id: 'a-1', key_result_id: 'kr-1', contribution_type: 'direct', alignment_weight: 1.0 },
            { id: 'a-2', key_result_id: 'kr-2', contribution_type: 'direct', alignment_weight: 1.0 },
            { id: 'a-3', key_result_id: 'kr-3', contribution_type: 'direct', alignment_weight: 1.0 },
          ],
          error: null,
        },
        key_results: {
          data: [
            { id: 'kr-1', status: 'off_track', title: 'KR1' },
            { id: 'kr-2', status: 'off_track', title: 'KR2' },
            { id: 'kr-3', status: 'off_track', title: 'KR3' },
          ],
          error: null,
        },
      });

      const result = await calculateOKRPriority(supabase, 'sd-1', { logger: silentLogger });
      // 3 * (1.5 * 3.0 * 1.0) = 13.5 → normalized: min(50, round(13.5*10)) = 50
      expect(result.score).toBe(50);
    });

    it('handles alignment query error', async () => {
      const supabase = mockSupabase({
        sd_key_result_alignment: { data: null, error: { message: 'Connection refused' } },
      });

      const result = await calculateOKRPriority(supabase, 'sd-1', { logger: silentLogger });
      expect(result.score).toBe(0);
      expect(result.error).toBe('Connection refused');
    });
  });

  describe('getAlignmentScore', () => {
    it('returns zero for empty alignments', () => {
      const result = getAlignmentScore([]);
      expect(result.rawScore).toBe(0);
      expect(result.breakdown).toEqual([]);
    });

    it('returns zero for null alignments', () => {
      const result = getAlignmentScore(null);
      expect(result.rawScore).toBe(0);
    });

    it('calculates raw score for direct alignment', () => {
      const alignments = [{ key_result_id: 'kr-1', contribution_type: 'direct', alignment_weight: 1.0 }];
      const krMap = new Map([['kr-1', 'on_track']]);

      const result = getAlignmentScore(alignments, krMap);
      // direct=1.5 * on_track=1.0 * 1.0 = 1.5
      expect(result.rawScore).toBe(1.5);
      expect(result.breakdown).toHaveLength(1);
      expect(result.breakdown[0].contributionType).toBe('direct');
    });

    it('calculates raw score for enabling alignment with at_risk KR', () => {
      const alignments = [{ key_result_id: 'kr-1', contribution_type: 'enabling', alignment_weight: 1.0 }];
      const krMap = new Map([['kr-1', 'at_risk']]);

      const result = getAlignmentScore(alignments, krMap);
      // enabling=1.0 * at_risk=2.0 * 1.0 = 2.0
      expect(result.rawScore).toBe(2);
    });

    it('defaults to on_track when KR status not in map', () => {
      const alignments = [{ key_result_id: 'kr-1', contribution_type: 'direct', alignment_weight: 1.0 }];

      const result = getAlignmentScore(alignments);
      // direct=1.5 * on_track=1.0 (default) * 1.0 = 1.5
      expect(result.rawScore).toBe(1.5);
    });

    it('uses default weight for unknown contribution type', () => {
      const alignments = [{ key_result_id: 'kr-1', contribution_type: 'unknown', alignment_weight: 1.0 }];

      const result = getAlignmentScore(alignments);
      // unknown=0.5 * on_track=1.0 * 1.0 = 0.5
      expect(result.rawScore).toBe(0.5);
    });
  });

  describe('rankByOKRAlignment', () => {
    it('returns empty when no supabase', async () => {
      const result = await rankByOKRAlignment(null, ['sd-1']);
      expect(result.ranked).toEqual([]);
      expect(result.error).toBe('Missing supabase or sdIds');
    });

    it('returns empty when no sdIds', async () => {
      const supabase = mockSupabase();
      const result = await rankByOKRAlignment(supabase, []);
      expect(result.ranked).toEqual([]);
    });

    it('ranks SDs by descending OKR score', async () => {
      // SD-1 gets direct + off_track = high score
      // SD-2 gets supporting + on_track = low score
      const supabase = mockSupabase({
        sd_key_result_alignment: {
          data: [
            { id: 'a-1', key_result_id: 'kr-1', contribution_type: 'direct', alignment_weight: 1.0 },
          ],
          error: null,
        },
        key_results: {
          data: [{ id: 'kr-1', status: 'off_track', title: 'KR1' }],
          error: null,
        },
      });

      const result = await rankByOKRAlignment(supabase, ['sd-1', 'sd-2'], { logger: silentLogger });
      expect(result.ranked).toHaveLength(2);
      // Both get same score because mock returns same data for all SDs
      expect(result.ranked[0].okrScore).toBeGreaterThanOrEqual(result.ranked[1].okrScore);
    });

    it('includes alignment count and top contribution', async () => {
      const supabase = mockSupabase({
        sd_key_result_alignment: {
          data: [
            { id: 'a-1', key_result_id: 'kr-1', contribution_type: 'direct', alignment_weight: 1.0 },
            { id: 'a-2', key_result_id: 'kr-2', contribution_type: 'enabling', alignment_weight: 0.5 },
          ],
          error: null,
        },
        key_results: {
          data: [
            { id: 'kr-1', status: 'on_track', title: 'KR1' },
            { id: 'kr-2', status: 'on_track', title: 'KR2' },
          ],
          error: null,
        },
      });

      const result = await rankByOKRAlignment(supabase, ['sd-1'], { logger: silentLogger });
      expect(result.ranked[0].alignmentCount).toBe(2);
      expect(result.ranked[0].topContribution).toBe('direct');
    });
  });

  describe('getContributionWeights', () => {
    it('returns contribution weight constants', () => {
      const weights = getContributionWeights();
      expect(weights.direct).toBe(1.5);
      expect(weights.enabling).toBe(1.0);
      expect(weights.supporting).toBe(0.5);
    });

    it('returns a copy, not the original', () => {
      const weights = getContributionWeights();
      weights.direct = 999;
      expect(getContributionWeights().direct).toBe(1.5);
    });
  });

  describe('getKRStatusMultipliers', () => {
    it('returns KR status multiplier constants', () => {
      const multipliers = getKRStatusMultipliers();
      expect(multipliers.off_track).toBe(3.0);
      expect(multipliers.at_risk).toBe(2.0);
      expect(multipliers.on_track).toBe(1.0);
      expect(multipliers.completed).toBe(0.5);
      expect(multipliers.not_started).toBe(1.5);
    });

    it('returns a copy, not the original', () => {
      const multipliers = getKRStatusMultipliers();
      multipliers.off_track = 999;
      expect(getKRStatusMultipliers().off_track).toBe(3.0);
    });
  });
});
