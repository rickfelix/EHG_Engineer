/**
 * SD-LEO-INFRA-SOURCING-ENGINE-BELT-GATED-001 — the CALL SITE, not the gate.
 *
 * TESTING review 57879900 finding C1 (CRITICAL). The gate inside selectRefillBatch was well
 * covered; the wiring that FEEDS it was not covered at all, because main() has no test that
 * reaches it. Mutation testing found FIVE one-line edits at this call site surviving 8,180 tests:
 *
 *   1. delete `demand` from the opts object      → gate is a total no-op (selectRefillBatch is
 *                                                   opt-in on opts.demand, so absence is LEGAL)
 *   2. drop `floor: resolveDemandFloor(env)`     → every run UNMEASURABLE; engine permanently dead
 *                                                   and looks correctly-quiet
 *   3. `const demand = null`                     → gate never applies
 *   4. delete record/format                      → FR-3 emission silently gone for this engine
 *   5. engine-name typo                          → badge reads NEVER RAN forever while it runs
 *
 * Mutants 1 and 3 reproduce the EXACT two states this SD exists to prevent — an engine that mints
 * unchecked, and an engine that is silently dead. Each test below kills a specific one, so this
 * file is written against the mutants rather than against the happy path.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const measureDemandSpy = vi.fn();
const recordDemandDecisionSpy = vi.fn();
vi.mock('../../../lib/governance/demand-gate-emit.js', async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,                                   // resolveDemandFloor stays REAL — mutant 2 is about
    measureDemand: (...a) => measureDemandSpy(...a),   // the floor VALUE reaching measureDemand,
    recordDemandDecision: (...a) => recordDemandDecisionSpy(...a), // so mocking it would hide it.
  };
});

const { gatedSelectRefillBatch, REFILL_ENGINE } = await import('../../../scripts/sourcing-engine/refill-cron.mjs');
const { decideDemand, normalizeGaugeReading, BELT_DEPTH_GATED_PRODUCERS } = await import('../../../lib/governance/demand-gate.js');
const { DEFAULT_DEMAND_FLOOR } = await import('../../../lib/governance/demand-gate-emit.js');

const STARVED = decideDemand(normalizeGaugeReading(0), 3, { engine: 'refill-auto-promote' });
const FULL = decideDemand(normalizeGaugeReading(9), 3, { engine: 'refill-auto-promote' });

const rows = (n = 4) => Array.from({ length: n }, (_, i) => ({
  id: `rwi-${i}`, title: `Improve belt demand gating coverage ${i}`,
  item_disposition: 'pending', wave_id: 'w1', source_type: 'roadmap', source_id: `rm-${i}`,
}));

describe('refill-cron call site — the wiring, not the gate', () => {
  beforeEach(() => {
    measureDemandSpy.mockReset().mockResolvedValue(STARVED);
    recordDemandDecisionSpy.mockReset().mockResolvedValue(true);
  });

  it('KILLS mutant 1+3 — the decision actually REACHES selectRefillBatch', async () => {
    // If demand were dropped from the opts (or nulled), a full belt would still select rows,
    // because absence of opts.demand is legal by design for the 11 legacy call sites.
    measureDemandSpy.mockResolvedValue(FULL);
    const withheld = await gatedSelectRefillBatch({}, rows(), {});
    measureDemandSpy.mockResolvedValue(STARVED);
    const sourced = await gatedSelectRefillBatch({}, rows(), {});

    expect(withheld.sel.batch).toEqual([]);
    expect(withheld.sel.withheldByDemand).toBe(true);
    expect(sourced.sel.batch.length).toBeGreaterThan(0);   // positive control: not simply dead
  });

  it('KILLS mutant 2 — the floor passed to measureDemand comes from env, and is FINITE', async () => {
    await gatedSelectRefillBatch({}, rows(), {}, {});
    expect(measureDemandSpy).toHaveBeenCalledWith(expect.anything(),
      expect.objectContaining({ floor: DEFAULT_DEMAND_FLOOR }));

    measureDemandSpy.mockClear();
    await gatedSelectRefillBatch({}, rows(), {}, { BELT_DEMAND_FLOOR: '11' });
    expect(measureDemandSpy).toHaveBeenCalledWith(expect.anything(),
      expect.objectContaining({ floor: 11 }));

    // Dropping the floor entirely yields undefined -> non-finite -> permanently unmeasurable.
    const passed = measureDemandSpy.mock.calls.map((c) => c[1].floor);
    for (const f of passed) expect(Number.isFinite(f)).toBe(true);
  });

  it('KILLS mutant 4 — the decision is recorded on EVERY run, withheld included', async () => {
    measureDemandSpy.mockResolvedValue(FULL);
    await gatedSelectRefillBatch({}, rows(), {});
    expect(recordDemandDecisionSpy).toHaveBeenCalledTimes(1);
  });

  it('KILLS mutant 5 — the engine name matches the registry the BADGE reads', async () => {
    // A typo here is invisible: the cron runs and records, while the badge looks up a name that
    // is never written and reports NEVER RAN forever.
    await gatedSelectRefillBatch({}, rows(), {});
    expect(measureDemandSpy).toHaveBeenCalledWith(expect.anything(),
      expect.objectContaining({ engine: REFILL_ENGINE }));
    expect(BELT_DEPTH_GATED_PRODUCERS).toContain(REFILL_ENGINE);
  });

  it('a missing decision THROWS rather than selecting ungated', async () => {
    measureDemandSpy.mockResolvedValue(undefined);
    await expect(gatedSelectRefillBatch({}, rows(), {})).rejects.toThrow(/without a demand decision/);
  });

  it('caller opts still flow through — the gate composes with the volume cap', async () => {
    const { sel } = await gatedSelectRefillBatch({}, rows(10), { limit: 2 });
    expect(sel.batch.length).toBe(2);
  });
});
