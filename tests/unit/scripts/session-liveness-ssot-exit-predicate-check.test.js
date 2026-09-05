/**
 * SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-E FR-4 / TS-6 / TS-7 -- the corrected, satisfiable exit
 * predicate: status IN ('released','stale') AND is_alive=true, measured via {count:'exact',
 * head:true} rather than data.length off a capped SELECT (this environment's measured db-max-rows
 * cap truncates a plain .limit(5000) SELECT at 1000 actual rows).
 */
import { describe, it, expect } from 'vitest';
import { checkLivenessSsotExitPredicate } from '../../../scripts/session-liveness-ssot-exit-predicate-check.mjs';

/**
 * @param {{count: number, sample: object[], countError?: object, sampleError?: object}} opts
 */
function makeSupabase({ count, sample, countError = null, sampleError = null }) {
  const calls = [];
  return {
    calls,
    from(table) {
      calls.push({ table });
      return {
        select(cols, selectOpts) {
          const isHead = Boolean(selectOpts && selectOpts.head);
          calls.push({ select: cols, opts: selectOpts });
          const builder = {
            in(col, vals) { calls.push({ in: [col, vals] }); return builder; },
            eq(col, val) { calls.push({ eq: [col, val] }); return builder; },
            limit(n) { calls.push({ limit: n }); return builder; },
            then(resolve, reject) {
              const result = isHead
                ? { count: countError ? null : count, data: null, error: countError }
                : { data: sampleError ? null : sample, error: sampleError };
              return Promise.resolve(result).then(resolve, reject);
            },
          };
          return builder;
        },
      };
    },
  };
}

describe('checkLivenessSsotExitPredicate', () => {
  it('TS-6: reports the real pre-backfill violation count (~2,104), not a capped data.length', async () => {
    const sample = Array.from({ length: 10 }, (_, i) => ({
      session_id: `dead-${i}`, status: 'released', is_alive: true, released_at: '2026-09-01T00:00:00Z', stale_at: null, released_reason: 'AUTO_REPLACED',
    }));
    const supabase = makeSupabase({ count: 2104, sample });
    const result = await checkLivenessSsotExitPredicate(supabase);
    expect(result.count).toBe(2104);
    expect(result.sample).toHaveLength(10);
  });

  it('TS-7: reports zero after the backfill + FR-1 writers are live', async () => {
    const supabase = makeSupabase({ count: 0, sample: [] });
    const result = await checkLivenessSsotExitPredicate(supabase);
    expect(result.count).toBe(0);
    expect(result.sample).toEqual([]);
  });

  it('uses {count:"exact", head:true} for the authoritative count, not data.length', async () => {
    const supabase = makeSupabase({ count: 5, sample: [] });
    await checkLivenessSsotExitPredicate(supabase);
    const countSelectCall = supabase.calls.find((c) => c.opts && c.opts.head);
    expect(countSelectCall).toBeTruthy();
    expect(countSelectCall.opts).toEqual({ count: 'exact', head: true });
  });

  it('filters on status IN (released, stale) AND is_alive=true', async () => {
    const supabase = makeSupabase({ count: 1, sample: [] });
    await checkLivenessSsotExitPredicate(supabase);
    const inCall = supabase.calls.find((c) => c.in);
    expect(inCall.in).toEqual(['status', ['released', 'stale']]);
    const eqCalls = supabase.calls.filter((c) => c.eq);
    expect(eqCalls.some((c) => c.eq[0] === 'is_alive' && c.eq[1] === true)).toBe(true);
  });

  it('throws if the count query errors, rather than silently reporting zero', async () => {
    const supabase = makeSupabase({ count: 0, sample: [], countError: { message: 'timeout' } });
    await expect(checkLivenessSsotExitPredicate(supabase)).rejects.toThrow(/count query failed/);
  });

  it('respects a custom sampleLimit', async () => {
    const supabase = makeSupabase({ count: 3, sample: [{ session_id: 'a' }] });
    await checkLivenessSsotExitPredicate(supabase, { sampleLimit: 3 });
    const limitCall = supabase.calls.find((c) => c.limit !== undefined);
    expect(limitCall.limit).toBe(3);
  });
});
