// SD-LEO-FEAT-FORECAST-LEDGER-001 — FR-5 advisory-weight attach: positive render + fail-soft +
// stage surface. Fully mocked (no '@supabase/supabase-js' import).
import { describe, it, expect } from 'vitest';
import { attachForecasts, isAttachStage, FORECAST_ATTACH_STAGES } from '../../../lib/forecasting/gate-attach.js';

function fakeSupabase(rows = []) {
  function builder() {
    const filters = [];
    const exec = () => Promise.resolve({ data: rows.filter((r) => filters.every(([c, v]) => r[c] === v)), error: null });
    const b = { select: () => b, eq: (c, v) => { filters.push([c, v]); return b; }, then: (res, rej) => exec().then(res, rej) };
    return b;
  }
  return { from: () => builder() };
}

describe('attachForecasts — FR-5 positive attach', () => {
  it('renders an advisory-weight line for a resolved forecast at S5', async () => {
    const sb = fakeSupabase([{ id: 'f1', question: 'Will X pass S5?', p: 0.7, status: 'resolved', resolved_outcome: true, brier_score: 0.09, question_class: 'kill-gate' }]);
    const { lines, weight } = await attachForecasts({ supabase: sb }, { stage: 5, questionClass: 'kill-gate' });
    expect(weight).toBe('advisory');
    expect(lines).toHaveLength(1);
    expect(lines[0].weight).toBe('advisory');
    expect(lines[0].text).toMatch(/\[advisory\]/);
    expect(lines[0].text).toMatch(/P=0\.7/);
    expect(lines[0].text).toMatch(/Brier=0\.09/);
  });

  it('renders an "(open)" line for an unresolved forecast', async () => {
    const sb = fakeSupabase([{ id: 'f2', question: 'q', p: 0.6, status: 'open', resolved_outcome: null, brier_score: null, question_class: 'kill-gate' }]);
    const { lines } = await attachForecasts({ supabase: sb }, { stage: 3 });
    expect(lines[0].text).toMatch(/\(open\)/);
  });

  it('non-attach stage returns no lines (does not even query)', async () => {
    const sb = fakeSupabase([{ id: 'f1', question: 'q', p: 0.5, status: 'open', question_class: 'kill-gate' }]);
    const { lines } = await attachForecasts({ supabase: sb }, { stage: 7 });
    expect(lines).toEqual([]);
  });

  it('fail-soft: table absent -> {inert:true, lines:[]} (TS-6), never throws', async () => {
    const absent = { from: () => ({ select() { return this; }, eq() { return this; }, then(res) { return res({ data: null, error: { code: '42P01', message: 'relation "forecast_ledger" does not exist' } }); } }) };
    const res = await attachForecasts({ supabase: absent }, { stage: 5 });
    expect(res.inert).toBe(true);
    expect(res.lines).toEqual([]);
  });

  it('attach surface is S3/S5/S16, DISTINCT from the legacy KILL_GATE_STAGES correlation set', () => {
    expect(FORECAST_ATTACH_STAGES).toEqual([3, 5, 16]);
    expect(isAttachStage(3)).toBe(true);
    expect(isAttachStage(5)).toBe(true);
    expect(isAttachStage(16)).toBe(true);
    expect(isAttachStage(13)).toBe(false); // legacy correlation stage — intentionally NOT attached
  });
});
