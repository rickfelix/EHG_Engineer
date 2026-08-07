/**
 * The canonical evidence reader must THROW where the hand-rolled query returned a false zero.
 * QF-20260804-048.
 *
 * THE DEFECT BEING PREVENTED: sub_agent_execution_results.sd_id is a UUID; every worker reasons in
 * sd_key; PostgREST returns EMPTY WITH NO ERROR when you filter the uuid column with a key string.
 * Two workers hand-rolled that query on the same night and both acted on the false zero — one
 * reported "blocker UNCHANGED" for ~50 minutes while a real FAIL row sat invisible, the other
 * declared his SD "provably cannot advance" and asked to be re-routed off it, minutes before the
 * gate passed at 94 with the evidence green all along.
 *
 * SO THE ASSERTION THAT MATTERS IS NOT "it returns the right rows" — it is that an UNANSWERABLE
 * question RAISES instead of resolving to zero. A helper that returned [] for a typo would just
 * relocate the defect behind a friendlier name.
 */

import { describe, it, expect, vi } from 'vitest';
import { resolveSdId, getEvidence, hasEvidenceFor, ACCEPTED_VERDICTS } from '../../../lib/sub-agents/evidence-status.js';

const UUID = '7a269865-5b22-4dff-95f8-1fbd95645d8b';
const KEY = 'SD-LEO-INFRA-COORDINATION-LANE-DRAIN-001';

/**
 * Supabase fake that mimics the REAL failure: a filter that does not match returns
 * { data: null/[] , error: null } — empty, with NO error.
 */
function fakeDb({ sd = null, rows = [] } = {}) {
  const calls = { sdFilters: [], evidenceFilters: [] };
  return {
    __calls: calls,
    from(table) {
      const q = {
        _table: table,
        select() { return q; },
        order() { return q; },
        eq(col, val) {
          if (table === 'strategic_directives_v2') calls.sdFilters.push([col, val]);
          else calls.evidenceFilters.push([col, val]);
          q._eq = q._eq || []; q._eq.push([col, val]);
          return q;
        },
        gte() { return q; },
        maybeSingle() {
          // Only resolve when the filter matches how the fake SD is addressed.
          const match = (q._eq || []).some(([c, v]) => sd && ((c === 'id' && v === sd.id) || (c === 'sd_key' && v === sd.sd_key)));
          return Promise.resolve({ data: match ? { id: sd.id } : null, error: null });
        },
        then(res) { return Promise.resolve({ data: rows, error: null }).then(res); }
      };
      return q;
    }
  };
}

const SD = { id: UUID, sd_key: KEY };

describe('resolveSdId — an unanswerable question RAISES, never resolves to empty', () => {
  it('THE POINT: an unknown key THROWS rather than yielding an empty evidence set', async () => {
    const db = fakeDb({ sd: SD });
    await expect(resolveSdId('SD-DOES-NOT-EXIST-001', { supabase: db })).rejects.toThrow(/no strategic directive matches/i);
  });

  it('a uuid that does not exist ALSO throws — a stale id must not masquerade as "no evidence"', async () => {
    const db = fakeDb({ sd: SD });
    await expect(resolveSdId('00000000-0000-4000-8000-000000000000', { supabase: db })).rejects.toThrow(/no strategic directive matches/i);
  });

  it.each([[''], ['   '], [null], [undefined], [42], [{}]])('rejects a non-string / blank input (%s)', async (bad) => {
    await expect(resolveSdId(bad, { supabase: fakeDb({ sd: SD }) })).rejects.toThrow(/sd_key or sd id is required/i);
  });

  it('resolves a KEY to the uuid — the translation every caller was hand-rolling', async () => {
    const db = fakeDb({ sd: SD });
    await expect(resolveSdId(KEY, { supabase: db })).resolves.toBe(UUID);
    expect(db.__calls.sdFilters).toContainEqual(['sd_key', KEY]);
  });

  it('accepts a uuid unchanged, looked up by id', async () => {
    const db = fakeDb({ sd: SD });
    await expect(resolveSdId(UUID, { supabase: db })).resolves.toBe(UUID);
    expect(db.__calls.sdFilters).toContainEqual(['id', UUID]);
  });
});

describe('getEvidence — the uuid column is never filtered with a key', () => {
  it('filters sd_id with the resolved UUID even when handed a KEY', async () => {
    // This is the exact mistake that produced the false zeros: .eq('sd_id', '<KEY>').
    const db = fakeDb({ sd: SD, rows: [{ id: 'r1', sub_agent_code: 'TESTING', verdict: 'PASS', created_at: new Date().toISOString() }] });
    const out = await getEvidence(KEY, { supabase: db });
    expect(out.sdId).toBe(UUID);
    expect(db.__calls.evidenceFilters).toContainEqual(['sd_id', UUID]);
    expect(db.__calls.evidenceFilters.find(([c, v]) => c === 'sd_id' && v === KEY)).toBeUndefined();
  });

  it('keys byCode on the LATEST row per code (rows arrive newest-first)', async () => {
    const rows = [
      { id: 'new', sub_agent_code: 'TESTING', verdict: 'PASS', created_at: '2026-08-07T12:00:00Z' },
      { id: 'old', sub_agent_code: 'TESTING', verdict: 'FAIL', created_at: '2026-08-01T12:00:00Z' }
    ];
    const out = await getEvidence(KEY, { supabase: fakeDb({ sd: SD, rows }) });
    expect(out.byCode.TESTING.id).toBe('new');
  });

  it('an unresolvable SD throws BEFORE any evidence query runs', async () => {
    const db = fakeDb({ sd: SD, rows: [] });
    await expect(getEvidence('SD-NOPE-001', { supabase: db })).rejects.toThrow();
    expect(db.__calls.evidenceFilters).toEqual([]);
  });
});

describe('hasEvidenceFor', () => {
  const row = (code, verdict) => ({ id: code, sub_agent_code: code, verdict, created_at: '2026-08-07T12:00:00Z' });

  it('satisfied when every required code has an accepted verdict', async () => {
    const db = fakeDb({ sd: SD, rows: [row('TESTING', 'PASS'), row('SECURITY', 'CONDITIONAL_PASS')] });
    const out = await hasEvidenceFor(KEY, ['TESTING', 'SECURITY'], { supabase: db });
    expect(out).toMatchObject({ satisfied: true, missing: [], rejected: [] });
  });

  it('reports MISSING and REJECTED separately — they need different remedies', async () => {
    // Blending them is how "run the agent again" gets applied to a code that ran and FAILED.
    const db = fakeDb({ sd: SD, rows: [row('TESTING', 'FAIL')] });
    const out = await hasEvidenceFor(KEY, ['TESTING', 'SECURITY'], { supabase: db });
    expect(out.satisfied).toBe(false);
    expect(out.missing).toEqual(['SECURITY']);
    expect(out.rejected).toEqual([{ code: 'TESTING', verdict: 'FAIL', id: 'TESTING' }]);
  });

  it('is case-insensitive on the code, so "Explore" and "EXPLORE" are one requirement', async () => {
    const db = fakeDb({ sd: SD, rows: [row('Explore', 'PASS')] });
    await expect(hasEvidenceFor(KEY, ['explore'], { supabase: db })).resolves.toMatchObject({ satisfied: true });
  });

  it('REFUSES an empty requirement list rather than reporting trivially satisfied', async () => {
    // "satisfied: true because nothing was required" is a green light that measured nothing.
    await expect(hasEvidenceFor(KEY, [], { supabase: fakeDb({ sd: SD }) })).rejects.toThrow(/non-empty array/i);
  });

  it('CONDITIONAL_PASS and WARNING count as accepted, matching the gate', async () => {
    expect(ACCEPTED_VERDICTS).toEqual(['PASS', 'CONDITIONAL_PASS', 'WARNING']);
  });
});

describe('CONTROL — the fake reproduces the real failure it is guarding against', () => {
  it('a mismatched filter returns EMPTY WITH NO ERROR (the silent-zero shape)', async () => {
    // If the fake errored on a mismatch it would be easier than reality, and these tests would
    // prove nothing about the defect. Here the wrong filter yields null + no error, exactly as
    // PostgREST does — which is why the hand-rolled query could never report its own failure.
    const db = fakeDb({ sd: SD });
    const res = await db.from('strategic_directives_v2').select('id').eq('sd_key', 'SD-WRONG-001').maybeSingle();
    expect(res.error).toBeNull();
    expect(res.data).toBeNull();
  });
});
