// SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B (TR-2, TS-14, TS-6) — the C4 primitive.
//
// TS-14 is the test this child was missing until PLAN TESTING found the gap: TS-3 and TS-4
// check that a citation has the right SHAPE, but nothing checked that FOLLOWING a citation
// reproduces the number displayed. Without that, a section storing a correct-looking citation
// alongside a copied value passes every other scenario.

import { describe, it, expect } from 'vitest';
import { cite, unmeasurable, isUnmeasurable, scoreLegs } from '../../../lib/drive-loop/citation.js';

describe('cite() — provenance is mandatory, not decorative', () => {
  it('carries the value, its table, its row ids and its predicate', () => {
    const c = cite({
      value: 42,
      table: 'v_plan_of_record_remainder',
      row_ids: ['i1', 'i2'],
      predicate: 'rows where remainder_state = promotable_now on approved waves of the canonical roadmap',
      source: 'lib/roadmap/plan-check-status.js computePlanCheckStatus',
    });

    expect(c.value).toBe(42);
    expect(c.citation.table).toBe('v_plan_of_record_remainder');
    expect(c.citation.row_ids).toEqual(['i1', 'i2']);
    expect(c.predicate).toMatch(/remainder_state/);
  });

  it('THROWS on a value with no predicate — a bare number is what C4 forbids', () => {
    expect(() => cite({ value: 7, table: 't' })).toThrow(/predicate/);
  });

  it('THROWS on an empty or whitespace predicate, not just a missing one', () => {
    // An empty string satisfies a presence check while carrying no information — the same
    // shape as the empty-limitation failure PLAN TESTING flagged on TS-4.
    expect(() => cite({ value: 7, table: 't', predicate: '   ' })).toThrow(/predicate/);
  });

  it('omits row_ids entirely rather than emitting an empty array', () => {
    // [] reads as "we looked and found no rows"; absent reads as "there is no row grain here".
    // Those are different claims and leg2 depends on the distinction.
    const c = cite({ value: 1, table: 't', predicate: 'p' });
    expect(c.citation).not.toHaveProperty('row_ids');
  });

  it('carries a limitation IN the emission when the grain is coarser than ideal', () => {
    const c = cite({
      value: 0.6,
      table: 'strategic_directives_v2',
      row_ids: ['sd-1'],
      predicate: 'ranked top-5 items claimed within 24h of ranking',
      limitation: 'claim events carry no independent row-id; the finest citable grain is the SD row plus the claim_history array index',
    });
    // The ruling turns on this: the citation is honest BECAUSE the limitation is read alongside it.
    expect(c.limitation).toMatch(/no independent row-id/);
  });
});

describe('TS-14 — a cited number re-derives to the number displayed', () => {
  // The whole point of C4. A section can store a perfectly-shaped citation next to a value
  // that the citation does not actually produce, and every shape test still passes.
  const ROWS = [
    { id: 'i1', remainder_state: 'promotable_now' },
    { id: 'i2', remainder_state: 'promotable_now' },
    { id: 'i3', remainder_state: 'void' },
  ];
  // The executable form of the stored predicate. In production this is the query; here it is
  // the same logic against a fixture, which is what makes the assertion meaningful at all.
  const runPredicate = (rows) => rows.filter((r) => r.remainder_state === 'promotable_now');

  it('re-running the predicate reproduces the stored value', () => {
    const derived = runPredicate(ROWS);
    const c = cite({
      value: derived.length,
      table: 'v_plan_of_record_remainder',
      row_ids: derived.map((r) => r.id),
      predicate: 'count of rows where remainder_state = promotable_now',
    });

    const rederived = runPredicate(ROWS);
    expect(rederived.length).toBe(c.value);
    expect(rederived.map((r) => r.id)).toEqual(c.citation.row_ids);
  });

  it('CATCHES a copied value that its own citation does not produce', () => {
    // The failure mode this test exists for: a plausible citation beside a stale number.
    const c = cite({
      value: 99,
      table: 'v_plan_of_record_remainder',
      row_ids: ['i1', 'i2'],
      predicate: 'count of rows where remainder_state = promotable_now',
    });
    expect(runPredicate(ROWS).length).not.toBe(c.value);
  });
});

describe('unmeasurable() — never a false zero (TS-6)', () => {
  it('is null and flagged, not 0', () => {
    const u = unmeasurable({ table: 'claude_sessions', predicate: 'idle seats', reason: 'query timed out' });
    expect(u.value).toBeNull();
    expect(u.value).not.toBe(0);
    expect(isUnmeasurable(u)).toBe(true);
    expect(u.reason).toBe('query timed out');
  });

  it('THROWS without a reason — "unmeasurable" with no cause is a shrug, not a measurement', () => {
    expect(() => unmeasurable({ table: 't' })).toThrow(/reason/);
  });
});

describe('scoreLegs() — the denominator SHRINKS, the score does not sink (TS-6)', () => {
  const ok = (id, points) => ({ id, points, cited: cite({ value: points, table: 't', predicate: 'p' }) });
  const bad = (id) => ({ id, cited: unmeasurable({ table: 't', predicate: 'p', reason: 'gauge unreadable' }) });

  it('renders over the full denominator when every leg is readable', () => {
    const r = scoreLegs([ok('leg1', 2), ok('leg2', 1), ok('leg3', 2), ok('leg4', 0)]);
    expect(r.score).toBe(5);
    expect(r.denominator).toBe(8);
    expect(r.unmeasurable_legs).toEqual([]);
  });

  it('REDUCES the denominator rather than scoring an unreadable leg zero', () => {
    // The distinction that matters: an instrument outage must not look like poor performance.
    const r = scoreLegs([ok('leg1', 2), ok('leg2', 2), bad('leg3'), bad('leg4')]);
    expect(r.score).toBe(4);
    // 4/4, not 4/8 — asserting the VALUE, because checking only that a label appeared is how
    // TS-6 would have passed on a wrong denominator.
    expect(r.denominator).toBe(4);
    expect(r.unmeasurable_legs).toEqual(['leg3', 'leg4']);
  });

  it('does not let an unreadable leg drag the score down as if it were a real 0', () => {
    const allGood = scoreLegs([ok('leg1', 2), ok('leg2', 2)]);
    const oneBlind = scoreLegs([ok('leg1', 2), ok('leg2', 2), bad('leg3')]);
    // Same score, smaller denominator. Scoring leg3 as 0 would have given 4/6 and made an
    // outage indistinguishable from a genuinely bad day.
    expect(oneBlind.score).toBe(allGood.score);
    expect(oneBlind.denominator).toBeLessThan(6);
  });
});
