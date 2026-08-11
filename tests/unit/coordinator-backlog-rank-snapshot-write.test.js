/**
 * SD-LEO-INFRA-DRIVE-SCORE-LEG2-001 (FR-1/TR-1/TR-2): the ranked-top-5 SNAPSHOT write.
 *
 * buildRankSnapshotInsertQuery is pure — extracted so the query shape (INSERT into a table
 * SEPARATE from strategic_directives_v2, never touching the metadata column buildRankMergeQuery/
 * buildRankClearQuery mutate) is provable without a live pg connection, mirroring the sibling
 * coordinator-backlog-rank-merge-write.test.js for buildRankMergeQuery.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRankSnapshotInsertQuery, RANK_SNAPSHOT_TOP_N } from '../../scripts/coordinator-backlog-rank.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RANKER = path.join(__dirname, '../../scripts/coordinator-backlog-rank.mjs');
const code = () => fs.readFileSync(RANKER, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('SD-LEO-INFRA-DRIVE-SCORE-LEG2-001: buildRankSnapshotInsertQuery', () => {
  it('returns null for an empty top-5 (zero ranked candidates) — no partial/inconsistent cohort write', () => {
    expect(buildRankSnapshotInsertQuery([], '2026-08-06T09:00:00.000Z')).toBeNull();
    expect(buildRankSnapshotInsertQuery(undefined, '2026-08-06T09:00:00.000Z')).toBeNull();
  });

  it('inserts into drive_rank_snapshots, never touches strategic_directives_v2.metadata (R5)', () => {
    const { sql } = buildRankSnapshotInsertQuery(['SD-A', 'SD-B'], '2026-08-06T09:00:00.000Z');
    expect(sql).toMatch(/INSERT INTO drive_rank_snapshots/);
    expect(sql).not.toMatch(/UPDATE|SET metadata/i); // structurally cannot clobber a concurrent metadata write
  });

  it('resolves sd_id server-side via a JOIN on sd_key, never trusting a JS-side id (this ranker only ever holds sd_key)', () => {
    const { sql, params } = buildRankSnapshotInsertQuery(['SD-A', 'SD-B'], '2026-08-06T09:00:00.000Z');
    expect(sql).toMatch(/JOIN strategic_directives_v2 sd ON sd\.sd_key = t\.sd_key/);
    expect(params[0]).toBe('2026-08-06T09:00:00.000Z');
    expect(params[1]).toEqual(['SD-A', 'SD-B']);
  });

  it('rank is derived from array position via WITH ORDINALITY, not passed from the caller', () => {
    const { sql } = buildRankSnapshotInsertQuery(['SD-A', 'SD-B', 'SD-C'], '2026-08-06T09:00:00.000Z');
    expect(sql).toMatch(/WITH ORDINALITY AS t\(sd_key, ord\)/);
    expect(sql).toMatch(/t\.ord::int/);
  });

  it('ON CONFLICT DO NOTHING — a retried insert for the same cohort is a no-op, never an error or an update', () => {
    const { sql } = buildRankSnapshotInsertQuery(['SD-A'], '2026-08-06T09:00:00.000Z');
    expect(sql).toMatch(/ON CONFLICT \(ranked_at, rank\) DO NOTHING/);
  });

  it('RANK_SNAPSHOT_TOP_N is exactly 5 — leg2_uptake\'s own spec is the ranked TOP-5, not the full claimable list', () => {
    expect(RANK_SNAPSHOT_TOP_N).toBe(5);
  });
});

/**
 * [WIRING] main() actually CALLS buildRankSnapshotInsertQuery — the R6 class (armed logic with
 * no dispatcher) applied to the PRODUCER side. TESTING sub-agent evidence 9b288540 mutation-
 * tested this: deleting the entire snapshot-write block from main() left 531/531 tests green,
 * because every test above exercises the pure query builder in isolation and nothing asserted
 * main() ever reaches it. Mirrors drive-report-wiring.test.js's TS-9 assertion for the consumer
 * side (readLeg2Cohort/computeLeg2) — this is the same class of gap, on the write path instead
 * of the read path.
 */
describe('SD-LEO-INFRA-DRIVE-SCORE-LEG2-001: [WIRING] main() calls the snapshot writer', () => {
  it('main() calls buildRankSnapshotInsertQuery with the top-5 slice, guarded by !DRY && pgClient', () => {
    const src = code();
    expect(src, 'main() must call the snapshot-insert query builder').toMatch(/buildRankSnapshotInsertQuery\(/);
    expect(src, 'must slice to the top-N (RANK_SNAPSHOT_TOP_N), not the full claimable list').toMatch(
      /claimable\.slice\(0,\s*RANK_SNAPSHOT_TOP_N\)/
    );
    expect(src, 'the write must be gated by the same !DRY && pgClient guard as the rank writes above it').toMatch(
      /if\s*\(!DRY\s*&&\s*pgClient\)\s*\{[\s\S]{0,400}?buildRankSnapshotInsertQuery\(/
    );
    expect(src, 'and actually executed via the pg client, not just constructed').toMatch(
      /buildRankSnapshotInsertQuery\([\s\S]{0,200}?pgClient\.query\(snapQuery\.sql,\s*snapQuery\.params\)/
    );
  });

  it('[TS-12/R10] the snapshot write shares the SAME `now` the rank writes use — one cohort, one timestamp', () => {
    // A second, independently-read clock here would let the snapshot cohort and the SD rows it
    // references disagree about "when" — exactly the class this SD's window-anchor math depends
    // on staying single-sourced.
    const src = code();
    expect(src, 'the snapshot insert must reuse the loop\'s own `now`, not re-derive a second timestamp').toMatch(
      /buildRankSnapshotInsertQuery\(top5SdKeys,\s*now\)/
    );
  });
});
