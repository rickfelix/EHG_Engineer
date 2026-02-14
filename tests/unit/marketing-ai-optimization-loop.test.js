/**
 * Unit Tests: Three-Cadence Optimization Loop
 * SD-EVA-FEAT-MARKETING-AI-001 (US-002)
 */

import { describe, test, expect, vi } from 'vitest';
import { createOptimizationLoop, CADENCES, ROI_THRESHOLD, CHAMPION_CONFIDENCE } from '../../lib/marketing/ai/optimization-loop.js';

function mockSupabase() {
  return {
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: null })
    })
  };
}

function mockSampler() {
  return {
    canDeclareChampion: vi.fn().mockReturnValue(true),
    selectVariant: vi.fn()
  };
}

describe('OptimizationLoop', () => {
  describe('runHourly', () => {
    test('returns empty decisions when fewer than 2 channels', async () => {
      const loop = createOptimizationLoop({ supabase: mockSupabase(), sampler: mockSampler() });
      const result = await loop.runHourly([{ channelId: 'email', spend: 100, revenue: 200 }]);
      expect(result.decisions).toHaveLength(0);
    });

    test('triggers reallocation when ROI gap exceeds threshold', async () => {
      const loop = createOptimizationLoop({ supabase: mockSupabase(), sampler: mockSampler() });
      const result = await loop.runHourly([
        { channelId: 'email', spend: 100, revenue: 300 }, // ROI = 2.0
        { channelId: 'social', spend: 100, revenue: 105 }  // ROI = 0.05
      ]);
      expect(result.decisions).toHaveLength(1);
      expect(result.decisions[0].type).toBe('budget_reallocation');
      expect(result.decisions[0].toChannel).toBe('email');
      expect(result.decisions[0].fromChannel).toBe('social');
    });

    test('no reallocation when ROI gap is below threshold', async () => {
      const loop = createOptimizationLoop({ supabase: mockSupabase(), sampler: mockSampler() });
      const result = await loop.runHourly([
        { channelId: 'email', spend: 100, revenue: 112 }, // ROI = 0.12
        { channelId: 'social', spend: 100, revenue: 105 } // ROI = 0.05
      ]);
      expect(result.decisions).toHaveLength(0);
    });

    test('caps shift at 50%', async () => {
      const loop = createOptimizationLoop({ supabase: mockSupabase(), sampler: mockSampler() });
      const result = await loop.runHourly([
        { channelId: 'email', spend: 100, revenue: 10000 }, // ROI = 99
        { channelId: 'social', spend: 100, revenue: 1 }     // ROI = -0.99
      ]);
      expect(result.decisions[0].shiftPercent).toBeLessThanOrEqual(0.50);
    });

    test('includes executionDurationMs', async () => {
      const loop = createOptimizationLoop({ supabase: mockSupabase(), sampler: mockSampler() });
      const result = await loop.runHourly([]);
      expect(result.executionDurationMs).toBeTypeOf('number');
    });
  });

  describe('runDaily', () => {
    test('returns empty when no champion', async () => {
      const loop = createOptimizationLoop({ supabase: mockSupabase(), sampler: mockSampler() });
      const result = await loop.runDaily([
        { id: 'A', successes: 100, failures: 50, isChampion: false }
      ]);
      expect(result.decisions).toHaveLength(0);
    });

    test('promotes challenger that outperforms champion', async () => {
      const loop = createOptimizationLoop({ supabase: mockSupabase(), sampler: mockSampler() });
      const result = await loop.runDaily([
        { id: 'champ', successes: 50, failures: 50, isChampion: true },   // 50%
        { id: 'chall', successes: 70, failures: 30, isChampion: false }   // 70%
      ]);
      expect(result.decisions).toHaveLength(1);
      expect(result.decisions[0].type).toBe('champion_promotion');
      expect(result.decisions[0].newChampion).toBe('chall');
    });

    test('does not promote if improvement below threshold', async () => {
      const loop = createOptimizationLoop({ supabase: mockSupabase(), sampler: mockSampler() });
      const result = await loop.runDaily([
        { id: 'champ', successes: 50, failures: 50, isChampion: true },   // 50%
        { id: 'chall', successes: 52, failures: 48, isChampion: false }   // 52%
      ]);
      expect(result.decisions).toHaveLength(0);
    });

    test('skips challenger without enough data', async () => {
      const sampler = mockSampler();
      sampler.canDeclareChampion.mockReturnValue(false);
      const loop = createOptimizationLoop({ supabase: mockSupabase(), sampler });
      const result = await loop.runDaily([
        { id: 'champ', successes: 50, failures: 50, isChampion: true },
        { id: 'chall', successes: 90, failures: 10, isChampion: false }
      ]);
      expect(result.decisions).toHaveLength(0);
    });
  });

  describe('runWeekly', () => {
    test('returns empty when fewer than 2 ventures', async () => {
      const loop = createOptimizationLoop({ supabase: mockSupabase(), sampler: mockSampler() });
      const result = await loop.runWeekly([
        { ventureId: 'v1', patterns: [{ pattern: 'A', successRate: 0.8, sampleSize: 50 }] }
      ]);
      expect(result.recommendations).toHaveLength(0);
    });

    test('recommends cross-pollination for successful patterns', async () => {
      const loop = createOptimizationLoop({ supabase: mockSupabase(), sampler: mockSampler() });
      const result = await loop.runWeekly([
        { ventureId: 'v1', patterns: [{ pattern: 'urgency-cta', successRate: 0.8, sampleSize: 50 }] },
        { ventureId: 'v2', patterns: [{ pattern: 'other-pattern', successRate: 0.3, sampleSize: 40 }] }
      ]);
      expect(result.recommendations).toHaveLength(1);
      expect(result.recommendations[0].type).toBe('cross_pollination');
      expect(result.recommendations[0].pattern).toBe('urgency-cta');
      expect(result.recommendations[0].targetVentures).toContain('v2');
    });

    test('ignores patterns with low success rate', async () => {
      const loop = createOptimizationLoop({ supabase: mockSupabase(), sampler: mockSampler() });
      const result = await loop.runWeekly([
        { ventureId: 'v1', patterns: [{ pattern: 'bad', successRate: 0.3, sampleSize: 50 }] },
        { ventureId: 'v2', patterns: [] }
      ]);
      expect(result.recommendations).toHaveLength(0);
    });

    test('ignores patterns with small sample size', async () => {
      const loop = createOptimizationLoop({ supabase: mockSupabase(), sampler: mockSampler() });
      const result = await loop.runWeekly([
        { ventureId: 'v1', patterns: [{ pattern: 'good', successRate: 0.9, sampleSize: 10 }] },
        { ventureId: 'v2', patterns: [] }
      ]);
      expect(result.recommendations).toHaveLength(0);
    });
  });

  describe('constants', () => {
    test('CADENCES has correct values', () => {
      expect(CADENCES.HOURLY).toBe('hourly');
      expect(CADENCES.DAILY).toBe('daily');
      expect(CADENCES.WEEKLY).toBe('weekly');
    });

    test('ROI_THRESHOLD is 0.15', () => {
      expect(ROI_THRESHOLD).toBe(0.15);
    });

    test('CHAMPION_CONFIDENCE is 0.05', () => {
      expect(CHAMPION_CONFIDENCE).toBe(0.05);
    });
  });
});
