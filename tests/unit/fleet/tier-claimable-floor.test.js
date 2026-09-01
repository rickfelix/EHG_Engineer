/**
 * tier-claimable-floor.test.js — SD-LEO-INFRA-BELT-CLAIMABLE-ACCURACY-FLOOR-001.
 *
 * FR-1 (claim-correctness): an EXPLICITLY-stamped per-SD metadata.min_tier_rank is a FLOOR that is
 * honored even when GLOBAL tiering is off — a below-rung worker can no longer self-claim a
 * higher-tier-only SD (live-caught e80c07b0). FR-2: claimableForRepo fails open without repo ctx.
 * FR-4: an untiered SD is reachable by every tier (verify-or-drop evidence).
 *
 * Pure predicates over the shared rollup, reusing the real gate (no DB, no clock). Keys avoid the
 * TEST-/DEMO- fixture prefixes so classifyDispatchIneligibility does not classify them as fixtures.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { tierBlocks, claimableForTier, claimableForRepo, sdMinTierRank } = require('../../../lib/fleet/tier-claimable.cjs');

// A base-eligible SD (no orchestrator/fixture/human-action/terminal axis fires) with an optional floor.
// SD-LEO-INFRA-TIER-FLOOR-PROVENANCE-001 (ruling 1B): a floor with no min_tier_rank_reason is ADVISORY
// (non-blocking); pass reason:true to make it provenance-bearing (binding), matching the old always-
// binding behavior these FR-1 tests were written against.
const floored = (rank, reason) => ({
  sd_key: 'SD-BELT-FLOOR-UNIT',
  sd_type: 'infrastructure',
  status: 'draft',
  metadata: rank == null ? {} : { min_tier_rank: rank, ...(reason ? { min_tier_rank_reason: 'unit-test floor' } : {}) },
});

describe('QF-20260831-419: explicit min_tier_rank floor no longer blocks, tiering ON or OFF', () => {
  it('does not block a below-rung worker on an explicitly-floored SD (tiering OFF)', () => {
    expect(tierBlocks(floored(3, true), 2, false)).toBe(false); // Sonnet(2) vs Fable-only(3)
  });
  it('allows an at/above-rung worker on the same SD (tiering OFF)', () => {
    expect(tierBlocks(floored(3, true), 3, false)).toBe(false);
    expect(tierBlocks(floored(3, true), 4, false)).toBe(false);
  });
  it('an unstamped worker vs an explicit floor is no longer blocked (tiering OFF)', () => {
    expect(tierBlocks(floored(3, true), undefined, false)).toBe(false);
  });
  it('regression: the tiering-ON path agrees — also non-blocking', () => {
    expect(tierBlocks(floored(3, true), 2, true)).toBe(false);
    expect(tierBlocks(floored(3, true), 3, true)).toBe(false);
  });
});

describe('SD-LEO-INFRA-TIER-FLOOR-PROVENANCE-001: a floor with NO min_tier_rank_reason is advisory (non-blocking)', () => {
  it('does not block a below-rung worker when the floor carries no reason (tiering OFF)', () => {
    expect(tierBlocks(floored(3, false), 2, false)).toBe(false);
  });
  it('does not block a below-rung worker when the floor carries no reason (tiering ON)', () => {
    expect(tierBlocks(floored(3, false), 2, true)).toBe(false);
  });
});

describe('QF-20260831-419: claimableForTier no longer excludes an explicitly-floored SD, tiering OFF', () => {
  it('includes an above-rung provenance-bearing floored SD for a below-rung worker (tiering OFF)', () => {
    const pool = [floored(3, true), floored(null)];
    const out = claimableForTier(pool, { workerTierRank: 2, tieringActive: false, preFiltered: true });
    expect(out).toHaveLength(2);
  });
  it('includes it for an at-rung worker (tiering OFF)', () => {
    const out = claimableForTier([floored(3, true)], { workerTierRank: 3, tieringActive: false, preFiltered: true });
    expect(out).toHaveLength(1);
  });
  it('includes an above-rung floor with NO reason (advisory, tiering OFF)', () => {
    const out = claimableForTier([floored(3, false)], { workerTierRank: 2, tieringActive: false, preFiltered: true });
    expect(out).toHaveLength(1);
  });
});

describe('FR-4: untiered SD is claimable by every tier (verify-or-drop evidence)', () => {
  it('sdMinTierRank is null for an unscored SD', () => {
    expect(sdMinTierRank(floored(null))).toBeNull();
  });
  it('an untiered SD is never tier-blocked (tiering ON or OFF, any rung)', () => {
    expect(tierBlocks(floored(null), 1, true)).toBe(false);
    expect(tierBlocks(floored(null), 1, false)).toBe(false);
    expect(tierBlocks(floored(null), 2, false)).toBe(false);
  });
});

describe('FR-2: claimableForRepo fails open to the tier count without repo context', () => {
  it('returns the full tier-claimable set when no cwd/currentApp is supplied', () => {
    const pool = [floored(null), floored(null)];
    const tier = claimableForTier(pool, { workerTierRank: 2, tieringActive: false, preFiltered: true });
    const repo = claimableForRepo(pool, { workerTierRank: 2, tieringActive: false, preFiltered: true });
    expect(repo).toHaveLength(tier.length);
  });
});
