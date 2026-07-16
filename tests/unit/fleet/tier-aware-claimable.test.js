/**
 * SD-LEO-INFRA-BELT-TIER-AWARE-CLAIMABILITY-001 (FR-4) — tier-aware claimable rollup.
 *
 * Pure-function unit tests on lib/fleet/tier-claimable.cjs. The helper delegates the tier comparison +
 * exclusion to the REAL gate (classifyDispatchIneligibility) and the REAL belt-exclusion SSOT
 * (isExcludedFromBelt), so these tests exercise the genuine wiring, not a re-implementation. No Supabase.
 *
 * Invariants under test:
 *   (a) a tier-N worker's claimable set excludes finite-rank > N SDs, includes rank<=N AND unscored;
 *   (b) the unscored bucket is reachable by every tier and counted exactly once in the aggregate;
 *   (c) aggregate === sum of the exact-rank partition (incl. unscored/above-top) — no double-count —
 *       and cumulative claimable-to-tier-N === unscored + sum of exact ranks 1..N;
 *   (d) tiering-OFF (degrade-to-1) => the GLOBAL ladder is inert, but an EXPLICIT per-SD
 *       min_tier_rank is still honored (FR-1, BELT-CLAIMABLE-ACCURACY-FLOOR-001): claimable-to-rung-r
 *       is unscored + sum(exact 1..r) in BOTH tiering states, not the full aggregate;
 *   (e) an otherwise-ineligible SD (deferred / orchestrator / fixture / bare-shell) is excluded
 *       regardless of tier.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { claimableForTier, tierClaimableBreakdown, isBaseEligible, sdMinTierRank } = require('../../../lib/fleet/tier-claimable.cjs');
const { ladderTopRank, deriveLiveLadder, __resetLadderCacheForTests } = require('../../../lib/fleet/tier-ladder.cjs');

const TOP = ladderTopRank(); // 4

// A well-formed, base-eligible SD (real description so it is NOT a bare-shell). rank=undefined => unscored.
const sd = (sd_key, rank, extra = {}) => ({
  sd_key,
  sd_type: 'infrastructure',
  status: 'draft',
  title: `${sd_key} title`,
  description: `A substantive description for ${sd_key} that is not equal to the title.`,
  metadata: rank === undefined ? {} : { min_tier_rank: rank },
  ...extra,
});

const keys = (arr) => arr.map((x) => x.sd_key).sort().join(',');

describe('claimableForTier — WORK-DOWN-NEVER-UP per rung (FR-4a/b)', () => {
  const pool = [sd('A', 1), sd('B', 2), sd('C', 3), sd('D', 4), sd('E', 4), sd('U')]; // U unscored

  it('tier-3 worker: includes rank<=3 and unscored, excludes rank-4', () => {
    expect(keys(claimableForTier(pool, { workerTierRank: 3, tieringActive: true }))).toBe('A,B,C,U');
  });

  it('tier-1 worker: only rank-1 and unscored', () => {
    expect(keys(claimableForTier(pool, { workerTierRank: 1, tieringActive: true }))).toBe('A,U');
  });

  it('top-tier worker: everything (unscored reachable by all)', () => {
    expect(claimableForTier(pool, { workerTierRank: TOP, tieringActive: true })).toHaveLength(6);
  });

  it('unscored SD is reachable at EVERY rung', () => {
    for (let r = 1; r <= TOP; r += 1) {
      expect(claimableForTier(pool, { workerTierRank: r, tieringActive: true }).some((x) => x.sd_key === 'U')).toBe(true);
    }
  });
});

describe('tierClaimableBreakdown — partition + cumulative invariants (FR-4c)', () => {
  const pool = [sd('A', 1), sd('B', 2), sd('C', 3), sd('D', 4), sd('E', 4), sd('U'), sd('V')]; // 2 unscored

  it('exact-rank partition sums to the aggregate (no double-count)', () => {
    const bd = tierClaimableBreakdown(pool, { tieringActive: true });
    expect(bd.aggregate).toBe(7);
    expect(bd.unscored).toBe(2);
    const partitionSum = bd.unscored + bd.aboveTop + Object.values(bd.exact).reduce((a, b) => a + b, 0);
    expect(partitionSum).toBe(bd.aggregate);
    expect(bd.partitionSumsToAggregate).toBe(true);
  });

  it('cumulative claimable-to-tier-N === unscored + sum of exact ranks 1..N', () => {
    const bd = tierClaimableBreakdown(pool, { tieringActive: true });
    let running = bd.unscored;
    for (let r = 1; r <= TOP; r += 1) {
      running += bd.exact[r];
      expect(bd.cumulative[r]).toBe(running);
      // and it must equal what claimableForTier returns for that rung
      expect(claimableForTier(pool, { workerTierRank: r, tieringActive: true })).toHaveLength(running);
    }
  });

  it('top rung cumulative === aggregate', () => {
    const bd = tierClaimableBreakdown(pool, { tieringActive: true });
    expect(bd.cumulative[TOP]).toBe(bd.aggregate);
  });

  it('defensive: a finite rank > top lands in aboveTop (in aggregate, in no cumulative rung)', () => {
    const bd = tierClaimableBreakdown([sd('A', 1), sd('X', TOP + 1)], { tieringActive: true });
    expect(bd.aboveTop).toBe(1);
    expect(bd.aggregate).toBe(2);
    expect(bd.partitionSumsToAggregate).toBe(true);
    expect(bd.cumulative[TOP]).toBe(1); // only A (rank 1); X reachable by no rung
  });
});

describe('tiering OFF — global ladder inert, EXPLICIT floor still honored (FR-1, BELT-CLAIMABLE-ACCURACY-FLOOR-001)', () => {
  const pool = [sd('A', 1), sd('D', 4), sd('U')]; // A: floor 1, D: floor 4, U: unscored

  it('claimableForTier honors an explicit per-SD min_tier_rank even when tiering is off', () => {
    // The GLOBAL rung ladder is inert with tiering off, but an explicitly-stamped floor is a FLOOR:
    // rung r claims A iff r>=1, D iff r>=4, U (unscored) always. A rung-1 worker cannot take D(floor 4).
    expect(claimableForTier(pool, { workerTierRank: 1, tieringActive: false })).toHaveLength(2); // A + U
    expect(claimableForTier(pool, { workerTierRank: 3, tieringActive: false })).toHaveLength(2); // A + U (D still floored)
    expect(claimableForTier(pool, { workerTierRank: 4, tieringActive: false })).toHaveLength(3); // A + D + U
  });

  it('breakdown cumulative honors explicit floors even when tiering is off (unscored + sum exact 1..r)', () => {
    const bd = tierClaimableBreakdown(pool, { tieringActive: false });
    expect(bd.cumulative[1]).toBe(2);   // U + A
    expect(bd.cumulative[3]).toBe(2);   // U + A (D floored at 4)
    expect(bd.cumulative[4]).toBe(3);   // U + A + D
    expect(bd.cumulative[TOP]).toBe(3); // everything with a rung <= TOP
    expect(bd.partitionSumsToAggregate).toBe(true);
  });
});

describe('gate reuse — ineligible SDs excluded regardless of tier (FR-4e)', () => {
  it('a deferred SD is not base-eligible', () => {
    expect(isBaseEligible(sd('DEF', 1, { status: 'deferred' }))).toBe(false);
  });
  it('an orchestrator parent is not base-eligible', () => {
    expect(isBaseEligible(sd('ORCH', 1, { sd_type: 'orchestrator' }))).toBe(false);
  });
  it('a bare-shell (description === title) is not base-eligible', () => {
    expect(isBaseEligible({ sd_key: 'BARE', sd_type: 'infrastructure', status: 'draft', title: 'Same', description: 'Same', metadata: { min_tier_rank: 1 } })).toBe(false);
  });
  it('a fixture key is not base-eligible', () => {
    expect(isBaseEligible(sd('SD-TEST-FOO', 1))).toBe(false);
  });
  it('ineligible SDs are dropped from claimableForTier AND the breakdown aggregate', () => {
    const pool = [sd('A', 1), sd('DEF', 1, { status: 'deferred' }), sd('ORCH', 2, { sd_type: 'orchestrator' })];
    expect(keys(claimableForTier(pool, { workerTierRank: TOP, tieringActive: true }))).toBe('A');
    expect(tierClaimableBreakdown(pool, { tieringActive: true }).aggregate).toBe(1);
  });
});

describe('sdMinTierRank reader', () => {
  it('reads a finite stamped rank; null when unscored/non-finite', () => {
    expect(sdMinTierRank(sd('A', 3))).toBe(3);
    expect(sdMinTierRank(sd('U'))).toBeNull();
    expect(sdMinTierRank({ metadata: { min_tier_rank: 'nope' } })).toBeNull();
    expect(sdMinTierRank(null)).toBeNull();
  });
});

describe('preFiltered passthrough', () => {
  it('skips re-filtering when the pool is already base-eligible', () => {
    // a deferred SD passed with preFiltered:true is trusted (counted) — caller asserts base eligibility
    const pool = [sd('A', 1), sd('DEF', 1, { status: 'deferred' })];
    expect(tierClaimableBreakdown(pool, { tieringActive: true, preFiltered: true }).aggregate).toBe(2);
    expect(tierClaimableBreakdown(pool, { tieringActive: true, preFiltered: false }).aggregate).toBe(1);
  });
});

// SD-LEO-INFRA-AUTO-TIERING-ACTIVATION-001-C: tier-claimable.cjs already reads ladderTopRank()
// dynamically (never hardcoded 4), but no prior test exercised K != 4. These prove the
// partition/cumulative invariants hold when a live fleet resizes the ladder, and that the
// module-level ladder cache is restored afterward so it doesn't leak into other test files.
describe('K != 4 — invariants hold when the live fleet resizes the ladder (FR-4)', () => {
  afterEach(() => {
    __resetLadderCacheForTests();
  });

  it('a 2-distinct-score live fleet resizes ladderTopRank() to 2, and breakdown invariants still hold', () => {
    const { topRank } = deriveLiveLadder([
      { model: 'sonnet', effort: 'max' },
      { model: 'opus', effort: 'high' },
    ]);
    expect(topRank).toBe(2);
    expect(ladderTopRank()).toBe(2);

    const pool = [sd('A', 1), sd('B', 2), sd('U')]; // 1 unscored
    const bd = tierClaimableBreakdown(pool, { tieringActive: true });
    expect(bd.aggregate).toBe(3);
    const partitionSum = bd.unscored + bd.aboveTop + Object.values(bd.exact).reduce((a, b) => a + b, 0);
    expect(partitionSum).toBe(bd.aggregate);
    expect(bd.partitionSumsToAggregate).toBe(true);

    let running = bd.unscored;
    for (let r = 1; r <= 2; r += 1) {
      running += bd.exact[r];
      expect(bd.cumulative[r]).toBe(running);
      expect(claimableForTier(pool, { workerTierRank: r, tieringActive: true })).toHaveLength(running);
    }
    expect(bd.cumulative[2]).toBe(bd.aggregate);
  });

  it('a 6-distinct-score live fleet resizes ladderTopRank() to 6, and a rank-6 SD is claimable only at the top rung', () => {
    const { topRank } = deriveLiveLadder([
      { model: 'sonnet', effort: 'low' },
      { model: 'sonnet', effort: 'medium' },
      { model: 'sonnet', effort: 'high' },
      { model: 'sonnet', effort: 'max' },
      { model: 'opus', effort: 'high' },
      { model: 'opus', effort: 'max' },
    ]);
    expect(topRank).toBe(6);
    expect(ladderTopRank()).toBe(6);

    const pool = [sd('A', 1), sd('F', 6), sd('U')];
    expect(keys(claimableForTier(pool, { workerTierRank: 5, tieringActive: true }))).toBe('A,U');
    expect(keys(claimableForTier(pool, { workerTierRank: 6, tieringActive: true }))).toBe('A,F,U');

    const bd = tierClaimableBreakdown(pool, { tieringActive: true });
    expect(bd.partitionSumsToAggregate).toBe(true);
    expect(bd.cumulative[6]).toBe(bd.aggregate);
  });

  it('restores the default K=4 ladder after the cache reset (no cross-test leakage)', () => {
    expect(ladderTopRank()).toBe(TOP);
  });
});
