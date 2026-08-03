// SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B (TR-2, TS-6) — the C4 primitive.
//
// SCOPE OF THIS FILE, stated because the filename invites the wrong assumption: this file tests
// cite() and unmeasurable() as FUNCTIONS. The C4 property itself — that a cited number re-derives
// to the number a section displayed — is NOT tested here and cannot be, because nothing in this
// file imports a section. It lives in c4-rederivation.test.js.

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

// ---------------------------------------------------------------------------------------------
// REMOVED: a `describe('TS-14 — a cited number re-derives to the number displayed')` block used to
// sit here. It defined a fixture-local `runPredicate`, called it to BUILD a value, then called it
// again and asserted the two agreed — `runPredicate(ROWS).length === runPredicate(ROWS).length`.
// Its companion asserted `2 !== 99`. Both passed unconditionally.
//
// Deleted rather than annotated. An inert test is a FALSE GREEN: it contributes to the passing
// count and to the summary line a reviewer actually reads, and the whole premise of this SD's
// testing work is that "tests exist" and "tests can fail" are different claims. A comment saying
// "this does not really test anything" leaves the misleading number in place for everyone who
// does not read the comment.
//
// MEASURED, which is why it went: three mutations that made a section's cited value contradict its
// own row_ids (plan-position next +7, done_recent +99, slipped +42) left the entire suite green
// while this block sat here claiming to be TS-14.
//
// TS-14 now lives in tests/unit/drive-loop/c4-rederivation.test.js, imports the real section
// modules, and is mutation-proven against those same three defects.
// ---------------------------------------------------------------------------------------------

describe('cite() — null is an OBSERVATION when it says what it means (738432e4e04)', () => {
  // The discriminator is REASONED-vs-UNREASONED, not null-vs-not-null. In this domain null is
  // frequently the answer — the-next-gate-is-null means every wave is clear — and rejecting it
  // forces a section to invent a sentinel, which is copied state with extra steps.
  const base = { table: 'roadmap_wave_items', predicate: 'the gate the active wave is currently held at' };

  it('CASE 1 — an unexplained null THROWS, and the error names the way out', () => {
    // The fail-loud property the original all-nulls-are-missing rule was defending. It has to be
    // impossible to satisfy by accident, so the message has to name the field to add.
    expect(() => cite({ ...base, value: null })).toThrow(/null_means/);
  });

  it('CASE 2 — an explained null PASSES, and null_means travels IN the emission', () => {
    const c = cite({
      ...base,
      value: null,
      null_means: 'no wave is currently held at a gate; every approved wave is clear',
    });

    expect(c.value).toBeNull();
    // The load-bearing half. An explanation that stays at the call site leaves the consumer
    // looking at a bare null, guessing between "nothing blocks" and "nobody looked" — which is
    // the entire distinction being drawn. Same rule as `limitation`, same reason.
    expect(c.null_means).toBe('no wave is currently held at a gate; every approved wave is clear');
  });

  it('CASE 3 — value 0 passes and is NOT swept into the null path', () => {
    // The regression someone will cause when they "simplify" this with a falsy check. A counted
    // nothing and an observed nothing are different findings: 0 means the query ran and returned
    // none; null means there was nothing to count. Collapsing them loses the distinction that
    // made the fix necessary in the first place.
    const c = cite({ ...base, value: 0, row_ids: [] });

    expect(c.value).toBe(0);
    expect(c.value).not.toBeNull();
    expect(c).not.toHaveProperty('null_means');
  });

  it('CASE 3b — the whole falsy family passes without an explanation', () => {
    // 0 is the one named in the requirement, but a falsy check would take all of these with it,
    // and each is a legitimate observation that needs no excuse.
    expect(() => cite({ ...base, value: 0 })).not.toThrow();
    expect(() => cite({ ...base, value: '' })).not.toThrow();
    expect(() => cite({ ...base, value: false })).not.toThrow();
    expect(() => cite({ ...base, value: [] })).not.toThrow();
    expect(cite({ ...base, value: [] }).value).toEqual([]);
  });

  it('CASE 4 — an undefined value THROWS: the field was never supplied at all', () => {
    // Absent, null and empty stay three different things. undefined is the one that means nobody
    // wrote the field, which no explanation can rescue.
    expect(() => cite({ ...base })).toThrow(/value/);
    expect(() => cite({ ...base, value: undefined })).toThrow(/value/);
    // And it stays a defect even WITH a null_means — an explanation cannot conjure a field.
    expect(() => cite({ ...base, value: undefined, null_means: 'nothing is held' })).toThrow(/value/);
  });

  it('CASE 5 — a null table THROWS: provenance can never be nothing', () => {
    expect(() => cite({ table: null, predicate: 'p', value: 1 })).toThrow(/table/);
    // null_means is about the OBSERVATION and must not launder missing provenance.
    expect(() => cite({ table: null, predicate: 'p', value: null, null_means: 'nothing held' })).toThrow(/table/);
  });

  it('CASE 6 — a null predicate THROWS: "what counts" can never be nothing', () => {
    expect(() => cite({ table: 't', predicate: null, value: 1 })).toThrow(/predicate/);
    expect(() => cite({ table: 't', predicate: null, value: null, null_means: 'nothing held' })).toThrow(/predicate/);
  });

  it('an EMPTY or whitespace null_means is not an explanation', () => {
    // The same failure the predicate and limitation rules already guard: a field that satisfies a
    // presence check while carrying no information. An empty null_means is read as no explanation,
    // so it must fail exactly like a missing one.
    expect(() => cite({ ...base, value: null, null_means: '' })).toThrow(/null_means/);
    expect(() => cite({ ...base, value: null, null_means: '   ' })).toThrow(/null_means/);
    expect(() => cite({ ...base, value: null, null_means: '\n\t ' })).toThrow(/null_means/);
  });

  it('a non-string null_means is not an explanation either', () => {
    expect(() => cite({ ...base, value: null, null_means: true })).toThrow(/null_means/);
    expect(() => cite({ ...base, value: null, null_means: 1 })).toThrow(/null_means/);
  });

  it('null_means is trimmed, so padding cannot smuggle an empty explanation through', () => {
    const c = cite({ ...base, value: null, null_means: '  nothing is blocking  ' });
    expect(c.null_means).toBe('nothing is blocking');
  });

  it('null_means is NOT emitted on a non-null value — it would read as a null that is not there', () => {
    // A stray null_means beside a real number tells the reader the observation was absent when it
    // was not. The field belongs to the null, not to the call.
    const c = cite({ ...base, value: 3, row_ids: ['a', 'b', 'c'], null_means: 'left over from a copy-paste' });
    expect(c.value).toBe(3);
    expect(c).not.toHaveProperty('null_means');
  });

  it('an explained null still carries its full provenance', () => {
    // The point of admitting null at all is that it is an OBSERVATION, so it is held to the same
    // provenance standard as any other — an unauditable null is no better than a sentinel.
    const c = cite({
      ...base,
      value: null,
      row_ids: [],
      predicate: 'the gate the active wave is currently held at',
      source: 'lib/drive-loop/sections/plan-position.js',
      null_means: 'no wave is held at a gate',
    });

    expect(c.citation.table).toBe('roadmap_wave_items');
    expect(c.citation.source).toMatch(/plan-position/);
    expect(c.predicate).toBeTruthy();
    expect(c.citation.row_ids).toEqual([]);
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

  it('is a DIFFERENT claim from an explained null, and stays distinguishable', () => {
    // Both carry value:null and both are legitimate, but they say opposite things about whether
    // the instrument worked: unmeasurable means the gauge could not be READ; an explained null
    // means it WAS read and the answer was nothing. Collapsing them is how an outage starts
    // reading as a clean bill of health.
    const u = unmeasurable({ table: 't', predicate: 'p', reason: 'query timed out' });
    const n = cite({ table: 't', predicate: 'p', value: null, null_means: 'nothing is blocking' });

    expect(isUnmeasurable(u)).toBe(true);
    expect(isUnmeasurable(n)).toBe(false);
    expect(u).not.toHaveProperty('null_means');
    expect(n).not.toHaveProperty('reason');
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

  it('an explained null leg is SCORED, not treated as unreadable', () => {
    // An observation of nothing is a measurement. Only unmeasurable() shrinks the denominator —
    // if an explained null did too, "the plan is clear" would look like "the gauge is broken".
    const nullLeg = {
      id: 'leg-null',
      points: 2,
      cited: cite({ value: null, table: 't', predicate: 'p', null_means: 'no wave is held at a gate' }),
    };
    const r = scoreLegs([ok('leg1', 2), nullLeg]);

    expect(r.denominator).toBe(4);
    expect(r.unmeasurable_legs).toEqual([]);
  });
});
