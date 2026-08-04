// SD-LEO-INFRA-OUTCOME-SHAPED-LEDGER-001 — outcome_ref shape classification.
//
// The failure mode here is A NUMBER THAT IS TRUE AND MISLEADING, so every guard is tested by
// SEEDING the misleading form and asserting it cannot be produced. A guard shown only to permit
// the honest form is indistinguishable from one that permits everything.
//
// Two tests are load-bearing:
//   - a population without its ceiling must THROW (the SD itself was written from that bare figure)
//   - the two-bucket schema must be impossible (collapsing NOT_APPLICABLE into NOT_YET turns a
//     ceiling into a backlog, and a backlog invites the wiring this SD had to refuse)

import { describe, it, expect } from 'vitest';
import {
  SHAPE, BUCKET, ELIGIBLE,
  classifyRef, bucketFor, summarise, formatSummary,
} from '../../lib/ledger/ref-shape.js';

const row = (ref, key = null) => ({ outcome_ref: ref, outcome_sd_key: key });

describe('classifyRef', () => {
  it('accepts the one shape the deriver can use', () => {
    expect(classifyRef('SD-LEO-INFRA-REWARD-SPINE-ONE-001')).toBe(SHAPE.ELIGIBLE);
    expect(ELIGIBLE.test('SD-LEO-INFRA-REWARD-SPINE-ONE-001')).toBe(true);
  });

  it('SEEDED: a lowercase SD- ref is CASE_DRIFT, never eligible', () => {
    // Silently upcasing would raise the coverage number AND create a key that never resolves —
    // sd_key is stored uppercase, so the reconciler would re-select that row on every batch forever.
    expect(classifyRef('sd-leo-infra-reward-spine-one-001')).toBe(SHAPE.CASE_DRIFT);
    expect(classifyRef('Sd-Leo-Mixed-Case-001')).toBe(SHAPE.CASE_DRIFT);
  });

  it('SEEDED: a QF- ref is EXCLUDED_QF, with the exclusion deliberate', () => {
    // Quick fixes do not live in strategic_directives_v2, so the key would never resolve.
    expect(classifyRef('QF-20260509-PRMERGE-EXACT')).toBe(SHAPE.EXCLUDED_QF);
    expect(classifyRef('qf-lowercase-too')).toBe(SHAPE.EXCLUDED_QF);
  });

  it('classifies the real prose values as NARRATIVE', () => {
    expect(classifyRef('era_closure:2026-07-29 — advice consumed into the belt')).toBe(SHAPE.NARRATIVE);
    expect(classifyRef('followed (dispatch pressed) — later found moot')).toBe(SHAPE.NARRATIVE);
    expect(classifyRef('Solomon 07-20 18:51 ground read on -A (SESSION)')).toBe(SHAPE.NARRATIVE);
  });

  it('classifies commit shas separately from prose', () => {
    expect(classifyRef('d4f7cbe')).toBe(SHAPE.COMMIT_SHA);
    expect(classifyRef('d4f7cbedd4f7cbedd4f7cbedd4f7cbedd4f7cbed')).toBe(SHAPE.COMMIT_SHA);
  });

  it('treats null / undefined / blank as EMPTY, not as prose', () => {
    for (const v of [null, undefined, '', '   ']) expect(classifyRef(v)).toBe(SHAPE.EMPTY);
  });
});

describe('bucketFor — NOT_APPLICABLE is a real outcome, not a gap', () => {
  it('a row with a key is RESOLVABLE', () => {
    expect(bucketFor(row('anything', 'SD-X-001'))).toBe(BUCKET.RESOLVABLE);
  });

  it('SEEDED: prose is NOT_APPLICABLE — the mistake that produced the SD unbuildable remedy', () => {
    // Classifying prose as NOT_YET makes 3.4% look like a backlog rather than a ceiling.
    expect(bucketFor(row('era_closure:2026-07-29 — advice consumed'))).toBe(BUCKET.NOT_APPLICABLE);
    expect(bucketFor(row('era_closure:2026-07-29 — advice consumed'))).not.toBe(BUCKET.NOT_YET);
  });

  it('an eligible or case-drifted ref is NOT_YET — still in the mechanism domain', () => {
    expect(bucketFor(row('SD-LEO-X-001'))).toBe(BUCKET.NOT_YET);
    expect(bucketFor(row('sd-leo-x-001'))).toBe(BUCKET.NOT_YET);
  });

  it('an absent ref is NOT_YET — nothing has been decided, not out of domain', () => {
    expect(bucketFor(row(null))).toBe(BUCKET.NOT_YET);
  });

  it('QF and sha refs are NOT_APPLICABLE — they can never resolve', () => {
    expect(bucketFor(row('QF-2026-001'))).toBe(BUCKET.NOT_APPLICABLE);
    expect(bucketFor(row('d4f7cbe'))).toBe(BUCKET.NOT_APPLICABLE);
  });
});

describe('summarise — the population may never travel without its ceiling', () => {
  const sample = [
    row('SD-LEO-A-001', 'SD-LEO-A-001'),                 // resolvable
    row('SD-LEO-B-001'),                                  // not yet
    row('sd-leo-c-001'),                                  // case drift -> not yet
    row('era_closure:2026-07-29 — consumed'),             // not applicable
    row('era_closure:2026-07-30 — consumed'),             // not applicable
    row('QF-2026-001'),                                   // not applicable
    row(null),                                            // not yet
  ];

  it('reports population AND ceiling together', () => {
    const s = summarise(sample);
    expect(s.total).toBe(7);
    expect(s.outcome_sd_key_populated).toBe(1);
    expect(s.ceiling).toBe(4);           // 1 resolvable + 3 not-yet
    expect(s.pct_of_total).toBe(14.3);
    expect(s.pct_of_ceiling).toBe(25);   // the honest reading
  });

  it('SEEDED — THE LOAD-BEARING CASE: asking for the bare population THROWS', () => {
    expect(() => summarise(sample, { includeCeiling: false })).toThrow(/without its derivable ceiling/);
  });

  it('the two readings of the same number differ sharply, which is the whole point', () => {
    const s = summarise(sample);
    expect(s.pct_of_total).not.toBe(s.pct_of_ceiling);
    expect(s.pct_of_ceiling).toBeGreaterThan(s.pct_of_total);
  });

  it('SEEDED: all three buckets exist even when one is zero', () => {
    const s = summarise([row('SD-LEO-A-001', 'SD-LEO-A-001')]);
    expect(Object.keys(s.buckets).sort()).toEqual(['NOT_APPLICABLE', 'NOT_YET', 'RESOLVABLE']);
    expect(s.buckets.NOT_APPLICABLE).toBe(0);
  });

  it('buckets sum to the total — no row is silently dropped', () => {
    const s = summarise(sample);
    const sum = s.buckets.RESOLVABLE + s.buckets.NOT_YET + s.buckets.NOT_APPLICABLE;
    expect(sum).toBe(s.total);
  });

  it('pct_of_ceiling is null rather than 0 when nothing is achievable', () => {
    // Reporting 0% would imply a gap; null says the question does not apply.
    const s = summarise([row('era_closure:x'), row('QF-1')]);
    expect(s.ceiling).toBe(0);
    expect(s.pct_of_ceiling).toBeNull();
  });

  it('rejects a non-array population rather than coercing it', () => {
    expect(() => summarise(null)).toThrow(/must be an array/);
  });
});

describe('formatSummary', () => {
  it('never prints the population without the ceiling on the adjacent line', () => {
    const out = formatSummary(summarise([row('SD-A-001', 'SD-A-001'), row('era_closure:x')]));
    expect(out).toMatch(/CEILING/);
    expect(out).toMatch(/NOT_APPLICABLE/);
  });
});
