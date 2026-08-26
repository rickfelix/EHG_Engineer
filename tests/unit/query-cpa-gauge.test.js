/**
 * SD-LEO-GEN-NEED-ABLE-CONTINUALLY-001 FR-3/TS-6 — the ad-hoc, per-channel CPA query script.
 *
 * Tests the exported function directly (not subprocess spawning), matching the precedent set by
 * tests/unit/venture-telemetry-pull.test.js.
 */
import { describe, it, expect } from 'vitest';
import { queryCpaGaugeForChannel } from '../../scripts/cpa-gauge-cli.mjs';

function fakeSupabase(dailyRollupRows, error = null) {
  return {
    from(table) {
      if (table !== 'daily_rollups') throw new Error(`unexpected table ${table}`);
      const payload = { data: dailyRollupRows, error };
      // queryCpaGaugeForChannel reads via fetchAllPaginated, which calls .range(from, to) per
      // page -- full payload on the first page, empty page thereafter to terminate the loop.
      const b = { range: async (from) => (from === 0 ? payload : { data: [], error }) };
      for (const m of ['select', 'eq', 'gte']) b[m] = () => b;
      return b;
    },
  };
}

describe('FR-3: queryCpaGaugeForChannel is scoped to one venture+platform, never fabricates a number', () => {
  it('TS-6: returns a real CPA number for a venture/platform with spend and conversions', async () => {
    const result = await queryCpaGaugeForChannel({
      supabase: fakeSupabase([{ spend_cents: 10000, conversions: 20 }]),
      ventureId: 'v-1',
      platform: 'facebook',
    });
    expect(result.venture_id).toBe('v-1');
    expect(result.platform).toBe('facebook');
    expect(result.state).toBe('live');
    expect(result.value_cents_per_conversion).toBe(500);
  });

  it('returns no_writer_yet for a venture/platform with zero rows', async () => {
    const result = await queryCpaGaugeForChannel({
      supabase: fakeSupabase([]),
      ventureId: 'v-1',
      platform: 'google',
    });
    expect(result.state).toBe('no_writer_yet');
    expect(result.value_cents_per_conversion).toBeNull();
  });

  it('fails closed (no_writer_yet, never a throw) on a query error', async () => {
    const result = await queryCpaGaugeForChannel({
      supabase: fakeSupabase(null, { message: 'connection reset' }),
      ventureId: 'v-1',
      platform: 'google',
    });
    expect(result.state).toBe('no_writer_yet');
    expect(result.reason).toMatch(/connection reset/);
  });
});
