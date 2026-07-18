/**
 * SD-LEO-INFRA-PLAN-LINKAGE-BELT-001 (FR-4, chairman-ratified 2026-07-18): lib/roadmap/
 * plan-linkage-comparator.js — TS-6, including the core anti-gaming guardrail.
 */
import { describe, it, expect } from 'vitest';
import { planLinkageCompare } from '../../../lib/roadmap/plan-linkage-comparator.js';

const linked = { sd_key: 'SD-LINKED-001', metadata: { plan_linkage: { linked: true, wave_id: 'w1' } } };
const unlinked = { sd_key: 'SD-UNLINKED-001', metadata: { plan_linkage: { linked: false, unlinked_reason: 'harness-upkeep' } } };
const noStamp = { sd_key: 'SD-NOSTAMP-001', metadata: {} };

describe('SD-LEO-INFRA-PLAN-LINKAGE-BELT-001: planLinkageCompare', () => {
  it('TS-6: a linked SD sorts before an unlinked SD (tie-break case)', () => {
    expect(planLinkageCompare(linked, unlinked)).toBeLessThan(0);
    expect(planLinkageCompare(unlinked, linked)).toBeGreaterThan(0);
  });

  it('returns 0 when both are unlinked, both are linked, or both lack a stamp — a true tie, decided elsewhere', () => {
    expect(planLinkageCompare(unlinked, { ...unlinked, sd_key: 'SD-UNLINKED-002' })).toBe(0);
    expect(planLinkageCompare(linked, { ...linked, sd_key: 'SD-LINKED-002' })).toBe(0);
    expect(planLinkageCompare(noStamp, unlinked)).toBe(0); // no stamp treated as unlinked, not "worse"
  });

  it('is a pure, side-effect-free function usable directly as Array.prototype.sort comparator', () => {
    const arr = [unlinked, linked];
    arr.sort(planLinkageCompare);
    expect(arr[0]).toBe(linked);
  });
});

describe('SD-LEO-INFRA-PLAN-LINKAGE-BELT-001: chain-order anti-gaming proof (FR-4 acceptance TS-6)', () => {
  // Simulates the exact insertion point in scripts/coordinator-backlog-rank.mjs's claimable.sort:
  // planLinkageCompare is consulted ONLY after every prior objective comparator has returned 0.
  function fullChainCompare(a, b, priorComparators) {
    for (const cmp of priorComparators) {
      const r = cmp(a, b);
      if (r !== 0) return r;
    }
    return planLinkageCompare(a, b);
  }

  it('TIED case: two SDs identical on all prior comparators -> plan-linked wins the tie-break', () => {
    const priorComparators = [() => 0, () => 0, () => 0, () => 0, () => 0, () => 0]; // 6 tied signals
    const result = fullChainCompare(linked, unlinked, priorComparators);
    expect(result).toBeLessThan(0); // linked (a) sorts first
  });

  it('NOT TIED case: a prior objective comparator (e.g. unlockScore) already decides -> linkage is NEVER consulted', () => {
    // Unlinked SD has the objectively higher unlock score -- that comparator alone must decide,
    // and must NOT be overridden by plan_linkage even though linked=false loses the tie-break.
    const unlockFavorsUnlinked = (a, b) => (a === unlinked ? -1 : 1); // unlinked wins on unlockScore
    const priorComparators = [() => 0, () => 0, () => 0, unlockFavorsUnlinked];
    const result = fullChainCompare(linked, unlinked, priorComparators);
    expect(result).toBeGreaterThan(0); // unlinked (b relative to a=linked) still wins -- anti-gaming holds
  });
});
