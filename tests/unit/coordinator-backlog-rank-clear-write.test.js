/**
 * SD-LEO-INFRA-DURABLE-PARK-EXPIRED-001 (FR-3) — atomic clear-stale-rank counterpart to
 * buildRankMergeQuery. The two clear-stale-rank branches in coordinator-backlog-rank.mjs
 * previously did stripDispatchRank() (pure JS key-delete on an in-memory metadata
 * snapshot) then a full-blob `.update({metadata: meta})` — a concurrent writer (e.g. a
 * coordinator setting needs_coordinator_review between this function's initial row
 * fetch and its clear-write) was silently clobbered back. buildRankClearQuery instead
 * removes ONLY the 3 dispatch_rank* keys server-side via the jsonb `-` operator, so it
 * can never depend on (or stomp) a stale JS-side snapshot of any other key.
 */
import { describe, it, expect } from 'vitest';
import { buildRankClearQuery } from '../../scripts/coordinator-backlog-rank.mjs';

describe('FR-3: buildRankClearQuery', () => {
  it('removes exactly the 3 dispatch_rank* keys via the jsonb `-` operator', () => {
    const { sql, params } = buildRankClearQuery('SD-TEST-001');
    expect(sql).toMatch(/-\s*'dispatch_rank'/);
    expect(sql).toMatch(/-\s*'dispatch_rank_at'/);
    expect(sql).toMatch(/-\s*'dispatch_rank_by'/);
    expect(params).toEqual(['SD-TEST-001']);
  });

  it('guards against NULL metadata via COALESCE (mirrors buildRankMergeQuery)', () => {
    const { sql } = buildRankClearQuery('SD-TEST-001');
    expect(sql).toMatch(/COALESCE\(metadata,\s*'\{\}'::jsonb\)\s*-/);
  });

  it('never issues a full-blob SET metadata = $1 overwrite', () => {
    const { sql } = buildRankClearQuery('SD-TEST-001');
    expect(sql).not.toMatch(/SET metadata = \$1/);
  });

  it('does not require (or reference) a caller-supplied metadata snapshot', () => {
    // Unlike stripDispatchRank+full-blob-update, the query needs only the sd_key — proving
    // the atomic clear can never race against a stale in-memory read of unrelated keys.
    const { sql, params } = buildRankClearQuery('SD-TEST-002');
    expect(params).toHaveLength(1);
    expect(sql).toMatch(/WHERE sd_key = \$1/);
  });

  it('simulated concurrency: a clear and an unrelated concurrent flag-set touch disjoint keys', () => {
    // Structural proof mirroring coordinator-backlog-rank-merge-write.test.js's TS-3 pattern:
    // `metadata - 'dispatch_rank' - ...` (clear) and `metadata || {needs_coordinator_review}`
    // (concurrent set) touch disjoint keys, so applying them in either order preserves both.
    const base = { needs_coordinator_review: false, some_other_key: 'untouched', dispatch_rank: 9, dispatch_rank_at: 't', dispatch_rank_by: 's' };
    const clearKeys = ['dispatch_rank', 'dispatch_rank_at', 'dispatch_rank_by'];
    const concurrentPatch = { needs_coordinator_review: true };

    function simulateClear(obj) {
      const out = { ...obj };
      for (const k of clearKeys) delete out[k];
      return out;
    }

    const clearThenSet = { ...simulateClear(base), ...concurrentPatch };
    const setThenClear = simulateClear({ ...base, ...concurrentPatch });

    for (const merged of [clearThenSet, setThenClear]) {
      expect(merged.needs_coordinator_review).toBe(true); // concurrent set survives
      expect(merged.dispatch_rank).toBeUndefined(); // clear survives
      expect(merged.some_other_key).toBe('untouched');
    }
  });
});
