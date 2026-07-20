// SD-LEO-FEAT-FORECAST-LEDGER-001 — ledger service (FR-2/3/7). FULLY MOCKED: an in-memory fake
// supabase, no '@supabase/supabase-js' import (so audit-db-test-guards does not flag it) and no
// live table (the migration is chairman-gated).
import { describe, it, expect } from 'vitest';
import { register, resolve, calibration, tableAbsent } from '../../../lib/forecasting/ledger.js';

// Chainable in-memory fake supabase covering the exact call shapes ledger.js uses:
//   from().insert().select().single(); from().select('*').eq().single();
//   from().update().eq().select().single(); from().select(cols).eq().eq()  (thenable)
function makeFakeSupabase({ absent = false } = {}) {
  const store = { forecast_ledger: [] };
  let idc = 0;
  const ABSENT = { data: null, error: { code: '42P01', message: 'relation "forecast_ledger" does not exist' } };
  function builder(table) {
    let op = null, payload = null; const filters = []; let wantSingle = false;
    async function exec() {
      if (absent) return ABSENT;
      const rows = store[table] || (store[table] = []);
      const match = (r) => filters.every(([c, v]) => r[c] === v);
      if (op === 'insert') {
        const row = { id: 'f' + (++idc), brier_score: null, resolved_outcome: null, resolved_by: null, resolved_at: null, registered_at: 'now', ...payload };
        rows.push(row);
        return { data: wantSingle ? row : [row], error: null };
      }
      if (op === 'update') {
        const target = rows.filter(match);
        target.forEach((r) => Object.assign(r, payload));
        return { data: wantSingle ? (target[0] || null) : target, error: null };
      }
      const sel = rows.filter(match);
      return { data: wantSingle ? (sel[0] || null) : sel, error: null };
    }
    const b = {
      insert(row) { op = 'insert'; payload = row; return b; },
      update(row) { op = 'update'; payload = row; return b; },
      select() { if (!op) op = 'select'; return b; },
      eq(c, v) { filters.push([c, v]); return b; },
      single() { wantSingle = true; return b; },
      // FR-6 batch 8: calibration() now paginates via fetchAllPaginated (.order + .range)
      order() { return b; },
      range(from, to) { return exec().then((r) => ({ data: Array.isArray(r.data) ? r.data.slice(from, to + 1) : r.data, error: r.error })); },
      then(res, rej) { return exec().then(res, rej); },
    };
    return b;
  }
  return { from: (t) => builder(t) };
}

describe('register (FR-2 sealed pre-registration)', () => {
  it('creates an open row with NULL brier + provenance', async () => {
    const sb = makeFakeSupabase();
    const { row } = await register({ supabase: sb }, { question: 'Will X pass S5?', questionClass: 'kill-gate', p: 0.7, resolutionCriteria: 'S5 verdict=PASS', registeredBy: 'bravo' });
    expect(row.status).toBe('open');
    expect(row.brier_score).toBeNull();
    expect(row.p).toBe(0.7);
    expect(row.registered_by).toBe('bravo');
  });
  it('rejects p outside [0,1]', async () => {
    const sb = makeFakeSupabase();
    await expect(register({ supabase: sb }, { question: 'q', questionClass: 'c', p: 1.4, resolutionCriteria: 'r' })).rejects.toThrow(/\[0,1\]/);
  });
  it('fail-soft when the table is absent -> {inert:true}, never throws (TS-6/FR-1)', async () => {
    const sb = makeFakeSupabase({ absent: true });
    const res = await register({ supabase: sb }, { question: 'q', questionClass: 'c', p: 0.5, resolutionCriteria: 'r' });
    expect(res.inert).toBe(true);
  });
});

describe('resolve (FR-3 outcome + provenance + Brier)', () => {
  it('stamps outcome/provenance and computes float-safe Brier=0.09 for p=0.7/true', async () => {
    const sb = makeFakeSupabase();
    const { row } = await register({ supabase: sb }, { question: 'q', questionClass: 'c', p: 0.7, resolutionCriteria: 'r' });
    const out = await resolve({ supabase: sb }, { id: row.id, outcome: true, resolvedBy: 'bravo' });
    expect(out.brier_score).toBe(0.09); // round3 kills the 0.09000000000000002 hazard
    expect(out.row.status).toBe('resolved');
    expect(out.row.resolved_outcome).toBe(true);
    expect(out.row.resolved_by).toBe('bravo');
    expect(out.row.resolved_at).toBeTruthy();
  });
  it('rejects re-resolving a resolved row (service-layer seal, mirrors DB trigger)', async () => {
    const sb = makeFakeSupabase();
    const { row } = await register({ supabase: sb }, { question: 'q', questionClass: 'c', p: 0.4, resolutionCriteria: 'r' });
    await resolve({ supabase: sb }, { id: row.id, outcome: false });
    await expect(resolve({ supabase: sb }, { id: row.id, outcome: true })).rejects.toThrow(/already resolved/);
  });
  it('fail-soft when table absent', async () => {
    const sb = makeFakeSupabase({ absent: true });
    expect((await resolve({ supabase: sb }, { id: 'x', outcome: true })).inert).toBe(true);
  });
});

describe('calibration rollup (FR-7 — read only, never graduates)', () => {
  it('Brier by question_class over resolved forecasts; weight stays advisory', async () => {
    const sb = makeFakeSupabase();
    const a = await register({ supabase: sb }, { question: 'q1', questionClass: 'kill-gate', p: 0.7, resolutionCriteria: 'r' });
    const b = await register({ supabase: sb }, { question: 'q2', questionClass: 'kill-gate', p: 0.2, resolutionCriteria: 'r' });
    await resolve({ supabase: sb }, { id: a.row.id, outcome: true });  // 0.09
    await resolve({ supabase: sb }, { id: b.row.id, outcome: false }); // 0.04
    const { rollup } = await calibration({ supabase: sb }, { questionClass: 'kill-gate' });
    expect(rollup['kill-gate'].count).toBe(2);
    expect(rollup['kill-gate'].mean_brier).toBeCloseTo((0.09 + 0.04) / 2);
    expect(rollup['kill-gate'].weight).toBe('advisory');
  });
  it('fail-soft when table absent', async () => {
    const res = await calibration({ supabase: makeFakeSupabase({ absent: true }) });
    expect(res.inert).toBe(true);
    expect(res.rollup).toEqual({});
  });
});

describe('tableAbsent detection', () => {
  it('recognizes 42P01 / PGRST205 / message; false otherwise', () => {
    expect(tableAbsent({ code: '42P01' })).toBe(true);
    expect(tableAbsent({ code: 'PGRST205' })).toBe(true);
    expect(tableAbsent({ message: 'relation "forecast_ledger" does not exist' })).toBe(true);
    expect(tableAbsent({ code: '23505', message: 'dup' })).toBe(false);
    expect(tableAbsent(null)).toBe(false);
  });
});
