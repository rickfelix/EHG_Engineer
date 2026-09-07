/**
 * QF-20260905-256: retention-enforce.js's count query on eva_scheduler_metrics (4.5M rows, no
 * index on created_at) crosses the PostgREST statement timeout and returns a fully-empty error
 * object -- reproduced live as `{count: null, error: {message: ""}}`, ~8.5s. Before this fix,
 * ANY count error threw ("count failed: ..."), so a real TIMEOUT read as a hard job failure and
 * never reached the apply step, even on days rows genuinely were eligible.
 *
 * Fix: a count error whose signature IS the reproduced timeout shape (message === '' and no
 * code/details -- present-but-empty, not merely absent, so an unrelated error object that just
 * lacks a .message property still throws normally) falls back to a bounded existence probe
 * (SELECT id ... LIMIT 1, cheap even with no index since it stops at the first match) instead
 * of failing the run.
 */
import { describe, it, expect } from 'vitest';
import { enforcePolicy } from '../../../scripts/retention-enforce.js';

const policy = { table: 'eva_scheduler_metrics', timestampColumn: 'created_at', hotDays: 90, mode: 'archive', perRunCap: 200000 };

/** Sequenced mock: call 1 = count (throws the empty-error timeout shape or given error/count),
 *  call 2 = probe (SELECT id ... LIMIT 1), call 3 = size-estimate (unfiltered estimated count). */
function mockSequenced({ countError, probeRows, probeError, sizeEstimate = 4497033 }) {
  let call = 0;
  return {
    from: () => {
      call += 1;
      const thisCall = call;
      const chain = {
        select: () => chain,
        lt: () => chain,
        limit: () => {
          if (thisCall === 2) return Promise.resolve({ data: probeError ? null : probeRows, error: probeError || null });
          return chain;
        },
        // count() await-resolution point for calls 1 and 3 (both end without .limit()).
        then: (resolve) => {
          if (thisCall === 1) return resolve({ count: null, error: countError });
          if (thisCall === 3) return resolve({ count: sizeEstimate, error: null });
          return resolve({ count: null, error: null });
        },
      };
      return chain;
    },
  };
}

describe('retention-enforce count TIMEOUT → probe fallback (QF-20260905-256)', () => {
  it('the reproduced timeout shape ({message:""}, no code/details) falls back to the probe instead of throwing', async () => {
    const supabase = mockSequenced({ countError: { message: '' }, probeRows: [{ id: 'abc' }] });
    const r = await enforcePolicy(supabase, policy, { apply: false, env: {} });
    expect(r.error).toBeNull();
    expect(r.probed).toBe(true);
    expect(r.eligible).toBe(1);
  });

  it('probe finds nothing → eligible=0, dry-run returns cleanly (no false-positive eligibility)', async () => {
    const supabase = mockSequenced({ countError: { message: '' }, probeRows: [] });
    const r = await enforcePolicy(supabase, policy, { apply: false, env: {} });
    expect(r.error).toBeNull();
    expect(r.probed).toBe(true);
    expect(r.eligible).toBe(0);
  });

  it('an unrelated error object with no .message property (not the timeout shape) still throws normally', async () => {
    const supabase = mockSequenced({ countError: { unexpected: 'shape' } });
    const r = await enforcePolicy(supabase, policy, { apply: false, env: {} });
    expect(r.error).toMatch(/count failed/);
    expect(r.probed).toBeUndefined();
  });

  it('a real, non-empty error message still throws normally (unaffected by this fix)', async () => {
    const supabase = mockSequenced({ countError: { message: 'connection refused' } });
    const r = await enforcePolicy(supabase, policy, { apply: false, env: {} });
    expect(r.error).toMatch(/connection refused/);
  });

  it('fail-safe: if the probe ITSELF errors, the run still throws (never silently reports 0 eligible)', async () => {
    const supabase = mockSequenced({ countError: { message: '' }, probeError: { message: 'probe also timed out' } });
    const r = await enforcePolicy(supabase, policy, { apply: false, env: {} });
    expect(r.error).toMatch(/probe also failed/);
    expect(r.error).toMatch(/probe also timed out/);
  });
});
