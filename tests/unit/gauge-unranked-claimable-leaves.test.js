/**
 * SD-LEO-INFRA-GUARANTEE-CLAIMABLE-SD-RANKED-001-D (FR-4)
 *
 * The eligible-but-unranked-leaf-count invariant gauge: of the SDs coordinator-backlog-rank.mjs's
 * own claimable-leaf computation (computeClaimableLeaves) considers claimable, how many lack a
 * dispatch_rank fresh enough for worker-checkin.cjs to actually honor (DISPATCH_RANK_TTL_MS)?
 * >0 = drift — the rank-on-transition + periodic-cron belt-and-suspenders did not hold.
 *
 * Importing either module must NOT run a DB-touching pass (entrypoint guard).
 */
import { describe, it, expect } from 'vitest';
import { isFreshlyRanked, countUnrankedClaimableLeaves } from '../../scripts/gauge-unranked-claimable-leaves.mjs';
import { computeClaimableLeaves } from '../../scripts/coordinator-backlog-rank.mjs';
import { DISPATCH_RANK_TTL_MS } from '../../scripts/worker-checkin.cjs';

const NOW = 1_800_000_000_000; // fixed reference instant

const leaf = (sd_key, metadataOverrides = {}) => ({ sd_key, metadata: { ...metadataOverrides } });

describe('isFreshlyRanked', () => {
  it('is fresh when dispatch_rank + dispatch_rank_at are set within the TTL', () => {
    const sd = leaf('SD-A', { dispatch_rank: 1, dispatch_rank_at: new Date(NOW - 1000).toISOString() });
    expect(isFreshlyRanked(sd, NOW)).toBe(true);
  });

  it('is NOT fresh when dispatch_rank_at is older than DISPATCH_RANK_TTL_MS', () => {
    const sd = leaf('SD-B', { dispatch_rank: 1, dispatch_rank_at: new Date(NOW - DISPATCH_RANK_TTL_MS - 1000).toISOString() });
    expect(isFreshlyRanked(sd, NOW)).toBe(false);
  });

  it('is NOT fresh when dispatch_rank is absent entirely (never ranked)', () => {
    expect(isFreshlyRanked(leaf('SD-C'), NOW)).toBe(false);
  });

  it('is NOT fresh when dispatch_rank is set but dispatch_rank_at is missing (malformed stamp)', () => {
    const sd = leaf('SD-D', { dispatch_rank: 1 });
    expect(isFreshlyRanked(sd, NOW)).toBe(false);
  });

  it('handles a missing metadata object without throwing', () => {
    expect(isFreshlyRanked({ sd_key: 'SD-E' }, NOW)).toBe(false);
  });
});

describe('countUnrankedClaimableLeaves', () => {
  it('counts zero when every claimable leaf is freshly ranked (the healthy/clean state)', () => {
    const claimable = [
      leaf('SD-A', { dispatch_rank: 1, dispatch_rank_at: new Date(NOW - 1000).toISOString() }),
      leaf('SD-B', { dispatch_rank: 2, dispatch_rank_at: new Date(NOW - 2000).toISOString() }),
    ];
    expect(countUnrankedClaimableLeaves(claimable, NOW)).toEqual({ count: 0, keys: [] });
  });

  it('counts and names each claimable leaf lacking a fresh rank (the drift state)', () => {
    const claimable = [
      leaf('SD-A', { dispatch_rank: 1, dispatch_rank_at: new Date(NOW - 1000).toISOString() }), // fresh
      leaf('SD-B'), // never ranked
      leaf('SD-C', { dispatch_rank: 3, dispatch_rank_at: new Date(NOW - DISPATCH_RANK_TTL_MS - 1000).toISOString() }), // stale
    ];
    expect(countUnrankedClaimableLeaves(claimable, NOW)).toEqual({ count: 2, keys: ['SD-B', 'SD-C'] });
  });

  it('handles an empty claimable pool', () => {
    expect(countUnrankedClaimableLeaves([], NOW)).toEqual({ count: 0, keys: [] });
  });

  it('handles a null/undefined claimable pool without throwing', () => {
    expect(countUnrankedClaimableLeaves(undefined, NOW)).toEqual({ count: 0, keys: [] });
  });
});

describe('reuse, not re-derivation', () => {
  it('coordinator-backlog-rank.mjs exports computeClaimableLeaves for the gauge to reuse', () => {
    expect(typeof computeClaimableLeaves).toBe('function');
  });

  it('both modules import cleanly without running a DB pass (entrypoint guard)', () => {
    expect(typeof isFreshlyRanked).toBe('function');
    expect(typeof countUnrankedClaimableLeaves).toBe('function');
  });
});
