/**
 * SD-LEO-INFRA-PROMOTION-FLOOR-PARAM-001 — resolveLiveDemandFloor().
 *
 * The three existing demand-gate tests (belt-gauge-contract-freeze, demand-gate-emit,
 * refill-cron-demand-callsite) all pass `{}` as the supabase client, which gatherCapacityInputs
 * rejects on -- so they only ever exercise the FAIL-SAFE branch of the new resolver, never the
 * live-computed one. This file mocks capacity-inputs.mjs/belt-verdict.js so the computed branch
 * actually runs, per the LEAD-phase VALIDATION finding that this gap must be closed explicitly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const gatherCapacityInputsSpy = vi.fn();
vi.mock('../../../scripts/lib/capacity-inputs.mjs', () => ({
  gatherCapacityInputs: (...a) => gatherCapacityInputsSpy(...a),
  BELT_BUFFER: 1,
}));

const { resolveLiveDemandFloor, DEFAULT_DEMAND_FLOOR } = await import('../../../lib/governance/demand-gate-emit.js');

describe('resolveLiveDemandFloor — additive, alongside the untouched static resolveDemandFloor', () => {
  beforeEach(() => {
    gatherCapacityInputsSpy.mockReset();
  });

  it('explicit BELT_DEMAND_FLOOR override wins, never touches the DB', async () => {
    const result = await resolveLiveDemandFloor({}, { BELT_DEMAND_FLOOR: '7' });
    expect(result).toEqual({ floor: 7, source: 'override', demandSoon: null });
    expect(gatherCapacityInputsSpy).not.toHaveBeenCalled();
  });

  it('computes a live floor above the static default when demand is high', async () => {
    gatherCapacityInputsSpy.mockResolvedValue({
      idleNow: 3, freeingSoon: 2, claimableCount: 5, openQfCount: 1,
    });
    const result = await resolveLiveDemandFloor({}, {});
    // demandSoon = idleNow(3) + freeingSoon(2) = 5; computed = 5 + BELT_BUFFER(1) = 6
    expect(result).toEqual({ floor: 6, source: 'computed', demandSoon: 5 });
  });

  it('never drops below the static floor even when live demand is low', async () => {
    gatherCapacityInputsSpy.mockResolvedValue({
      idleNow: 0, freeingSoon: 0, claimableCount: 5, openQfCount: 1,
    });
    const result = await resolveLiveDemandFloor({}, {});
    // demandSoon = 0; computed = 0 + 1 = 1; max(3, 1) = 3
    expect(result.floor).toBe(3);
    expect(result.floor).toBeGreaterThanOrEqual(DEFAULT_DEMAND_FLOOR);
  });

  it('fails safe to the static floor when the capacity read rejects', async () => {
    gatherCapacityInputsSpy.mockRejectedValue(new Error('capacity read failed'));
    const result = await resolveLiveDemandFloor({}, {});
    expect(result).toEqual({ floor: DEFAULT_DEMAND_FLOOR, source: 'fallback', demandSoon: null });
  });

  it('fails safe to the static floor when the capacity read throws synchronously', async () => {
    gatherCapacityInputsSpy.mockImplementation(() => { throw new Error('sync boom'); });
    const result = await resolveLiveDemandFloor({}, {});
    expect(result).toEqual({ floor: DEFAULT_DEMAND_FLOOR, source: 'fallback', demandSoon: null });
  });

  it('NaN-guard: a non-finite demandSoon does not propagate into Math.max, falls back instead', async () => {
    // computeBeltVerdict itself throws on a non-finite input (fail-loud by its own contract), which
    // resolveLiveDemandFloor's try/catch must also catch -- proving Math.max(3, NaN) never happens.
    gatherCapacityInputsSpy.mockResolvedValue({
      idleNow: NaN, freeingSoon: 2, claimableCount: 5, openQfCount: 1,
    });
    const result = await resolveLiveDemandFloor({}, {});
    expect(result.floor).toBe(DEFAULT_DEMAND_FLOOR);
    expect(Number.isFinite(result.floor)).toBe(true);
  });
});
