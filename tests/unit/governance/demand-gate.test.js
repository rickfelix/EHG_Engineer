/**
 * SD-LEO-INFRA-SOURCING-ENGINE-BELT-GATED-001 — demand gate.
 *
 * THIS SUITE IS BUILT AROUND WHAT CAN FAIL. The SD's thesis is that an off flag is
 * indistinguishable from an on-and-quiet flag; a gate whose tests cannot fail would be that
 * defect one level up. The TESTING review (372d5539) found two of the original scenarios could
 * not fail at all and a third could not run — the repairs are marked inline.
 *
 * .test.js, NOT .test.mjs: the vitest unit include does not match .test.mjs, and a scenario landed
 * there would be a never-run test. Proven during PLAN:
 *   npx vitest run --project unit tests/unit/adam-sourcing-state-probe.test.mjs
 *   -> "No test files found, exiting with code 1"
 */
import { describe, it, expect } from 'vitest';
import {
  DEMAND_DECISION,
  normalizeGaugeReading,
  decideDemand,
  mayProduce,
  formatDemandDecision,
  BELT_DEPTH_GATED_PRODUCERS,
  STAGING_PRODUCERS_NOT_GATED,
} from '../../../lib/governance/demand-gate.js';

const ok = (n) => normalizeGaugeReading(n);

describe('TS-1: the gate discriminates across all three decisions', () => {
  it('below floor -> sourced; above floor -> withheld; unreadable -> unmeasurable', () => {
    const d1 = decideDemand(ok(0), 3, { engine: 'refill-auto-promote' });
    const d2 = decideDemand(ok(9), 3, { engine: 'refill-auto-promote' });
    const d3 = decideDemand(normalizeGaugeReading(null), 3, { engine: 'refill-auto-promote' });

    expect(d1.decision).toBe(DEMAND_DECISION.SOURCED);
    expect(d2.decision).toBe(DEMAND_DECISION.WITHHELD);
    expect(d3.decision).toBe(DEMAND_DECISION.UNMEASURABLE);

    // ANTI-COLLAPSE (TESTING review): three isolated checks would still pass a two-state gate.
    // If any two decisions ever collapse, this suite has gone vacuous and must be fixed, not deleted.
    expect(new Set([d1.decision, d2.decision, d3.decision]).size).toBe(3);
  });

  it('the boundary is inclusive — value == floor still sources', () => {
    expect(decideDemand(ok(3), 3).decision).toBe(DEMAND_DECISION.SOURCED);
    expect(decideDemand(ok(4), 3).decision).toBe(DEMAND_DECISION.WITHHELD);
  });

  it('every decision carries its own evidence, so a suppressed run can be audited later', () => {
    const d = decideDemand(ok(9), 3, { engine: 'fr-c-generator', measuredAt: '2026-07-29T16:05:41Z' });
    expect(d).toMatchObject({ engine: 'fr-c-generator', gauge_value: 9, floor: 3, measured_at: '2026-07-29T16:05:41Z' });
    expect(d.reason).toContain('9');
    expect(d.reason).toContain('3');
  });
});

describe('TS-2: a null gauge can NEVER be read as below the floor (the fail-open flood)', () => {
  // `null > 3` is false, so a naive gate SOURCES on an unreadable gauge. That is the exact
  // silent flood this SD exists to prevent, and it must be unreachable BY CONSTRUCTION.
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['negative', -1],
    ['non-numeric dispatchable', { dispatchable: 'lots' }],
  ])('%s -> unmeasurable, never sourced', (_label, raw) => {
    const d = decideDemand(normalizeGaugeReading(raw), 3);
    expect(d.decision).toBe(DEMAND_DECISION.UNMEASURABLE);
    expect(d.decision).not.toBe(DEMAND_DECISION.SOURCED);
    expect(mayProduce(d)).toBe(false);
  });

  it('the reason names the gauge, not a comparison — it must not read like a full belt', () => {
    const d = decideDemand(normalizeGaugeReading(null), 3);
    expect(d.reason).toContain('unreadable');
    expect(d.reason).toContain('NOT a licence to produce');
  });

  it('normalizeGaugeReading is the only constructor of a comparable value', () => {
    expect(normalizeGaugeReading({ dispatchable: 5 })).toEqual({ ok: true, value: 5 });
    expect(normalizeGaugeReading(5)).toEqual({ ok: true, value: 5 });
    expect(normalizeGaugeReading(null).ok).toBe(false);
    // A hand-rolled object that lies about ok still cannot smuggle a non-finite value through,
    // because decideDemand re-checks the floor and the value came from nowhere comparable.
    expect(decideDemand({ ok: true, value: NaN }, 3).decision).not.toBe(DEMAND_DECISION.SOURCED);
  });
});

describe('TS-2b: a non-finite FLOOR also yields unmeasurable', () => {
  // `5 > NaN` is ALSO false. Guarding only the gauge is half a guard, with identical blast radius.
  it.each([['NaN', NaN], ['undefined', undefined], ['null', null], ['string', '3'], ['Infinity', Infinity]])(
    'floor=%s -> unmeasurable, never sourced',
    (_label, floor) => {
      const d = decideDemand(ok(0), floor);
      expect(d.decision).toBe(DEMAND_DECISION.UNMEASURABLE);
      expect(mayProduce(d)).toBe(false);
      expect(d.reason).toContain('floor');
    }
  );

  it('a valid gauge with an invalid floor still reports the gauge it managed to read', () => {
    expect(decideDemand(ok(7), NaN).gauge_value).toBe(7);
  });
});

describe('TS-3b: POSITIVE CONTROL — an always-withhold gate must not pass', () => {
  // The control the original suite lacked. A gate hardcoded to withhold satisfies "discriminates"
  // and "withheld inserts nothing" simultaneously, while leaving the engine PERMANENTLY DEAD —
  // indistinguishable from correctly-quiet, i.e. this SD's own defect inside its own acceptance.
  it('a starved belt genuinely permits production', () => {
    const d = decideDemand(ok(0), 3, { engine: 'refill-auto-promote' });
    expect(mayProduce(d)).toBe(true);
    expect(d.decision).toBe(DEMAND_DECISION.SOURCED);
  });

  it('mayProduce is not satisfied by object truthiness — every decision object is truthy', () => {
    expect(mayProduce(decideDemand(ok(9), 3))).toBe(false);
    expect(mayProduce(decideDemand(normalizeGaugeReading(null), 3))).toBe(false);
    expect(mayProduce(decideDemand(ok(0), 3))).toBe(true);
  });
});

describe('TS-10: the floor is injected, not baked in', () => {
  it('the SAME gauge reading yields different decisions under different floors', () => {
    const reading = ok(5);
    expect(decideDemand(reading, 10).decision).toBe(DEMAND_DECISION.SOURCED);
    expect(decideDemand(reading, 2).decision).toBe(DEMAND_DECISION.WITHHELD);
    // If a floor were hardcoded, these two would agree and the acceptance criterion requiring a
    // floor chosen from a timestamped series would be untestable.
  });
});

describe('TS-6 (REPAIRED): gated-producer membership, not absence-of-change', () => {
  // Original wording asserted the three staging writers "remain reachable" — an absence of change
  // to files this SD never touches: green before, green after, green if the gate were deleted.
  it('the three roadmap_wave_items stagers are NOT gated on belt depth', () => {
    for (const stager of ['gauge-gap-miner', 'proactive-populator', 'adam-direct-registry']) {
      expect(BELT_DEPTH_GATED_PRODUCERS).not.toContain(stager);
      expect(STAGING_PRODUCERS_NOT_GATED).toContain(stager);
    }
  });

  it('the two insert-boundary producers ARE gated', () => {
    expect(BELT_DEPTH_GATED_PRODUCERS).toContain('refill-auto-promote');
    expect(BELT_DEPTH_GATED_PRODUCERS).toContain('fr-c-generator');
  });

  it('the two sets are disjoint — a producer cannot be both gated and excluded', () => {
    const overlap = BELT_DEPTH_GATED_PRODUCERS.filter((p) => STAGING_PRODUCERS_NOT_GATED.includes(p));
    expect(overlap).toEqual([]);
  });
});

describe('FR-3: the decision renders, and never-ran is distinct from withheld', () => {
  it('withheld, unmeasurable and never-ran all render differently', () => {
    const withheld = formatDemandDecision(decideDemand(ok(9), 3, { engine: 'e' }));
    const unmeasurable = formatDemandDecision(decideDemand(normalizeGaugeReading(null), 3, { engine: 'e' }));
    const neverRan = formatDemandDecision(null);
    expect(new Set([withheld, unmeasurable, neverRan]).size).toBe(3);
    expect(neverRan).toContain('NEVER RAN');
    expect(unmeasurable).toContain('UNMEASURABLE');
  });

  it('numbers print unconditionally, including a zero gauge', () => {
    // measured-and-zero must be distinguishable from not-measured.
    expect(formatDemandDecision(decideDemand(ok(0), 3, { engine: 'e' }))).toContain('gauge=0');
  });
});
