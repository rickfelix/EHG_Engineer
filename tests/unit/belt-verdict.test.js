/**
 * SD-LEO-INFRA-PERSIST-BELT-CAPACITY-001 — the extracted belt verdict must match the ladder it came
 * from, and must produce only verdicts leg4 accepts.
 *
 * The extraction exists because scripts/cron/drive-report-sweep.mjs:159 asks for a computeVerdict the
 * forecast script never exported. The nearest same-named function (lib/eva/capacity-governor.js:191)
 * emits a DIFFERENT vocabulary and would throw at leg4-capacity.js:66 — so the domain agreement below
 * is not decoration, it is the thing that was actually wrong.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { computeBeltVerdict } from '../../lib/drive-loop/belt-verdict.js';
import { VERDICTS, HEALTHY_VERDICTS } from '../../lib/drive-loop/score/leg4-capacity.js';

const beltCapacityVerdictsSnapshot = JSON.parse(
  readFileSync(new URL('../fixtures/belt-capacity-verdicts-snapshot.json', import.meta.url), 'utf8')
);

const base = { idleNow: 0, freeingSoon: 0, claimableCount: 0, openQfCount: 0, buffer: 2 };

describe('the ladder, transcribed verbatim', () => {
  it('empty belt with idle workers is DEFICIT-URGENT regardless of the arithmetic', () => {
    // Ordering matters: this branch fires before the deficit comparison, because there is nothing to
    // hand out no matter what the numbers say.
    expect(computeBeltVerdict({ ...base, idleNow: 1 }).verdict).toBe('DEFICIT-URGENT');
  });

  it('empty belt with NO idle workers is not urgent', () => {
    expect(computeBeltVerdict({ ...base, idleNow: 0, buffer: 0 }).verdict).toBe('TIGHT');
  });

  it('demand plus buffer exceeding depth is DEFICIT', () => {
    expect(computeBeltVerdict({ ...base, idleNow: 2, claimableCount: 3, buffer: 2 }).verdict).toBe('DEFICIT');
  });

  it('exact balance is TIGHT — the target, not the midpoint of nothing', () => {
    const r = computeBeltVerdict({ ...base, idleNow: 1, claimableCount: 3, buffer: 2 });
    expect(r.deficit).toBe(0);
    expect(r.verdict).toBe('TIGHT');
  });

  it('depth beyond demand plus buffer is SURPLUS', () => {
    expect(computeBeltVerdict({ ...base, idleNow: 1, claimableCount: 9, buffer: 2 }).verdict).toBe('SURPLUS');
  });

  it('QFs count toward depth exactly as SDs do', () => {
    const sds = computeBeltVerdict({ ...base, idleNow: 1, claimableCount: 4, openQfCount: 0, buffer: 2 });
    const qfs = computeBeltVerdict({ ...base, idleNow: 1, claimableCount: 0, openQfCount: 4, buffer: 2 });
    expect(qfs).toEqual(sds);
  });
});

describe('the returned shape is exactly what leg4 injects for', () => {
  it('returns verdict, beltDepth, demandSoon and deficit', () => {
    const r = computeBeltVerdict({ idleNow: 2, freeingSoon: 1, claimableCount: 3, openQfCount: 1, buffer: 2 });
    expect(r).toEqual({ verdict: 'DEFICIT', beltDepth: 4, demandSoon: 3, deficit: 1 });
  });

  it('every reachable verdict is inside leg4\'s frozen set', () => {
    // THE CHECK THAT WAS ACTUALLY WRONG. A same-named function elsewhere emits a different
    // vocabulary; wiring that one in would throw at leg4-capacity.js:66 on the first call.
    const cases = [
      { ...base, idleNow: 1 },
      { ...base, idleNow: 2, claimableCount: 3, buffer: 2 },
      { ...base, idleNow: 1, claimableCount: 3, buffer: 2 },
      { ...base, idleNow: 1, claimableCount: 9, buffer: 2 },
    ];
    for (const c of cases) expect(VERDICTS).toContain(computeBeltVerdict(c).verdict);
  });

  it('TIGHT is the only one leg4 scores as healthy — SURPLUS is not', () => {
    expect(HEALTHY_VERDICTS).toEqual(['TIGHT']);
    expect(HEALTHY_VERDICTS).not.toContain('SURPLUS');
  });
});

describe('SEEDED — a missing input throws rather than reading as zero', () => {
  it.each(['idleNow', 'freeingSoon', 'claimableCount', 'openQfCount', 'buffer'])('%s missing throws', (k) => {
    const args = { ...base, idleNow: 1, claimableCount: 3 };
    delete args[k];
    expect(() => computeBeltVerdict(args)).toThrow(new RegExp(k));
  });

  it('the silent-zero it prevents would have read SURPLUS — the most reassuring answer available', () => {
    // With every input coerced to 0 and no buffer, deficit is 0 and beltDepth is 0 with idleNow 0:
    // a confident verdict built on absent data. Throwing is the point.
    expect(() => computeBeltVerdict({})).toThrow();
    expect(() => computeBeltVerdict()).toThrow();
  });

  it('NaN and Infinity are rejected too, not just undefined', () => {
    expect(() => computeBeltVerdict({ ...base, idleNow: NaN })).toThrow(/idleNow/);
    expect(() => computeBeltVerdict({ ...base, buffer: Infinity })).toThrow(/buffer/);
  });
});

// SD-LEO-INFRA-FORECASTER-CLAIMABLE-PREDICATE-001 FR-2/FR-4 (TS-4): replay a COMMITTED SNAPSHOT of
// real belt_capacity_verdicts rows (not a live DB read -- a live replay is self-invalidating,
// since a regressed formula writes rows that satisfy itself) through the deficit arithmetic
// identity. Stored rows carry belt_depth/demand_soon/deficit/verdict but NOT idleNow, so the
// DEFICIT-URGENT ladder branch cannot be re-derived from them -- this suite checks the arithmetic
// identity (every row) and the non-URGENT verdict-ladder branches (TIGHT/DEFICIT/SURPLUS) only.
describe('formula invariant against a real belt_capacity_verdicts snapshot (FR-2/FR-4, TS-4)', () => {
  const { rows, belt_buffer_at_capture: buffer } = beltCapacityVerdictsSnapshot;

  it('the snapshot is non-trivial and covers more than one verdict', () => {
    expect(rows.length).toBeGreaterThanOrEqual(30);
    expect(new Set(rows.map((r) => r.verdict)).size).toBeGreaterThanOrEqual(2);
  });

  it('every sampled row satisfies deficit = (demand_soon + buffer) - belt_depth exactly', () => {
    const mismatches = rows.filter((r) => (r.demand_soon + buffer) - r.belt_depth !== r.deficit);
    expect(mismatches, `mismatched rows: ${JSON.stringify(mismatches)}`).toEqual([]);
  });

  it('the non-URGENT verdict ladder (TIGHT/DEFICIT/SURPLUS) matches the stored verdict for every sampled row', () => {
    const mismatches = rows.filter((r) => {
      const expected = r.deficit > 0 ? 'DEFICIT' : r.deficit === 0 ? 'TIGHT' : 'SURPLUS';
      return expected !== r.verdict;
    });
    expect(mismatches, `mismatched rows: ${JSON.stringify(mismatches)}`).toEqual([]);
  });
});
