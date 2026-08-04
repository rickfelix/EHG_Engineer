// SD-LEO-INFRA-TRIAGE-2026-BULK-001 — the discrimination core.
//
// Every guard here exists to stop this SD becoming the error it corrects. So each is tested by
// SEEDING the shortcut it forbids and asserting the guard fires — a guard that has only ever been
// shown to allow is indistinguishable from one that cannot block.
//
// The load-bearing test is `detectSharedRationale`: it must fail a run in which EVERY VERDICT IS
// CORRECT but the rationale is shared. Getting the right answer by the wrong method is precisely
// what produced 106 same-day judgements.

import { describe, it, expect } from 'vitest';
import {
  DRIFT, REGRESSION, UNDETERMINED, BULK_DATE,
  CALIBRATION_SIGNATURE, INVERSE_SIGNATURE,
  splitCohorts, signatureRank, examinationOrder,
  recordVerdict, summarise, findUncitedVerdicts, detectSharedRationale,
} from '../../lib/quarantine/retriage.js';

const entry = (file, over = {}) => ({
  file,
  reason_class: 'assertion-drift',
  error_signature: 'AssertionError: something',
  linked_ref: 'feedback:x',
  quarantined_at: `${BULK_DATE}T00:00:00.000Z`,
  ...over,
});

describe('splitCohorts', () => {
  it('separates the same-day bulk from individually-dated entries', () => {
    const { bulk, individual, totalAssertionDrift } = splitCohorts([
      entry('a.test.js'),
      entry('b.test.js'),
      entry('c.test.js', { quarantined_at: '2026-06-28T00:00:00.000Z' }),
      entry('d.test.js', { quarantined_at: '2026-07-17T00:00:00.000Z' }),
    ]);
    expect(bulk.map((e) => e.file)).toEqual(['a.test.js', 'b.test.js']);
    expect(individual.map((e) => e.file)).toEqual(['c.test.js', 'd.test.js']);
    expect(totalAssertionDrift).toBe(4);
  });

  it('ignores other reason classes entirely — different classes ask different questions', () => {
    const { totalAssertionDrift } = splitCohorts([entry('a.test.js'), entry('b.test.js', { reason_class: 'timeout' })]);
    expect(totalAssertionDrift).toBe(1);
  });

  it('SEEDED: merging cohorts would manufacture a bulk that did not happen', () => {
    // The failure this guards: reporting a single 117 figure. bulk.length must NOT equal the total
    // when individually-dated entries exist.
    const { bulk, totalAssertionDrift } = splitCohorts([entry('a.test.js'), entry('b.test.js', { quarantined_at: '2026-06-22T00:00:00.000Z' })]);
    expect(bulk.length).not.toBe(totalAssertionDrift);
  });
});

describe('signatureRank — an ORDER, never a verdict', () => {
  it('ranks the calibration signature first and its inverse second', () => {
    expect(signatureRank(entry('a', { error_signature: `${CALIBRATION_SIGNATURE} // Object.is` }))).toBe(0);
    expect(signatureRank(entry('b', { error_signature: `${INVERSE_SIGNATURE} // Object.is` }))).toBe(1);
    expect(signatureRank(entry('c', { error_signature: 'AssertionError: expected +0 to be 2' }))).toBe(2);
    expect(signatureRank(entry('d', { error_signature: 'TypeError: nope' }))).toBe(3);
  });

  it('returns a NUMBER, never a verdict string — the type is the guarantee', () => {
    const r = signatureRank(entry('a', { error_signature: CALIBRATION_SIGNATURE }));
    expect(typeof r).toBe('number');
    expect([DRIFT, REGRESSION, UNDETERMINED]).not.toContain(r);
  });

  it('orders for examination without reordering meaning — rank 0 first, stable within rank', () => {
    const ordered = examinationOrder([
      entry('z.test.js', { error_signature: 'TypeError: nope' }),
      entry('a.test.js', { error_signature: INVERSE_SIGNATURE }),
      entry('m.test.js', { error_signature: CALIBRATION_SIGNATURE }),
      entry('b.test.js', { error_signature: INVERSE_SIGNATURE }),
    ]);
    expect(ordered.map((e) => e.file)).toEqual(['m.test.js', 'a.test.js', 'b.test.js', 'z.test.js']);
  });
});

describe('recordVerdict — an uncitable verdict is the label being replaced', () => {
  it('accepts a cited drift verdict', () => {
    const v = recordVerdict({ file: 'a.test.js', verdict: DRIFT, citation: 'lib/x.js:42 inverted the assertion' });
    expect(v).toEqual({ file: 'a.test.js', verdict: DRIFT, citation: 'lib/x.js:42 inverted the assertion', note: null });
  });

  it('SEEDED: a drift verdict WITHOUT a citation is refused', () => {
    expect(() => recordVerdict({ file: 'a.test.js', verdict: DRIFT })).toThrow(/requires a citation/);
  });

  it('SEEDED: a regression verdict without a citation is refused too', () => {
    expect(() => recordVerdict({ file: 'a.test.js', verdict: REGRESSION, citation: '   ' })).toThrow(/requires a citation/);
  });

  it('SEEDED: undetermined without a note is refused — it must say WHAT could not be recovered', () => {
    expect(() => recordVerdict({ file: 'a.test.js', verdict: UNDETERMINED })).toThrow(/what could not be recovered/i);
  });

  it('accepts undetermined WITH a note — a real outcome, not a failure to try', () => {
    const v = recordVerdict({ file: 'a.test.js', verdict: UNDETERMINED, note: 'pre-quarantine history rewritten; no comparable tree' });
    expect(v.verdict).toBe(UNDETERMINED);
    expect(v.citation).toBeNull();
  });

  it('SEEDED: an invented verdict value is refused', () => {
    expect(() => recordVerdict({ file: 'a.test.js', verdict: 'probably-fine', citation: 'x.js:1' })).toThrow(/drift\|regression\|undetermined/);
  });
});

describe('summarise — undetermined and unprocessed are DIFFERENT claims', () => {
  const cohort = [entry('a.test.js'), entry('b.test.js'), entry('c.test.js')];

  it('counts undetermined in its own bucket, never folded into either side', () => {
    const s = summarise(cohort, [
      recordVerdict({ file: 'a.test.js', verdict: DRIFT, citation: 'lib/x.js:1' }),
      recordVerdict({ file: 'b.test.js', verdict: UNDETERMINED, note: 'context unrecoverable' }),
    ]);
    expect(s).toEqual({ total: 3, drift: 1, regression: 0, undetermined: 1, unprocessed: 1 });
  });

  it('SEEDED: an unfinished run must NOT read as complete', () => {
    // "could not determine" and "did not look" collapsing into one bucket is how a partial
    // re-triage reports as a finished one.
    const s = summarise(cohort, []);
    expect(s.unprocessed).toBe(3);
    expect(s.undetermined).toBe(0);
  });
});

describe('findUncitedVerdicts', () => {
  it('returns nothing when every verdict carries its basis', () => {
    expect(findUncitedVerdicts([
      { file: 'a', verdict: DRIFT, citation: 'x.js:1' },
      { file: 'b', verdict: UNDETERMINED, note: 'unrecoverable' },
    ])).toEqual([]);
  });

  it('SEEDED: names the offenders so the report can exit non-zero rather than print a tidy total', () => {
    const bad = findUncitedVerdicts([
      { file: 'a', verdict: REGRESSION, citation: '' },
      { file: 'b', verdict: UNDETERMINED },
    ]);
    expect(bad.map((v) => v.file)).toEqual(['a', 'b']);
  });
});

describe('detectSharedRationale — TS-7, the guard that fails a CORRECT run', () => {
  const candidates = [
    entry('a.test.js', { error_signature: CALIBRATION_SIGNATURE }),
    entry('b.test.js', { error_signature: CALIBRATION_SIGNATURE }),
    entry('c.test.js', { error_signature: INVERSE_SIGNATURE }),
  ];

  it('SEEDED — THE LOAD-BEARING CASE: one citation reused across the candidates is caught', () => {
    // Every verdict here may well be individually right. It still fails: 3 verdicts inferred from
    // 1 measurement is structurally what produced 106 same-day judgements.
    const shared = 'QF-20260509-PRMERGE-EXACT inverted the matcher';
    const found = detectSharedRationale(candidates, [
      { file: 'a.test.js', verdict: REGRESSION, citation: shared },
      { file: 'b.test.js', verdict: REGRESSION, citation: shared },
      { file: 'c.test.js', verdict: REGRESSION, citation: shared },
    ]);
    expect(found).toBe(shared);
  });

  it('passes when each candidate carries its OWN basis', () => {
    expect(detectSharedRationale(candidates, [
      { file: 'a.test.js', verdict: REGRESSION, citation: 'lib/one.js:10' },
      { file: 'b.test.js', verdict: DRIFT, citation: 'lib/two.js:20' },
      { file: 'c.test.js', verdict: REGRESSION, citation: 'lib/three.js:30' },
    ])).toBeNull();
  });

  it('ignores undetermined entries — they assert nothing to share', () => {
    expect(detectSharedRationale(candidates, [
      { file: 'a.test.js', verdict: UNDETERMINED, note: 'x' },
      { file: 'b.test.js', verdict: UNDETERMINED, note: 'y' },
    ])).toBeNull();
  });

  it('does not fire on a single verdict — one citation cannot be "shared"', () => {
    expect(detectSharedRationale(candidates, [{ file: 'a.test.js', verdict: REGRESSION, citation: 'lib/one.js:10' }])).toBeNull();
  });

  it('only inspects rank 0/1 candidates, not the whole cohort', () => {
    const mixed = [...candidates, entry('z.test.js', { error_signature: 'TypeError: nope' })];
    const shared = 'same-reason';
    expect(detectSharedRationale(mixed, [
      { file: 'z.test.js', verdict: DRIFT, citation: shared },
      { file: 'a.test.js', verdict: REGRESSION, citation: 'lib/one.js:10' },
    ])).toBeNull();
  });
});
