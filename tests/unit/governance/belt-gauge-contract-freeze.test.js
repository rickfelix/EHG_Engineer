// SD-LEO-INFRA-BOTH-BELT-GAUGES-001 — THE CONTRACT FREEZE.
//
// WRITTEN AND GREEN BEFORE ANY CHANGE, DELIBERATELY. A freeze authored after the change tests the
// change; a freeze authored before it tests the contract. Everything here must pass against today's
// code untouched — if any assertion needs editing to accommodate the lane-scope work, that edit IS
// the finding, and the design is wrong.
//
// WHAT IT PROTECTS. Two failure modes, both silent, both permanent:
//
// 1. PERMANENT WITHHOLD. measureDemand calls gauge(supabase) with ONE argument. Anything that makes
//    the gauge throw, or return a shape normalizeGaugeReading cannot read, becomes gauge_absent ->
//    UNMEASURABLE -> mayProduce false -> both QF minters withheld FOREVER, announcing UNMEASURABLE
//    into a GHA log nobody reads. That is the silent-off failure lib/governance/demand-gate.js
//    exists to prevent, reachable one level down inside the gauge.
//
// 2. SILENT CONSUMER DEGRADATION. Nine call sites read these gauges. Two degrade without erroring:
//    coordinator-capacity-forecast coerces a non-number to a 0 QF contribution and over-reports a
//    deficit; adam-coordinator-health asserts EXACT EQUALITY against a second counter, so scoping
//    one side and not the other sets integrity_ok=false on every run, forever.
//
// NOTE ON ARGC: argc is deliberately NOT frozen. It is legitimately 1 today and becomes 2 if the
// scope ships as an input parameter. Freezing it would forbid the intended change rather than
// protect the contract — the distinction this file is about.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { measureDemand, resolveDemandFloor } from '../../../lib/governance/demand-gate-emit.js';
import { DEMAND_DECISION } from '../../../lib/governance/demand-gate.js';

const require_ = createRequire(import.meta.url);
const { countClaimableQuickFixes, countDispatchableBacklog, countBeltDepth } =
  require_('../../../lib/fleet/belt-depth.cjs');

/**
 * A supabase stub WIDE ENOUGH for both gauges' real chains, and deliberately wider than the ones
 * already in the suite. The existing stubs model select->eq->is->range and select->is->in exactly;
 * a second .eq() (which any lane scope would add) makes them return undefined and throw a
 * TypeError. Widening here means the freeze does not itself become the thing that breaks.
 */
function wideStub({ count = 0, rows = [] } = {}) {
  const chain = {
    select() { return chain; },
    eq() { return chain; },
    is() { return chain; },
    in() { return chain; },
    not() { return chain; },
    or() { return chain; },
    order() { return chain; },
    // SD-LEO-INFRA-QF-SUPPLY-PREDICATE-AUTO-START-001 (FR-3): countAutoStartableQuickFixes's
    // factory_lane probe calls .limit(1) before the real fetch — infrastructure widening, same
    // spirit as the rest of this stub being "wider than the ones already in the suite" (see the
    // docblock above). No assertion below changes.
    limit() { return Promise.resolve({ data: rows.slice(0, 1), count, error: null }); },
    range() { return Promise.resolve({ data: rows, count, error: null }); },
    then(res) { return Promise.resolve({ data: rows, count, error: null }).then(res); },
  };
  return { from() { return chain; } };
}

describe('FREEZE 1 — a scope-less call can never yield UNMEASURABLE', () => {
  // Exercised through the REAL measureDemand and the REAL decideDemand. A `measure:` or `decide:`
  // stub here would assert the stub, which is the trap TS-6's own header records elsewhere in this
  // suite: when the outcome cannot discriminate, the test proves nothing.
  it('a healthy gauge called with one argument yields a real verdict and a finite value', async () => {
    const demand = await measureDemand(wideStub({ count: 7 }), {
      engine: 'freeze-test',
      floor: 3,
      gauge: async () => 7,
    });
    expect(demand.decision).not.toBe(DEMAND_DECISION.UNMEASURABLE);
    expect([DEMAND_DECISION.SOURCED, DEMAND_DECISION.WITHHELD]).toContain(demand.decision);
    // Assert the VALUE, not merely that it is finite — a wrong-but-finite reading is the defect
    // this whole SD is about, and finiteness cannot see it.
    expect(demand.gauge_value).toBe(7);
    expect(demand.decision).toBe(DEMAND_DECISION.WITHHELD); // 7 > floor 3
  });

  it('a reading at or below the floor sources — both sides of the comparison move', async () => {
    const demand = await measureDemand(wideStub({ count: 1 }), {
      engine: 'freeze-test', floor: 3, gauge: async () => 1,
    });
    expect(demand.decision).toBe(DEMAND_DECISION.SOURCED);
    expect(demand.gauge_value).toBe(1);
  });

  // THE POSITIVE CONTROL. Without this, "not.toBe(UNMEASURABLE)" passes trivially in a world where
  // unmeasurable is unreachable — a cannot-fail assertion dressed as a guard. This proves the state
  // EXISTS and is reachable, so the assertions above are load-bearing.
  it('a THROWING gauge really does reach UNMEASURABLE — the state is reachable', async () => {
    const demand = await measureDemand(wideStub(), {
      engine: 'freeze-test', floor: 3,
      gauge: async () => { throw new Error('gauge exploded'); },
    });
    expect(demand.decision).toBe(DEMAND_DECISION.UNMEASURABLE);
    expect(demand.gauge_value).toBeNull();
  });

  it('a gauge returning a shape the normalizer cannot read ALSO reaches UNMEASURABLE', async () => {
    // The per-lane-object hazard, pinned as a hazard rather than as an aspiration: an object with
    // no .dispatchable is exactly what a naive lane envelope would produce.
    const demand = await measureDemand(wideStub(), {
      engine: 'freeze-test', floor: 3,
      gauge: async () => ({ EHG_Engineer: 155, EHG: 1 }),
    });
    expect(demand.decision).toBe(DEMAND_DECISION.UNMEASURABLE);
  });

  it('the floor resolves to its documented default when unset', () => {
    expect(resolveDemandFloor({})).toBe(3);
  });
});

describe('FREEZE 2 — return shapes, by EXACT key set', () => {
  // Exact key-set equality is the load-bearing detail. toMatchObject passes when a key is ADDED,
  // and an added key is precisely what breaks the two silent consumers. So compare the sorted key
  // list, not a subset.
  it('countDispatchableBacklog returns exactly {dispatchable, ineligible, raw}', async () => {
    const res = await countDispatchableBacklog(wideStub({ rows: [] }));
    expect(Object.keys(res).sort()).toEqual(['dispatchable', 'ineligible', 'raw']);
    expect(typeof res.dispatchable).toBe('number');
  });

  it('countClaimableQuickFixes returns a BARE NUMBER, not an envelope', async () => {
    const res = await countClaimableQuickFixes(wideStub({ count: 12 }));
    expect(typeof res).toBe('number');
    expect(res).toBe(12);
  });

  it('countBeltDepth returns exactly {ineligible, qfDepth, raw, sdDepth, total} and total is the sum', async () => {
    const res = await countBeltDepth(wideStub({ count: 4, rows: [] }));
    expect(Object.keys(res).sort()).toEqual(['ineligible', 'qfDepth', 'raw', 'sdDepth', 'total']);
    expect(res.total).toBe(res.sdDepth + res.qfDepth);
  });

  // FORWARD-COMPATIBILITY INVARIANT. Green today (the second arg is ignored) and green after the
  // scope ships (the second arg defaults to unscoped). This is the single assertion that says
  // "adding the parameter must not change the default behaviour" — the whole design constraint,
  // in one line.
  it('passing an explicit undefined scope equals passing nothing', async () => {
    const a = await countClaimableQuickFixes(wideStub({ count: 9 }));
    const b = await countClaimableQuickFixes(wideStub({ count: 9 }), undefined);
    expect(b).toBe(a);
  });

  it('the same invariant holds for the backlog gauge', async () => {
    const a = await countDispatchableBacklog(wideStub({ rows: [] }));
    const b = await countDispatchableBacklog(wideStub({ rows: [] }), undefined);
    expect(Object.keys(b).sort()).toEqual(Object.keys(a).sort());
    expect(b.dispatchable).toBe(a.dispatchable);
  });
});

describe('FREEZE 3 — the direction property that bounds the whole defect', () => {
  // The original SD framed this as 0.7% imprecision and called it harmless. The real property is
  // stronger and points the other way: because total >= any lane and the gate is `value <= floor`,
  // blindness can only ever produce a false WITHHELD, NEVER a false SOURCED. There is no flood
  // risk in this defect, and any change that could source where the fleet total would not has
  // inverted it.
  it('a smaller reading can only move the verdict toward SOURCED, never away', async () => {
    const bigger = await measureDemand(wideStub(), { engine: 'e', floor: 3, gauge: async () => 158 });
    const smaller = await measureDemand(wideStub(), { engine: 'e', floor: 3, gauge: async () => 1 });
    expect(bigger.decision).toBe(DEMAND_DECISION.WITHHELD);
    expect(smaller.decision).toBe(DEMAND_DECISION.SOURCED);
    // Stated as the invariant rather than the example: scoping DOWN is monotonically toward
    // sourcing, which is the fail-OPEN direction of a module built to fail closed.
    expect(smaller.gauge_value).toBeLessThan(bigger.gauge_value);
  });
});
