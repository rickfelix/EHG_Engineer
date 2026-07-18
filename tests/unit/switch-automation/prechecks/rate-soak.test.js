/**
 * SD-LEO-INFRA-INTELLIGENT-SWITCH-AUTOMATION-001-C: PC-5 rate-soak
 */
import { describe, it, expect, vi } from 'vitest';
import { checkRateSoak } from '../../../../lib/switch-automation/prechecks/rate-soak.js';

function fakeSupabase(rows) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          gte: vi.fn(() => ({
            order: vi.fn(async () => ({ data: rows, error: null })),
          })),
        })),
      })),
    })),
  };
}

describe('PC-5: checkRateSoak', () => {
  it('passes with zero prior rows', async () => {
    const supabase = fakeSupabase([]);
    const result = await checkRateSoak(supabase, 'component-x');
    expect(result).toEqual({ id: 'PC-5', name: 'rate-soak', passed: true, reason: 'within-rate-and-soak' });
  });

  it('fails when the rate cap is met (3 rows within 24h, maxPerWindow=3)', async () => {
    const rows = [
      { occurred_at: new Date(Date.now() - 20 * 3_600_000).toISOString() },
      { occurred_at: new Date(Date.now() - 10 * 3_600_000).toISOString() },
      { occurred_at: new Date(Date.now() - 5 * 3_600_000).toISOString() },
    ];
    const supabase = fakeSupabase(rows);
    const result = await checkRateSoak(supabase, 'component-x', { maxPerWindow: 3, minSoakMinutes: 0 });
    expect(result.passed).toBe(false);
    expect(result.reason).toBe('rate-cap-exceeded');
  });

  it('fails when the most recent action is within the soak window', async () => {
    const rows = [{ occurred_at: new Date(Date.now() - 10 * 60_000).toISOString() }];
    const supabase = fakeSupabase(rows);
    const result = await checkRateSoak(supabase, 'component-x', { maxPerWindow: 3, minSoakMinutes: 60 });
    expect(result.passed).toBe(false);
    expect(result.reason).toBe('soak-window-active');
  });

  it('passes when under the rate cap and past the soak window', async () => {
    const rows = [{ occurred_at: new Date(Date.now() - 2 * 3_600_000).toISOString() }];
    const supabase = fakeSupabase(rows);
    const result = await checkRateSoak(supabase, 'component-x', { maxPerWindow: 3, minSoakMinutes: 60 });
    expect(result.passed).toBe(true);
  });
});
