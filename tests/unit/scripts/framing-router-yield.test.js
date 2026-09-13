/**
 * QF-20260912-514 (FIX SHAPE c) — scripts/framing-router-yield.mjs: the injectable-supabase
 * query wrapper around lib/governance/fw3-framing-yield.cjs's pure tally.
 */
import { describe, it, expect } from 'vitest';
import { computeWeeklyFramingYield } from '../../../scripts/framing-router-yield.mjs';

function makeSupabase(rows, error = null) {
  const calls = [];
  const chain = {
    select: (...a) => { calls.push(['select', ...a]); return chain; },
    eq: (...a) => { calls.push(['eq', ...a]); return chain; },
    gte: (...a) => { calls.push(['gte', ...a]); return chain; },
    limit: (...a) => { calls.push(['limit', ...a]); return Promise.resolve({ data: rows, error }); },
  };
  return { supabase: { from: () => chain }, calls };
}

describe('computeWeeklyFramingYield', () => {
  it('queries session_coordination for oracle rows since the trailing window and tallies them', async () => {
    const rows = [
      { payload: { oracle: true, framing_class: 'instrument' } },
      { payload: { oracle: true, framing_class: 'pick' } },
      { payload: { oracle: true } },
    ];
    const { supabase, calls } = makeSupabase(rows);
    const now = new Date('2026-09-13T00:00:00Z');
    const result = await computeWeeklyFramingYield(supabase, { now });
    expect(result.available).toBe(true);
    expect(result.counts).toEqual({ instrument: 1, pick: 1, unclassified: 1 });
    expect(result.line).toBe('[framing-router-yield] trailing 7d: stamped instrument 1 / stamped pick 1 / unclassified 1');
    const gteCall = calls.find((c) => c[0] === 'gte');
    expect(gteCall[2]).toBe('2026-09-06T00:00:00.000Z'); // now - 7 days
  });

  it('reports unavailable (never throws) on a query error', async () => {
    const { supabase } = makeSupabase(null, { message: 'boom' });
    const result = await computeWeeklyFramingYield(supabase);
    expect(result).toEqual({ available: false, reason: 'boom' });
  });
});
