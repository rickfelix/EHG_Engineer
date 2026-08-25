/**
 * SD-LEO-INFRA-STAGE-GATE-PREDICATE-001 (FR-1, FR-2, FR-4, FR-7).
 * Unit tests for the sole stage-gate predicate implementation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { isEnabled } = vi.hoisted(() => ({ isEnabled: vi.fn() }));
vi.mock('../../../lib/feature-flags/evaluator.js', () => ({ isEnabled }));

import {
  checkStageGate,
  shouldEnforceBlock,
  countRecentOverrides,
  OVERRIDE_RATE_WEEKLY_THRESHOLD,
  VERDICT,
} from '../../../lib/governance/stage-gate-predicate.js';

function makeSupabase({ venture = null, ventureError = null, overrideRow = null, overrideError = null, consumeError = null } = {}) {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const overrideEqSpy = vi.fn();
  const consumeUpdateSpy = vi.fn();
  const consumeEqSpy = vi.fn();
  const from = vi.fn((table) => {
    if (table === 'ventures') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => (ventureError ? { data: null, error: ventureError } : { data: venture, error: null }),
          }),
        }),
      };
    }
    if (table === 'chairman_decisions') {
      return {
        select: () => ({
          eq: (col, val) => {
            overrideEqSpy(col, val);
            return {
              eq: (col2, val2) => {
                overrideEqSpy(col2, val2);
                return {
                  eq: (col3, val3) => {
                    overrideEqSpy(col3, val3);
                    return {
                      is: () => ({
                        gt: () => ({
                          limit: () => ({
                            maybeSingle: async () => (overrideError ? { data: null, error: overrideError } : { data: overrideRow, error: null }),
                          }),
                        }),
                      }),
                    };
                  },
                };
              },
            };
          },
        }),
        update: (patch) => {
          consumeUpdateSpy(patch);
          return { eq: (col, val) => { consumeEqSpy(col, val); return Promise.resolve({ error: consumeError }); } };
        },
      };
    }
    if (table === 'audit_log') {
      return { insert };
    }
    throw new Error(`unexpected table: ${table}`);
  });
  return {
    from, _insert: insert, _overrideEqSpy: overrideEqSpy,
    _consumeUpdateSpy: consumeUpdateSpy, _consumeEqSpy: consumeEqSpy,
  };
}

beforeEach(() => {
  isEnabled.mockReset();
  isEnabled.mockResolvedValue(false);
});

describe('checkStageGate — scope rules', () => {
  it('TS-4: null ventureId is out of scope, no audit row, never blocks', async () => {
    const supabase = makeSupabase();
    const r = await checkStageGate({ supabase, ventureId: null, requiredStage: 24, actorType: 'sd', actorId: 'SD-X' });
    expect(r).toEqual({ inScope: false, blocked: false, verdict: VERDICT.OUT_OF_SCOPE, reason: 'no_venture_id', armed: false });
    expect(supabase._insert).not.toHaveBeenCalled();
  });

  it('TS-5: is_demo=true venture is out of scope even at stage 1 with requiredStage 24', async () => {
    const supabase = makeSupabase({ venture: { is_demo: true, current_lifecycle_stage: 1 } });
    const r = await checkStageGate({ supabase, ventureId: 'v1', requiredStage: 24, actorType: 'sd', actorId: 'SD-X', armed: true });
    expect(r.inScope).toBe(false);
    expect(r.blocked).toBe(false);
    expect(r.verdict).toBe(VERDICT.OUT_OF_SCOPE);
    expect(supabase._insert).not.toHaveBeenCalled();
  });

  it('TS-6: an unresolvable venture row is the only fail-closed path', async () => {
    const supabase = makeSupabase({ venture: null });
    const r = await checkStageGate({ supabase, ventureId: 'ghost', requiredStage: 24, actorType: 'sd', actorId: 'SD-X', armed: true });
    expect(r.inScope).toBe(true);
    expect(r.blocked).toBe(true);
    expect(r.verdict).toBe(VERDICT.BLOCK);
    expect(r.reason).toBe('unresolvable_stage');
    expect(supabase._insert).toHaveBeenCalledTimes(1);
  });

  it('a resolvable venture with a null current_lifecycle_stage also fail-closes', async () => {
    const supabase = makeSupabase({ venture: { is_demo: false, current_lifecycle_stage: null } });
    const r = await checkStageGate({ supabase, ventureId: 'v1', requiredStage: 24, actorType: 'sd', actorId: 'SD-X', armed: true });
    expect(r.blocked).toBe(true);
    expect(r.reason).toBe('unresolvable_stage');
  });

  it('an unreadable venture row ({error} rather than a thrown exception) fails closed the same way', async () => {
    const supabase = makeSupabase({ ventureError: { message: 'connection reset' } });
    const r = await checkStageGate({ supabase, ventureId: 'v1', requiredStage: 24, actorType: 'sd', actorId: 'SD-X', armed: true });
    expect(r.blocked).toBe(true);
    expect(r.reason).toBe('unresolvable_stage');
  });

  it('SECURITY finding M4/M7: a non-finite OR out-of-range requiredStage fails CLOSED rather than silently passing', async () => {
    const supabase = makeSupabase({ venture: { is_demo: false, current_lifecycle_stage: 1 } });
    // SECURITY round-3 finding (TESTING SG-T1 / SECURITY SG-M7-V): the pre-M7 list below
    // ([undefined, null, NaN, 'not-a-number']) was ALREADY caught by the older, weaker
    // Number.isFinite guard -- it could not distinguish pre-M7 code from post-M7 code.
    // 0/-1/27/24.5 are all finite numbers that only the M7 range/integer check rejects.
    for (const bad of [undefined, null, NaN, 'not-a-number', 0, -1, 27, 24.5]) {
      const r = await checkStageGate({ supabase, ventureId: 'v1', requiredStage: bad, actorType: 'sd', actorId: 'SD-X', armed: true });
      expect(r.inScope).toBe(true);
      expect(r.blocked).toBe(true);
      expect(r.verdict).toBe(VERDICT.BLOCK);
      expect(r.reason).toBe('invalid_required_stage');
    }
  });

  it('a STRING requiredStage ("24") is rejected too, even though it would coerce correctly -- strict type, not just finiteness', async () => {
    const supabase = makeSupabase({ venture: { is_demo: false, current_lifecycle_stage: 1 } });
    const r = await checkStageGate({ supabase, ventureId: 'v1', requiredStage: '24', actorType: 'sd', actorId: 'SD-X', armed: true });
    expect(r.reason).toBe('invalid_required_stage');
  });
});

describe('checkStageGate — TS-1/TS-2: normal comparison', () => {
  it('TS-1: venture at stage 1, requiredStage 24, armed -> blocked', async () => {
    const supabase = makeSupabase({ venture: { is_demo: false, current_lifecycle_stage: 1 } });
    const r = await checkStageGate({ supabase, ventureId: 'v1', requiredStage: 24, actorType: 'sd', actorId: 'SD-X', armed: true });
    expect(r).toMatchObject({ inScope: true, blocked: true, verdict: VERDICT.BLOCK, armed: true });
    expect(supabase._insert).toHaveBeenCalledWith(expect.objectContaining({
      event_type: 'stage_gate_check',
      metadata: expect.objectContaining({ venture_id: 'v1', required_stage: 24, actual_stage: 1, verdict: 'BLOCK', armed: true }),
    }));
  });

  it('SECURITY finding M6: an audit_log insert {error} is warned, not swallowed silently, and never changes the verdict', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const supabase = makeSupabase({ venture: { is_demo: false, current_lifecycle_stage: 1 } });
    supabase._insert.mockResolvedValueOnce({ error: { message: 'permission denied for table audit_log' } });
    const r = await checkStageGate({ supabase, ventureId: 'v1', requiredStage: 24, actorType: 'sd', actorId: 'SD-X', armed: true });
    expect(r.blocked).toBe(true);
    expect(r.verdict).toBe(VERDICT.BLOCK);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('permission denied for table audit_log'));
    warnSpy.mockRestore();
  });

  it('TS-2: venture at stage 24, requiredStage 24, armed -> allowed', async () => {
    const supabase = makeSupabase({ venture: { is_demo: false, current_lifecycle_stage: 24 } });
    const r = await checkStageGate({ supabase, ventureId: 'v1', requiredStage: 24, actorType: 'sd', actorId: 'SD-X', armed: true });
    expect(r).toMatchObject({ inScope: true, blocked: false, verdict: VERDICT.PASS, armed: true });
  });
});

describe('checkStageGate — TS-3: shadow mode', () => {
  it('TS-3: unarmed still writes the real (shadow) verdict to audit_log', async () => {
    const supabase = makeSupabase({ venture: { is_demo: false, current_lifecycle_stage: 1 } });
    const r = await checkStageGate({ supabase, ventureId: 'v1', requiredStage: 24, actorType: 'sd', actorId: 'SD-X', armed: false });
    expect(r.blocked).toBe(true); // the real verdict, even though armed=false
    expect(r.armed).toBe(false);
    expect(supabase._insert).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ verdict: 'BLOCK', armed: false }),
    }));
  });

  it('armed defaults to isEnabled(STAGE_GATE_PREDICATE_ARMED) when omitted', async () => {
    isEnabled.mockResolvedValue(true);
    const supabase = makeSupabase({ venture: { is_demo: false, current_lifecycle_stage: 1 } });
    const r = await checkStageGate({ supabase, ventureId: 'v1', requiredStage: 24, actorType: 'sd', actorId: 'SD-X' });
    expect(isEnabled).toHaveBeenCalledWith('STAGE_GATE_PREDICATE_ARMED');
    expect(r.armed).toBe(true);
  });
});

describe('checkStageGate — TS-7/TS-8: chairman override', () => {
  it('TS-7: an active override suppresses a block', async () => {
    const supabase = makeSupabase({
      venture: { is_demo: false, current_lifecycle_stage: 1 },
      overrideRow: { id: 'ov-1' },
    });
    const r = await checkStageGate({ supabase, ventureId: 'v1', requiredStage: 24, actorType: 'sd', actorId: 'SD-X', armed: true });
    expect(r.blocked).toBe(false);
    expect(r.verdict).toBe(VERDICT.PASS);
    expect(r.reason).toBe('chairman_override');
    // FR-4 reachability: the override lookup must key on override_key (renamed from sd_key)
    // with the actorId actually passed to checkStageGate -- not a literal SD key.
    expect(supabase._overrideEqSpy).toHaveBeenCalledWith('override_key', 'SD-X');
    // SECURITY finding H3: the lookup must ALSO scope by venture_id -- an override_key like a
    // campaign_id is not globally unique across ventures.
    expect(supabase._overrideEqSpy).toHaveBeenCalledWith('venture_id', 'v1');
    // SECURITY finding H2: a matched override is CONSUMED (consumed_at written), not left
    // active to silently suppress every subsequent call until its TTL expires.
    expect(supabase._consumeUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ consumed_at: expect.any(String) }));
    expect(supabase._consumeEqSpy).toHaveBeenCalledWith('id', 'ov-1');
  });

  it('SECURITY finding H4: an active override in SHADOW mode (armed:false) is looked up for an accurate shadow verdict, but NOT consumed', async () => {
    const supabase = makeSupabase({
      venture: { is_demo: false, current_lifecycle_stage: 1 },
      overrideRow: { id: 'ov-1' },
    });
    const r = await checkStageGate({ supabase, ventureId: 'v1', requiredStage: 24, actorType: 'sd', actorId: 'SD-X', armed: false });
    expect(r.armed).toBe(false);
    expect(r.blocked).toBe(false); // shadow verdict still accurately reports the override would suppress it
    expect(r.reason).toBe('chairman_override');
    // The one-shot must NOT be burned by a shadow-mode evaluation that suppressed nothing real.
    expect(supabase._consumeUpdateSpy).not.toHaveBeenCalled();
  });

  it('SECURITY finding M8: a failed consume update is warned, not silently swallowed, and the block is still suppressed this call', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const supabase = makeSupabase({
      venture: { is_demo: false, current_lifecycle_stage: 1 },
      overrideRow: { id: 'ov-1' },
      consumeError: { message: 'permission denied for table chairman_decisions' },
    });
    const r = await checkStageGate({ supabase, ventureId: 'v1', requiredStage: 24, actorType: 'sd', actorId: 'SD-X', armed: true });
    expect(r.blocked).toBe(false);
    expect(r.reason).toBe('chairman_override');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('permission denied for table chairman_decisions'));
    warnSpy.mockRestore();
  });

  it('TS-8: no active override (query returns nothing) does not suppress the block', async () => {
    const supabase = makeSupabase({
      venture: { is_demo: false, current_lifecycle_stage: 1 },
      overrideRow: null,
    });
    const r = await checkStageGate({ supabase, ventureId: 'v1', requiredStage: 24, actorType: 'sd', actorId: 'SD-X', armed: true });
    expect(r.blocked).toBe(true);
    expect(supabase._consumeUpdateSpy).not.toHaveBeenCalled();
  });

  it('an override lookup error fails closed (never suppresses a block)', async () => {
    const supabase = makeSupabase({
      venture: { is_demo: false, current_lifecycle_stage: 1 },
      overrideError: { message: 'connection reset' },
    });
    const r = await checkStageGate({ supabase, ventureId: 'v1', requiredStage: 24, actorType: 'sd', actorId: 'SD-X', armed: true });
    expect(r.blocked).toBe(true);
  });

  it('the override lookup is never queried on a PASS case (stage already sufficient)', async () => {
    const supabase = makeSupabase({ venture: { is_demo: false, current_lifecycle_stage: 24 } });
    await checkStageGate({ supabase, ventureId: 'v1', requiredStage: 24, actorType: 'sd', actorId: 'SD-X', armed: true });
    expect(supabase.from).not.toHaveBeenCalledWith('chairman_decisions');
  });
});

describe('shouldEnforceBlock', () => {
  it('true only when both armed and blocked', () => {
    expect(shouldEnforceBlock({ armed: true, blocked: true })).toBe(true);
    expect(shouldEnforceBlock({ armed: false, blocked: true })).toBe(false);
    expect(shouldEnforceBlock({ armed: true, blocked: false })).toBe(false);
    expect(shouldEnforceBlock(null)).toBe(false);
  });
});

describe('countRecentOverrides — FR-4 AC-4 override-rate metric', () => {
  function makeCountSupabase({ count = 0, error = null } = {}) {
    const selectSpy = vi.fn();
    const eqSpy = vi.fn();
    const from = vi.fn((table) => {
      if (table !== 'chairman_decisions') throw new Error(`unexpected table: ${table}`);
      return {
        select: (cols, opts) => {
          selectSpy(cols, opts);
          return {
            eq: (col, val) => {
              eqSpy(col, val);
              return {
                not: () => ({
                  gte: async () => (error ? { count: null, error } : { count, error: null }),
                }),
              };
            },
          };
        },
      };
    });
    return { from, _selectSpy: selectSpy, _eqSpy: eqSpy };
  }

  it('counts consumed stage_gate_override decisions in the trailing window', async () => {
    const supabase = makeCountSupabase({ count: 3 });
    const n = await countRecentOverrides(supabase, 7);
    expect(n).toBe(3);
    expect(supabase._selectSpy).toHaveBeenCalledWith('id', expect.objectContaining({ count: 'exact', head: true }));
    expect(supabase._eqSpy).toHaveBeenCalledWith('decision_type', 'stage_gate_override');
  });

  it('defaults to a 7-day window when days is omitted', async () => {
    const supabase = makeCountSupabase({ count: 1 });
    await countRecentOverrides(supabase);
    expect(supabase.from).toHaveBeenCalledWith('chairman_decisions');
  });

  it('fails closed to 0 on a query error', async () => {
    const supabase = makeCountSupabase({ error: { message: 'timeout' } });
    const n = await countRecentOverrides(supabase, 7);
    expect(n).toBe(0);
  });

  it('returns 0 for a missing/invalid supabase client rather than throwing', async () => {
    expect(await countRecentOverrides(null)).toBe(0);
    expect(await countRecentOverrides({})).toBe(0);
  });

  it('OVERRIDE_RATE_WEEKLY_THRESHOLD is the documented weekly guard-calibration threshold', () => {
    expect(OVERRIDE_RATE_WEEKLY_THRESHOLD).toBe(2);
  });
});
