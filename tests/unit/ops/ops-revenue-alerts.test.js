import { describe, it, expect, vi } from 'vitest';
import { computeSeverity, checkMetricDeviation } from '../../../lib/eva/services/ops-revenue-alerts.js';

describe('Operations Revenue Alerts', () => {
  describe('computeSeverity', () => {
    it('returns null for deviation within threshold (<=15%)', () => {
      expect(computeSeverity(10)).toBeNull();
      expect(computeSeverity(15)).toBeNull();
      expect(computeSeverity(0)).toBeNull();
    });

    it('returns warning for 15-30% deviation', () => {
      expect(computeSeverity(20)).toBe('warning');
      expect(computeSeverity(25)).toBe('warning');
      expect(computeSeverity(30)).toBe('warning');
    });

    it('returns critical for 30-50% deviation', () => {
      expect(computeSeverity(35)).toBe('critical');
      expect(computeSeverity(40)).toBe('critical');
      expect(computeSeverity(50)).toBe('critical');
    });

    it('returns emergency for >50% deviation', () => {
      expect(computeSeverity(51)).toBe('emergency');
      expect(computeSeverity(75)).toBe('emergency');
      expect(computeSeverity(100)).toBe('emergency');
    });

    it('handles negative deviations (uses absolute value)', () => {
      expect(computeSeverity(-20)).toBe('warning');
      expect(computeSeverity(-40)).toBe('critical');
      expect(computeSeverity(-60)).toBe('emergency');
    });
  });

  describe('checkMetricDeviation', () => {
    function mockSupabase({ existingAlerts = [], insertResult = null, insertError = null } = {}) {
      return {
        from: vi.fn((table) => ({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  in: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({ data: existingAlerts, error: null }),
                  }),
                }),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: insertResult || { id: 'alert-1', severity: 'warning', deviation_pct: 20 },
                error: insertError,
              }),
            }),
          }),
        })),
      };
    }

    it('returns null when target is null', async () => {
      const result = await checkMetricDeviation({
        ventureId: 'v1', metricType: 'mrr', actual: 800, target: null, supabase: mockSupabase(),
      });
      expect(result).toBeNull();
    });

    it('returns null when target is 0', async () => {
      const result = await checkMetricDeviation({
        ventureId: 'v1', metricType: 'mrr', actual: 800, target: 0, supabase: mockSupabase(),
      });
      expect(result).toBeNull();
    });

    it('returns null when deviation is within threshold', async () => {
      const result = await checkMetricDeviation({
        ventureId: 'v1', metricType: 'mrr', actual: 900, target: 1000, supabase: mockSupabase(),
      });
      // 10% deviation < 15% threshold
      expect(result).toBeNull();
    });

    it('creates alert when deviation exceeds threshold', async () => {
      const sb = mockSupabase({ insertResult: { id: 'a1', severity: 'warning', deviation_pct: -20 } });
      const result = await checkMetricDeviation({
        ventureId: 'v1', metricType: 'mrr', actual: 800, target: 1000, supabase: sb,
      });
      expect(result).not.toBeNull();
      expect(result.severity).toBe('warning');
    });

    it('respects cooldown — no duplicate alert same day', async () => {
      const sb = mockSupabase({ existingAlerts: [{ id: 'existing-alert' }] });
      const result = await checkMetricDeviation({
        ventureId: 'v1', metricType: 'mrr', actual: 500, target: 1000, supabase: sb,
      });
      expect(result).toBeNull();
    });

    it('returns null on DB insert error', async () => {
      const sb = mockSupabase({ insertError: { message: 'DB error' } });
      const result = await checkMetricDeviation({
        ventureId: 'v1', metricType: 'mrr', actual: 500, target: 1000, supabase: sb,
      });
      expect(result).toBeNull();
    });
  });
});
