/**
 * QF-20260911-404: seed-test for scripts/lint/self-score-gauge-writer-lint.mjs.
 * Uses a fully mocked supabase client (no live DB connection, no side effects) since
 * checkSelfScoreGaugeWriters() is a pure query-and-classify function over the REAL,
 * imported GAUGE_REGISTRY -- as shipped, adam_self_score_age and solomon_self_score_age
 * are enabled:true, coordinator_self_score_age is enabled:false (see that entry's own
 * comment in lib/governance/gauge-registry.js for why).
 */
import { describe, it, expect } from 'vitest';
import { checkSelfScoreGaugeWriters } from '../../../scripts/lint/self-score-gauge-writer-lint.mjs';

function fakeSupabase(rowsByCategory) {
  return {
    from: () => ({
      select: () => ({
        eq: (_col, category) => ({
          order: () => ({
            limit: () => Promise.resolve({ data: rowsByCategory[category] || [], error: null }),
          }),
        }),
      }),
    }),
  };
}

describe('checkSelfScoreGaugeWriters', () => {
  it('reports no violations when both enabled gauges have fresh writers', async () => {
    const fresh = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    const supabase = fakeSupabase({
      adam_self_assessment: [{ created_at: fresh }],
      solomon_self_assessment: [{ created_at: fresh }],
      coordinator_self_assessment: [], // disabled gauge -- must be skipped regardless of writer state
    });
    const violations = await checkSelfScoreGaugeWriters(supabase);
    expect(violations).toEqual([]);
  });

  it('flags an enabled gauge whose writer has gone silent for >30 days', async () => {
    const stale = new Date(Date.now() - 33 * 24 * 3600 * 1000).toISOString();
    const fresh = new Date().toISOString();
    const supabase = fakeSupabase({
      adam_self_assessment: [{ created_at: stale }],
      solomon_self_assessment: [{ created_at: fresh }],
      coordinator_self_assessment: [],
    });
    const violations = await checkSelfScoreGaugeWriters(supabase);
    expect(violations).toHaveLength(1);
    expect(violations[0].id).toBe('adam_self_score_age');
    expect(violations[0].reason).toMatch(/silent >30d/);
  });

  it('flags an enabled gauge whose writer has never produced a row', async () => {
    const fresh = new Date().toISOString();
    const supabase = fakeSupabase({
      adam_self_assessment: [], // never fired
      solomon_self_assessment: [{ created_at: fresh }],
      coordinator_self_assessment: [],
    });
    const violations = await checkSelfScoreGaugeWriters(supabase);
    expect(violations).toHaveLength(1);
    expect(violations[0].id).toBe('adam_self_score_age');
    expect(violations[0].reason).toBe('writer has never produced a row');
  });

  it('never reports coordinator_self_score_age -- it stays disabled by design', async () => {
    // Even a stale/absent coordinator writer must NOT be flagged while the gauge is disabled;
    // the whole point of leaving it disabled is that its silence carries no consequence yet.
    const fresh = new Date().toISOString();
    const supabase = fakeSupabase({
      adam_self_assessment: [{ created_at: fresh }],
      solomon_self_assessment: [{ created_at: fresh }],
      coordinator_self_assessment: [],
    });
    const violations = await checkSelfScoreGaugeWriters(supabase);
    expect(violations.find((v) => v.id === 'coordinator_self_score_age')).toBeUndefined();
  });
});
