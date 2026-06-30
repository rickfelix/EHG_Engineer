/**
 * SD-LEO-INFRA-TIER-RANK-STARVATION-DURABLE-FIX-001 (FR-4) — regression tests for the three durable
 * guards that close the tier-rank starvation chain (6cf5c558 / RCA Adam 47b15430):
 *   FR-1  the stamper SELECT carries no phantom column (estimated_loc is NOT a strategic_directives_v2
 *         column; selecting it errored on every run -> nothing stamped -> fleet starved).
 *   FR-2  the tier-gate FAILS OPEN on an UNDEFINED/non-finite min_tier_rank (an unstamped SD is
 *         claimable-by-any-tier, never silently above-rung), while a FINITE above-rung rank is blocked.
 *   FR-3  stamp-at-creation: stampPayload yields a finite rank, and the createSD gap-fill preserves an
 *         already-present (Adam-sourced/inherited) rank.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { STAMP_SELECT_COLS } from '../../../scripts/stamp-sd-tier-rank.mjs';
import { computeMinTierRank, stampPayload } from '../../../lib/fleet/sd-tier-rank.mjs';

const require = createRequire(import.meta.url);
const { classifyDispatchIneligibility } = require('../../../lib/fleet/claim-eligibility.cjs');
const { claimableForTier } = require('../../../lib/fleet/tier-claimable.cjs');

// The real, current columns on strategic_directives_v2 the stamper is allowed to SELECT.
const REAL_SD_COLUMNS = new Set([
  'sd_key', 'sd_type', 'title', 'description', 'scope', 'strategic_intent', 'metadata',
]);

describe('FR-1: stamper SELECT carries no phantom column', () => {
  it('STAMP_SELECT_COLS lists only real strategic_directives_v2 columns (no estimated_loc)', () => {
    const cols = STAMP_SELECT_COLS.split(',').map((c) => c.trim()).filter(Boolean);
    expect(cols.length).toBeGreaterThan(0);
    expect(cols).not.toContain('estimated_loc'); // the phantom column that broke every stamp
    for (const c of cols) expect(REAL_SD_COLUMNS.has(c)).toBe(true);
  });

  it('still selects metadata (computeMinTierRank falls back to metadata.estimated_loc)', () => {
    expect(STAMP_SELECT_COLS).toContain('metadata');
  });
});

describe('FR-2: the tier-gate fails OPEN on an undefined min_tier_rank', () => {
  const unscored = { sd_key: 'SD-U', metadata: {} };               // no min_tier_rank
  const nonFinite = { sd_key: 'SD-NF', metadata: { min_tier_rank: 'x' } };
  const ranked4 = { sd_key: 'SD-R4', metadata: { min_tier_rank: 4 } };

  it('classifyDispatchIneligibility does NOT block an undefined-rank SD (claimable by any rung incl. tier-1)', () => {
    for (const rung of [1, 2, 3, 4]) {
      expect(classifyDispatchIneligibility(unscored, { tiering_active: true, worker_tier_rank: rung }))
        .not.toBe('above_worker_tier');
      expect(classifyDispatchIneligibility(nonFinite, { tiering_active: true, worker_tier_rank: rung }))
        .not.toBe('above_worker_tier');
    }
  });

  it('still blocks a FINITE min_tier_rank that exceeds the worker rung (WORK-DOWN-NEVER-UP preserved)', () => {
    expect(classifyDispatchIneligibility(ranked4, { tiering_active: true, worker_tier_rank: 3 }))
      .toBe('above_worker_tier');
    // a worker at/above the rank is NOT blocked
    expect(classifyDispatchIneligibility(ranked4, { tiering_active: true, worker_tier_rank: 4 }))
      .not.toBe('above_worker_tier');
  });

  it('claimableForTier includes an unscored SD for every rung, excludes a finite-above-rung one', () => {
    const pool = [unscored, ranked4];
    // preFiltered: true -> exercise the TIER axis only (these minimal stubs are not full base-eligible rows).
    const keys = (rung) => claimableForTier(pool, { workerTierRank: rung, tieringActive: true, preFiltered: true }).map((s) => s.sd_key);
    expect(keys(1)).toContain('SD-U');   // unscored reachable by tier-1
    expect(keys(3)).toContain('SD-U');
    expect(keys(3)).not.toContain('SD-R4'); // rank-4 above a tier-3 worker
    expect(keys(4)).toContain('SD-R4');     // reachable by tier-4
  });
});

describe('FR-3: stamp-at-creation yields a finite rank + gap-fill preserves an existing one', () => {
  it('stampPayload returns a finite min_tier_rank for a typical SD', () => {
    const sd = { sd_type: 'infrastructure', title: 'X', description: 'Y', metadata: {} };
    const { min_tier_rank } = stampPayload(sd);
    expect(Number.isFinite(min_tier_rank)).toBe(true);
    expect(min_tier_rank).toBe(computeMinTierRank(sd));
  });

  it('the createSD gap-fill guard preserves an already-present finite rank (never overwrites)', () => {
    // Mirror the createSD FR-3 gap-fill predicate: only stamp when no finite rank exists.
    const gapFill = (metadata) => {
      if (!Number.isFinite(Number(metadata?.min_tier_rank))) {
        return { ...metadata, ...stampPayload({ sd_type: 'bug', metadata }) };
      }
      return metadata;
    };
    // existing Adam-sourced rank is preserved
    expect(gapFill({ min_tier_rank: 2 }).min_tier_rank).toBe(2);
    // unstamped -> gets a finite rank
    expect(Number.isFinite(gapFill({}).min_tier_rank)).toBe(true);
  });
});
