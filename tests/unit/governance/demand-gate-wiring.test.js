/**
 * SD-LEO-INFRA-SOURCING-ENGINE-BELT-GATED-001 — FR-2 WIRING.
 *
 * A gate nothing consults is the defect this SD exists to fix, so these tests drive the REAL
 * selectRefillBatch rather than asserting that a call exists somewhere. Every case here can fail:
 * TS-4 is proven by deleting the gate and watching this file go red.
 *
 * .test.js deliberately — the vitest unit include does not match .test.mjs, and a wiring test that
 * never runs would assert that a gate has a caller, in a file that has no runner.
 */
import { describe, it, expect } from 'vitest';
import { selectRefillBatch } from '../../../lib/sourcing-engine/refill-auto-promote.js';
import { decideDemand, normalizeGaugeReading } from '../../../lib/governance/demand-gate.js';

// Staged roadmap_wave_items rows that GENUINELY pass verifyStagedCandidates. This shape was derived
// empirically, not guessed: an earlier fixture used `status:'staged'` and produced 0 valid rows
// ({not_staged:3}), which made "a withheld run selects nothing" pass VACUOUSLY — nothing was ever
// selectable in either arm. The TS-3b positive control is what exposed it, which is precisely the
// job it was added to do. The real gate is item_disposition ∈ {pending, selected}
// (refill-candidate-validity.js:98,:250) plus non-empty source_type + source_id (:274).
// Verified empirically at the default n=5: validCount=5, total=5, byReason={} (the "3 of 3" in an
// earlier draft of this note came from a 3-row spot check and did not match the default — TESTING
// review 57879900, W5).
function stagedRows(n = 5) {
  return Array.from({ length: n }, (_, i) => ({
    id: `rwi-${i}`,
    title: `Improve belt demand gating coverage ${i}`,
    item_disposition: 'pending',
    wave_id: 'wave-1',
    source_type: 'roadmap',
    source_id: `rm-${i}`,
  }));
}

const STARVED = decideDemand(normalizeGaugeReading(0), 3, { engine: 'refill-auto-promote' });
const SATURATED = decideDemand(normalizeGaugeReading(9), 3, { engine: 'refill-auto-promote' });
const BLIND = decideDemand(normalizeGaugeReading(null), 3, { engine: 'refill-auto-promote' });

describe('TS-3: a withheld run selects nothing', () => {
  it('DIFFERENTIAL — the same rows, only the demand decision differs, and the batch differs', () => {
    const rows = stagedRows();
    const withheld = selectRefillBatch(rows, { demand: SATURATED });
    const sourced = selectRefillBatch(rows, { demand: STARVED });

    // The load-bearing assertion. If these were equal the gate would be computed-and-discarded.
    expect(withheld.batch.length).not.toBe(sourced.batch.length);
    expect(withheld.batch).toEqual([]);
    expect(withheld.withheldByDemand).toBe(true);
  });

  it('a withheld run still reports what it SAW, so "produced nothing" is not confused with "found nothing"', () => {
    const rows = stagedRows();
    const withheld = selectRefillBatch(rows, { demand: SATURATED });
    expect(withheld.total).toBe(rows.length);
    expect(withheld.demand.decision).toBe('withheld');
    expect(withheld.demand.gauge_value).toBe(9);
    expect(withheld.demand.floor).toBe(3);
  });

  it('an UNMEASURABLE gauge withholds too — it is not a licence to produce', () => {
    const withheld = selectRefillBatch(stagedRows(), { demand: BLIND });
    expect(withheld.batch).toEqual([]);
    expect(withheld.withheldByDemand).toBe(true);
    expect(withheld.demand.decision).toBe('unmeasurable');
  });
});

describe('TS-3b: POSITIVE CONTROL — the gate does not simply kill the engine', () => {
  // Without this, an always-withhold gate passes every other test here while leaving the producer
  // permanently dead — indistinguishable from correctly-quiet, i.e. this SD's own defect.
  it('a starved belt actually produces a non-empty batch', () => {
    const sourced = selectRefillBatch(stagedRows(), { demand: STARVED });
    expect(sourced.batch.length).toBeGreaterThan(0);
    expect(sourced.withheldByDemand).toBeUndefined();
  });

  it('demand does not override the volume cap — the two controls compose', () => {
    const sourced = selectRefillBatch(stagedRows(10), { demand: STARVED, limit: 2 });
    expect(sourced.batch.length).toBe(2);
  });
});

describe('BACKWARD COMPATIBILITY — the gate is opt-in, never retroactive', () => {
  // 11 synchronous call sites across three suites pass no demand. They must be byte-identical.
  it('omitting opts.demand behaves exactly as before', () => {
    const rows = stagedRows();
    const before = selectRefillBatch(rows);
    const withStarved = selectRefillBatch(rows, { demand: STARVED });
    expect(before.batch.length).toBe(withStarved.batch.length);
    expect(before.withheldByDemand).toBeUndefined();
  });

  it('selectRefillBatch stays SYNCHRONOUS — its purity contract is load-bearing', () => {
    // If a future change made the gauge call happen inside, this returns a Promise and 11 call
    // sites break. The contract is documented at refill-auto-promote.js:14-15 ("no DB/fs/clock").
    const result = selectRefillBatch(stagedRows(), { demand: STARVED });
    expect(result).not.toBeInstanceOf(Promise);
    expect(typeof result.batch.length).toBe('number');
  });
});

describe('the decision is read via mayProduce, not object truthiness', () => {
  it('a withheld decision object is truthy yet must not permit production', () => {
    // `if (opts.demand)` would permit exactly the runs the gate exists to stop — every decision
    // object, including withheld and unmeasurable, is truthy.
    expect(Boolean(SATURATED)).toBe(true);
    expect(Boolean(BLIND)).toBe(true);
    expect(selectRefillBatch(stagedRows(), { demand: SATURATED }).batch).toEqual([]);
    expect(selectRefillBatch(stagedRows(), { demand: BLIND }).batch).toEqual([]);
  });
});
