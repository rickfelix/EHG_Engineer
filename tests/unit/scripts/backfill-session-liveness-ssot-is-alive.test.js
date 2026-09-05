/**
 * SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-E FR-5 -- the count-delta backfill loop.
 *
 * The fake supabase below simulates a live population and an UPDATE that may be CAP-BOUND (affects
 * at most `updateCap` rows per call, mirroring this environment's measured db-max-rows cap) so the
 * loop's correctness under a capped write -- not just a capped SELECT -- is actually exercised.
 */
import { describe, it, expect } from 'vitest';
import { runLivenessSsotBackfill } from '../../../scripts/backfill-session-liveness-ssot-is-alive.mjs';

/**
 * @param {{ violatingCount: number, updateCap?: number|null }} opts
 *   updateCap: null = UPDATE affects everything matching in one call (uncapped).
 *              a number = UPDATE affects at most that many matching rows per call (capped).
 */
function makeSupabase({ violatingCount, updateCap = null, updateError = null }) {
  let remaining = violatingCount;
  const updateCalls = [];
  return {
    updateCalls,
    from(table) {
      return {
        select(cols, opts) {
          if (opts && opts.head) {
            return { in: () => ({ eq: () => Promise.resolve({ count: remaining, data: null, error: null }) }) };
          }
          return { in: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
        },
        update(patch) {
          updateCalls.push(patch);
          return {
            in: () => ({
              eq: () => {
                if (updateError) return Promise.resolve({ data: null, error: updateError });
                const affected = updateCap === null ? remaining : Math.min(updateCap, remaining);
                remaining -= affected;
                return Promise.resolve({ data: null, error: null });
              },
            }),
          };
        },
      };
    },
  };
}

describe('runLivenessSsotBackfill', () => {
  it('a dry run counts violations but writes nothing', async () => {
    const supabase = makeSupabase({ violatingCount: 2104 });
    const result = await runLivenessSsotBackfill(supabase, { dryRun: true });
    expect(result.totalAffected).toBe(0);
    expect(result.finalCount).toBe(2104);
    expect(supabase.updateCalls).toHaveLength(0);
  });

  it('an uncapped UPDATE clears the whole population in one pass', async () => {
    const supabase = makeSupabase({ violatingCount: 2104, updateCap: null });
    const result = await runLivenessSsotBackfill(supabase);
    expect(result.totalAffected).toBe(2104);
    expect(result.finalCount).toBe(0);
    expect(result.iterations).toHaveLength(1);
    expect(result.stalled).toBe(false);
  });

  it('a CAP-BOUND UPDATE (this environment measured ~1000/call) loops until the predicate count reaches zero', async () => {
    const supabase = makeSupabase({ violatingCount: 2104, updateCap: 1000 });
    const result = await runLivenessSsotBackfill(supabase);
    expect(result.totalAffected).toBe(2104);
    expect(result.finalCount).toBe(0);
    // 1000 + 1000 + 104 = 3 passes
    expect(result.iterations).toEqual([
      { before: 2104, after: 1104, affected: 1000 },
      { before: 1104, after: 104, affected: 1000 },
      { before: 104, after: 0, affected: 104 },
    ]);
    expect(result.stalled).toBe(false);
  });

  it('IDEMPOTENT: a second run after the first completes affects zero rows via the same count-delta method', async () => {
    const supabase = makeSupabase({ violatingCount: 0 });
    const result = await runLivenessSsotBackfill(supabase);
    expect(result.totalAffected).toBe(0);
    expect(result.finalCount).toBe(0);
    expect(result.iterations).toHaveLength(0);
    expect(supabase.updateCalls).toHaveLength(0);
  });

  it('stalls loudly instead of spinning forever if an UPDATE pass makes zero measurable progress', async () => {
    const supabase = makeSupabase({ violatingCount: 50, updateCap: 0 });
    const result = await runLivenessSsotBackfill(supabase);
    expect(result.stalled).toBe(true);
    expect(result.finalCount).toBe(50);
  });

  it('throws if the UPDATE itself errors, rather than reporting a false affected count', async () => {
    const supabase = makeSupabase({ violatingCount: 10, updateError: { message: 'rls denied' } });
    await expect(runLivenessSsotBackfill(supabase)).rejects.toThrow(/update failed/);
  });

  it('every UPDATE payload sets exactly is_alive:false, nothing else', async () => {
    const supabase = makeSupabase({ violatingCount: 5 });
    await runLivenessSsotBackfill(supabase);
    expect(supabase.updateCalls).toEqual([{ is_alive: false }]);
  });
});
