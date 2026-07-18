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
    expect(sql).toMatch(/\|\|\s*\$1::jsonb/);
    expect(sql).not.toMatch(/SET metadata = \$1/); // guards against regressing to a full-blob SET
    expect(params[0]).toBe(JSON.stringify({ dispatch_rank: 1, dispatch_rank_at: 'now', dispatch_rank_by: 'x' }));
    expect(params[1]).toBe('SD-TEST-001');
  });

  // Adversarial review (ship gate): NULL::jsonb || '{...}'::jsonb evaluates to NULL in real
  // Postgres, verified live — an unguarded merge on a NULL-metadata row would silently WIPE
  // the whole blob while reporting success. This asserts the SQL TEXT carries the COALESCE
  // guard; a plain-JS spread simulation (as used below for the disjoint-key proof) would NOT
  // have caught this, since `{...null, ...patch}` silently no-ops instead of nulling out.
  it('buildRankMergeQuery guards against NULL metadata via COALESCE (Postgres NULL || jsonb = NULL)', () => {
    const { sql } = buildRankMergeQuery({ dispatch_rank: 1, dispatch_rank_at: 'now', dispatch_rank_by: 'x' }, 'SD-TEST-001');
    expect(sql).toMatch(/COALESCE\(metadata,\s*'\{\}'::jsonb\)\s*\|\|/);
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
    expect(sql).toMatch(/\|\|\s*'\{"needs_coordinator_review":\s*false\}'::jsonb/);
    // SD-LEO-INFRA-PLAN-LINKAGE-BELT-001 (FR-1b): params now carry the classified default
    // unlinked_reason as $2, for the CASE WHEN plan_linkage IS NULL fragment.
    expect(params).toEqual(['SD-TEST-002', 'emergent-fix']);
  });

  it('buildClearReviewQuery also guards against NULL metadata via COALESCE', () => {
    const { sql } = buildClearReviewQuery('SD-TEST-002');
    expect(sql).toMatch(/COALESCE\(metadata,\s*'\{\}'::jsonb\)\s*\|\|/);
  });

  // Adversarial review (ship gate): documents exactly why the "applying both patches via
  // JSONB || semantics" test above cannot substitute for a NULL-safety check. JS object
  // spread on a null base silently no-ops (the spread is just skipped) — Postgres
  // `NULL::jsonb || '{...}'::jsonb` instead evaluates the WHOLE expression to NULL, wiping
  // the row. The two are NOT equivalent, which is why NULL-safety is asserted against the
  // SQL TEXT (COALESCE) above rather than via a JS-level merge simulation.
  it('documents the JS-spread-vs-Postgres-NULL semantics gap that motivated the COALESCE fix', () => {
    const patch = { needs_coordinator_review: false };
    const jsSimulatedResult = { ...null, ...patch }; // JS: silently ignores the null base
    expect(jsSimulatedResult).toEqual(patch); // looks "safe" in JS...
    // ...but real Postgres `NULL::jsonb || '{"needs_coordinator_review":false}'::jsonb` is NULL,
    // not `{"needs_coordinator_review":false}` — a JS-only proof would have missed this class
    // of bug entirely, which is exactly what the adversarial review flagged.
  });
});
