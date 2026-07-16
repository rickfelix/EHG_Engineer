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
const floored = (rank) => ({
  sd_key: 'SD-BELT-FLOOR-UNIT',
  sd_type: 'infrastructure',
  status: 'draft',
  metadata: rank == null ? {} : { min_tier_rank: rank },
});

describe('FR-1: explicit min_tier_rank honored even with global tiering OFF', () => {
  it('blocks a below-rung worker on an explicitly-floored SD (tiering OFF)', () => {
    expect(tierBlocks(floored(3), 2, false)).toBe(true); // Sonnet(2) vs Fable-only(3)
  });
  it('allows an at/above-rung worker on the same SD (tiering OFF)', () => {
    expect(tierBlocks(floored(3), 3, false)).toBe(false);
    expect(tierBlocks(floored(3), 4, false)).toBe(false);
  });
  it('fails closed: an unstamped worker vs an explicit floor is blocked (tiering OFF)', () => {
    expect(tierBlocks(floored(3), undefined, false)).toBe(true);
  });
  it('regression: the tiering-ON path is unchanged (delegates to the gate)', () => {
    expect(tierBlocks(floored(3), 2, true)).toBe(true);
    expect(tierBlocks(floored(3), 3, true)).toBe(false);
  });
});

describe('FR-1: claimableForTier reflects the explicit floor with tiering OFF', () => {
  it('excludes an above-rung floored SD for a below-rung worker (tiering OFF)', () => {
    const pool = [floored(3), floored(null)];
    const out = claimableForTier(pool, { workerTierRank: 2, tieringActive: false, preFiltered: true });
    expect(out).toHaveLength(1);
    expect(out[0].metadata.min_tier_rank).toBeUndefined(); // only the unscored one remains
  });
  it('includes it for an at-rung worker (tiering OFF)', () => {
    const out = claimableForTier([floored(3)], { workerTierRank: 3, tieringActive: false, preFiltered: true });
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
