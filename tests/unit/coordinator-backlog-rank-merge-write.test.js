/**
 * SD-LEO-INFRA-GUARANTEE-CLAIMABLE-SD-RANKED-001-C (FR-5): the atomic JSONB merge write path
 * that replaced coordinator-backlog-rank.mjs's read-spread-write full-metadata-blob update.
 *
 * buildRankPatch/buildRankMergeQuery are pure — extracted so the query shape (and, critically,
 * that it touches ONLY the 3 dispatch_rank* keys via a `||` merge) is provable without a live
 * pg connection. TS-3's concurrency claim ("neither writer's output is lost") reduces to a pure
 * structural fact once both writers use `||`-merge semantics instead of full-blob overwrites —
 * that structural proof is what the "simulated concurrency" test below encodes.
 */
import { describe, it, expect } from 'vitest';
import { buildRankPatch, buildRankMergeQuery } from '../../scripts/coordinator-backlog-rank.mjs';
import { buildClearReviewQuery } from '../../lib/coordinator/clear-coordinator-review.js';

describe('SD-LEO-INFRA-GUARANTEE-CLAIMABLE-SD-RANKED-001-C: buildRankPatch/buildRankMergeQuery', () => {
  it('buildRankPatch returns exactly the 3 dispatch_rank* keys (mirrors stripDispatchRank\'s key set)', () => {
    const patch = buildRankPatch(3, '2026-07-01T00:00:00.000Z', 'session-abc');
    expect(Object.keys(patch).sort()).toEqual(['dispatch_rank', 'dispatch_rank_at', 'dispatch_rank_by'].sort());
    expect(patch).toEqual({ dispatch_rank: 3, dispatch_rank_at: '2026-07-01T00:00:00.000Z', dispatch_rank_by: 'session-abc' });
  });

  it('buildRankMergeQuery uses a JSONB || merge, not a full-column overwrite', () => {
    const { sql, params } = buildRankMergeQuery({ dispatch_rank: 1, dispatch_rank_at: 'now', dispatch_rank_by: 'x' }, 'SD-TEST-001');
    expect(sql).toMatch(/metadata\s*\|\|\s*\$1::jsonb/);
    expect(sql).not.toMatch(/SET metadata = \$1/); // guards against regressing to a full-blob SET
    expect(params[0]).toBe(JSON.stringify({ dispatch_rank: 1, dispatch_rank_at: 'now', dispatch_rank_by: 'x' }));
    expect(params[1]).toBe('SD-TEST-001');
  });
});

describe('SD-LEO-INFRA-GUARANTEE-CLAIMABLE-SD-RANKED-001-C: TS-3 concurrency-safety (structural proof)', () => {
  it('a rank-write patch and a clear-review patch touch disjoint metadata keys', () => {
    const rankPatch = buildRankPatch(5, '2026-07-01T00:00:00.000Z', 'coordinator');
    const clearPatch = { needs_coordinator_review: false };
    const overlap = Object.keys(rankPatch).filter((k) => k in clearPatch);
    expect(overlap).toEqual([]); // no shared key -> `||` merges from either writer can never clobber the other
  });

  it('applying both patches via JSONB || semantics survives regardless of interleaving order', () => {
    // Simulates Postgres `metadata || patch` semantics (shallow merge, patch keys win) — this is
    // exactly what buildRankMergeQuery / buildClearReviewQuery issue server-side. Because the two
    // patches touch disjoint keys (proven above), applying them in EITHER order yields the same
    // final object with both writers' output intact — the read-spread-write race this SD closes
    // is structurally impossible once every writer uses `||`-merge instead of a full blob rewrite.
    const base = { needs_coordinator_review: true, some_other_key: 'untouched', dispatch_rank: 9 };
    const rankPatch = buildRankPatch(1, '2026-07-01T00:05:00.000Z', 'coordinator');
    const clearPatch = { needs_coordinator_review: false };

    const rankThenClear = { ...base, ...rankPatch, ...clearPatch };
    const clearThenRank = { ...base, ...clearPatch, ...rankPatch };

    for (const merged of [rankThenClear, clearThenRank]) {
      expect(merged.needs_coordinator_review).toBe(false); // clear survives
      expect(merged.dispatch_rank).toBe(1); // rank survives
      expect(merged.dispatch_rank_at).toBe('2026-07-01T00:05:00.000Z');
      expect(merged.some_other_key).toBe('untouched'); // unrelated concurrent metadata is never clobbered
    }
  });

  it('buildClearReviewQuery uses the same `||`-merge shape (no full-blob overwrite)', () => {
    const { sql, params } = buildClearReviewQuery('SD-TEST-002');
    expect(sql).toMatch(/metadata\s*\|\|\s*'\{"needs_coordinator_review":\s*false\}'::jsonb/);
    expect(params).toEqual(['SD-TEST-002']);
  });
});
