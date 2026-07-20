// SD-LEO-FEAT-FORECAST-LEDGER-001 — FR-8: TruthLayer.computeCalibration() revival. Proves the
// dead 'const predictions=[]' stub now reads RESOLVED forecasts from the Forecast Ledger via the
// shared brier module, and remains fail-soft. Fully mocked (no '@supabase/supabase-js' import).
import { describe, it, expect } from 'vitest';
import { TruthLayer } from '../../../lib/agents/venture-ceo/truth-layer.js';

function fakeSupabase({ rows = [], absent = false } = {}) {
  function builder() {
    const filters = [];
    const exec = () => absent
      ? Promise.resolve({ data: null, error: { code: '42P01', message: 'relation "forecast_ledger" does not exist' } })
      : Promise.resolve({ data: rows.filter((r) => filters.every(([c, v]) => r[c] === v)), error: null });
    const b = {
      select: () => b,
      eq: (c, v) => { filters.push([c, v]); return b; },
      gte: () => b, // resolved_at range — seeded rows are all in-range, ignore in mock
      order: () => b, // FR-6: fetchAllPaginated appends .order('id') for stable page boundaries
      range: () => exec(), // FR-6: fetchAllPaginated pages via .range(); one mock page = all rows
      then: (res, rej) => exec().then(res, rej),
    };
    return b;
  }
  return { from: () => builder() };
}

describe('TruthLayer.computeCalibration revival (FR-8)', () => {
  it('reads RESOLVED forecasts from the ledger — no longer the empty stub', async () => {
    const rows = [
      { p: 0.7, resolved_outcome: true, question_class: 'kill-gate', status: 'resolved', resolved_at: '2026-07-19' },  // correct
      { p: 0.2, resolved_outcome: false, question_class: 'kill-gate', status: 'resolved', resolved_at: '2026-07-19' }, // correct
      { p: 0.8, resolved_outcome: false, question_class: 'market', status: 'resolved', resolved_at: '2026-07-19' },    // wrong
    ];
    const tl = new TruthLayer(fakeSupabase({ rows }), 'agent-1', 'venture-1');
    const cal = await tl.computeCalibration('all');
    expect(cal.total_predictions).toBe(3);
    expect(cal.brier_score).not.toBeNull();
    expect(cal.accuracy).toBeCloseTo(2 / 3);       // 2 of 3 directionally correct
    expect(cal.by_type['kill-gate'].total).toBe(2);
    expect(cal.by_type.market.total).toBe(1);
  });

  it('fail-soft: table absent -> empty-shape return, never throws', async () => {
    const tl = new TruthLayer(fakeSupabase({ absent: true }), 'agent-1', 'venture-1');
    const cal = await tl.computeCalibration('all');
    expect(cal.total_predictions).toBe(0);
    expect(cal.brier_score).toBeNull();
    expect(cal.by_type).toEqual({});
  });
});
