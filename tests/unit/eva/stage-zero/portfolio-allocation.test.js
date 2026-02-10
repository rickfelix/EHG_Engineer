/**
 * Portfolio-Level Profile Allocation Tests
 *
 * Tests for portfolio allocation retrieval, nudged recommendations,
 * and allocation count updates.
 *
 * Part of SD-LEO-ORCH-EVA-STAGE-CONFIGURABLE-001-G
 */

import { describe, it, expect, vi } from 'vitest';
import {
  getPortfolioAllocation,
  recommendProfile,
  updateAllocationCounts,
} from '../../../../lib/eva/stage-zero/portfolio-allocation.js';

const PROFILE_IDS = {
  aggressive: 'aaaa-1111',
  balanced: 'bbbb-2222',
  capital: 'cccc-3333',
};

function mockSupabase(overrides = {}) {
  const mockFrom = (table) => {
    if (table === 'portfolio_profile_allocations') {
      const defaultAllocs = [
        { id: 'a1', profile_id: PROFILE_IDS.aggressive, target_pct: '40.00', current_pct: '60.00', description: 'Aggressive' },
        { id: 'a2', profile_id: PROFILE_IDS.balanced, target_pct: '30.00', current_pct: '20.00', description: 'Balanced' },
        { id: 'a3', profile_id: PROFILE_IDS.capital, target_pct: '30.00', current_pct: '20.00', description: 'Capital' },
      ];
      const allocData = overrides.allocations ?? defaultAllocs;
      const selectResult = {
        order: () => Promise.resolve({ data: allocData, error: overrides.allocError ?? null }),
        eq: () => Promise.resolve({ error: null }),
        in: () => Promise.resolve({ data: allocData }),
        then: (resolve) => resolve({ data: allocData, error: overrides.allocError ?? null }),
      };
      return {
        select: () => selectResult,
        update: () => ({
          eq: () => Promise.resolve({ error: overrides.updateError ?? null }),
        }),
      };
    }
    if (table === 'evaluation_profiles') {
      return {
        select: () => ({
          in: () => Promise.resolve({
            data: [
              { id: PROFILE_IDS.aggressive, name: 'aggressive_growth' },
              { id: PROFILE_IDS.balanced, name: 'balanced' },
              { id: PROFILE_IDS.capital, name: 'capital_efficient' },
            ],
            error: null,
          }),
        }),
      };
    }
    if (table === 'venture_briefs') {
      return {
        select: () => ({
          not: () => Promise.resolve({
            data: overrides.ventures ?? [],
            error: overrides.ventureError ?? null,
          }),
        }),
      };
    }
    return { select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) };
  };
  return { from: mockFrom };
}

const silentLogger = { warn: () => {}, log: () => {}, error: () => {} };

describe('portfolio-allocation', () => {
  describe('getPortfolioAllocation', () => {
    it('returns allocation snapshot with gap calculation', async () => {
      const result = await getPortfolioAllocation({ supabase: mockSupabase(), logger: silentLogger });

      expect(result).toHaveLength(3);
      expect(result[0]).toHaveProperty('profile_id');
      expect(result[0]).toHaveProperty('target_pct');
      expect(result[0]).toHaveProperty('current_pct');
      expect(result[0]).toHaveProperty('gap');
    });

    it('calculates gap as target minus current', async () => {
      const result = await getPortfolioAllocation({ supabase: mockSupabase(), logger: silentLogger });

      const aggressive = result.find(r => r.profile_id === PROFILE_IDS.aggressive);
      expect(aggressive.gap).toBe(-20); // 40 target - 60 current = -20 (overweight)

      const balanced = result.find(r => r.profile_id === PROFILE_IDS.balanced);
      expect(balanced.gap).toBe(10); // 30 target - 20 current = 10 (underweight)
    });

    it('returns empty array when supabase is null', async () => {
      const result = await getPortfolioAllocation({ supabase: null, logger: silentLogger });
      expect(result).toEqual([]);
    });

    it('returns empty array on query error', async () => {
      const sb = mockSupabase({ allocError: { message: 'test error' } });
      const result = await getPortfolioAllocation({ supabase: sb, logger: silentLogger });
      expect(result).toEqual([]);
    });

    it('includes profile names from evaluation_profiles', async () => {
      const result = await getPortfolioAllocation({ supabase: mockSupabase(), logger: silentLogger });

      const aggressive = result.find(r => r.profile_id === PROFILE_IDS.aggressive);
      expect(aggressive.profile_name).toBe('aggressive_growth');
    });
  });

  describe('recommendProfile', () => {
    it('nudges toward underrepresented profiles', async () => {
      const scores = {
        [PROFILE_IDS.aggressive]: 80,
        [PROFILE_IDS.balanced]: 78,
        [PROFILE_IDS.capital]: 78,
      };

      const result = await recommendProfile(
        { supabase: mockSupabase(), logger: silentLogger },
        scores
      );

      // balanced or capital should win over aggressive since aggressive is overweight (-20 gap)
      expect(result.recommended_profile_id).not.toBe(PROFILE_IDS.aggressive);
      expect(result.reason).toBe('nudged_toward_underrepresented');
    });

    it('returns highest score when all at target', async () => {
      const atTarget = mockSupabase({
        allocations: [
          { id: 'a1', profile_id: PROFILE_IDS.aggressive, target_pct: '33.33', current_pct: '33.33', description: 'Aggressive' },
          { id: 'a2', profile_id: PROFILE_IDS.balanced, target_pct: '33.33', current_pct: '33.33', description: 'Balanced' },
          { id: 'a3', profile_id: PROFILE_IDS.capital, target_pct: '33.34', current_pct: '33.34', description: 'Capital' },
        ],
      });

      const scores = {
        [PROFILE_IDS.aggressive]: 90,
        [PROFILE_IDS.balanced]: 70,
        [PROFILE_IDS.capital]: 60,
      };

      const result = await recommendProfile(
        { supabase: atTarget, logger: silentLogger },
        scores
      );

      expect(result.recommended_profile_id).toBe(PROFILE_IDS.aggressive);
      expect(result.reason).toBe('highest_score');
    });

    it('returns null for empty scores', async () => {
      const result = await recommendProfile(
        { supabase: mockSupabase(), logger: silentLogger },
        {}
      );
      expect(result.recommended_profile_id).toBeNull();
      expect(result.reason).toBe('no_scores_provided');
    });

    it('falls back to highest score when no allocation data', async () => {
      const emptySb = mockSupabase({ allocations: [] });
      const scores = {
        'prof-1': 80,
        'prof-2': 90,
      };

      const result = await recommendProfile(
        { supabase: emptySb, logger: silentLogger },
        scores
      );

      expect(result.recommended_profile_id).toBe('prof-2');
      expect(result.reason).toBe('no_allocation_data');
    });

    it('returns null for null scores', async () => {
      const result = await recommendProfile(
        { supabase: mockSupabase(), logger: silentLogger },
        null
      );
      expect(result.recommended_profile_id).toBeNull();
    });

    it('includes raw_score and nudged_score in result', async () => {
      const scores = {
        [PROFILE_IDS.aggressive]: 80,
        [PROFILE_IDS.balanced]: 75,
        [PROFILE_IDS.capital]: 70,
      };

      const result = await recommendProfile(
        { supabase: mockSupabase(), logger: silentLogger },
        scores
      );

      expect(result).toHaveProperty('raw_score');
      expect(result).toHaveProperty('nudged_score');
      expect(result).toHaveProperty('gap');
      expect(typeof result.raw_score).toBe('number');
      expect(typeof result.nudged_score).toBe('number');
    });
  });

  describe('updateAllocationCounts', () => {
    it('recalculates current_pct from active ventures', async () => {
      const sb = mockSupabase({
        ventures: [
          { profile_id: PROFILE_IDS.aggressive },
          { profile_id: PROFILE_IDS.aggressive },
          { profile_id: PROFILE_IDS.aggressive },
          { profile_id: PROFILE_IDS.balanced },
          { profile_id: PROFILE_IDS.capital },
        ],
      });

      const result = await updateAllocationCounts({ supabase: sb, logger: silentLogger });

      expect(result.total_ventures).toBe(5);
      expect(result.updated).toBeGreaterThan(0);
    });

    it('returns zero for empty portfolio', async () => {
      const sb = mockSupabase({ ventures: [] });
      const result = await updateAllocationCounts({ supabase: sb, logger: silentLogger });

      expect(result.total_ventures).toBe(0);
    });

    it('returns zero when supabase is null', async () => {
      const result = await updateAllocationCounts({ supabase: null, logger: silentLogger });
      expect(result).toEqual({ updated: 0, total_ventures: 0 });
    });

    it('handles venture query error gracefully', async () => {
      const sb = mockSupabase({ ventureError: { message: 'test error' } });
      const result = await updateAllocationCounts({ supabase: sb, logger: silentLogger });
      expect(result).toEqual({ updated: 0, total_ventures: 0 });
    });
  });
});
