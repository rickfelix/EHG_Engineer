/**
 * SD-LEO-INFRA-DRIVE-SCORE-LEG1-ALOCAL-001 — leg1 A-LOCAL: landed means SD-key end-anchored in a
 * main merge-commit subject, measured over a completed-items window, scored proportionally.
 *
 * Supersedes lib/drive-loop/score/leg1-landed.js's merge-base-ancestry rule (kept as
 * reference-only — see its header amendment). Three properties this file exists to prove, each
 * corresponding to a real defect found during PLAN/EXEC-phase adversarial review (VALIDATION
 * evidence 9a48cac4, TESTING evidence 8606170f + 7b22c9ee, SECURITY evidence f84884eb):
 *
 *   ANCHORING — a naive substring grep reports a PARENT SD landed off a CHILD's merge, because
 *   child keys extend the parent's key as a string. Measured over 5608 real sd_key values: the
 *   no-separator shape ('-001' vs '-001A') collides 103 times, the hyphenated shape ('-001' vs
 *   '-001-B') collides 1583 times — both guarded here, not just the more obvious one.
 *
 *   PROPORTIONAL SCORING — all-or-nothing (the OLD leg's shape) would zero the whole leg on a
 *   real, measured false-negative tail (squash-merges with no merge commit; renamed/abbreviated
 *   landed keys). Proportional scoring reports that tail as an honest partial measurement.
 *
 *   NEVER A FALSE ZERO ON FAILURE — SECURITY found that a shallow clone (GitHub Actions' default
 *   fetch-depth:1) makes `git log main --merges` exit 0 with ZERO subjects: indistinguishable
 *   from "nothing merged" unless treated as a measurement failure explicitly. scoreLeg1ALocal
 *   NEVER THROWS and NEVER scores an empty/errored corpus as "0 landed".
 */

import { describe, it, expect } from 'vitest';
import {
  isSdLandedInMainHistory,
  fetchMergeSubjects,
  scoreLeg1ALocal,
  anchoredKeyPattern,
  mergeLogArgs,
  LEG_ID,
  LEG_POINTS,
} from '../../../../lib/drive-loop/score/leg1-landed-alocal.js';

describe('isSdLandedInMainHistory — end-anchored match against an already-fetched corpus', () => {
  it('[TS-1, positive] a subject containing the exact key, end-anchored, measures landed', () => {
    const subjects = ['Merge pull request #6950 from rickfelix/feat/SD-LEO-INFRA-DRIVE-SCORE-LEG1-001'];
    expect(isSdLandedInMainHistory('SD-LEO-INFRA-DRIVE-SCORE-LEG1-001', subjects)).toBe(true);
  });

  it('[TS-2, negative] a fabricated never-landed key measures NOT landed', () => {
    const subjects = ['Merge pull request #1 from rickfelix/feat/SD-SOME-OTHER-001'];
    expect(isSdLandedInMainHistory('SD-FAKE-NEVER-MERGED-001', subjects)).toBe(false);
  });

  it("[TS-3a, end-anchor: hyphenated child suffix] a parent key is NOT landed off its child's merge", () => {
    // Real collision shape found during PLAN research: DRIVE-LOOP-INSTRUMENT-001 (parent) has 0
    // end-anchored merges of its own but 5 substring hits, all belonging to -001-B/-C/-D/-E.
    const subjects = ['Merge pull request #1 from rickfelix/feat/SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B'];
    expect(
      isSdLandedInMainHistory('SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001', subjects),
      'the parent key is a hyphenated PREFIX of the merged child key — must not read as landed',
    ).toBe(false);
  });

  it('[TS-3b, end-anchor: no-separator child suffix — the DOMINANT real collision shape] a parent key is NOT landed off a no-separator child variant', () => {
    // Measured 103 pairs across 5608 real SD keys (TESTING evidence 8606170f) — 100x more common
    // than the hyphenated shape above, and previously unguarded by any existing helper.
    const subjects = ['Merge pull request #1 from rickfelix/feat/SD-LEO-INFRA-CONTEXT-AWARE-LLM-001A'];
    expect(isSdLandedInMainHistory('SD-LEO-INFRA-CONTEXT-AWARE-LLM-001', subjects)).toBe(false);
  });

  it('a key at true line-end (no trailing character at all) still matches', () => {
    expect(isSdLandedInMainHistory('SD-X-001', ['...from rickfelix/feat/SD-X-001'])).toBe(true);
  });

  it('a dot in the key is escaped, not treated as a wildcard', () => {
    // Keys can contain '.' (e.g. SD-UNIFIED-PATH-1.1) — an unescaped '.' would match ANY
    // character, silently widening the match to unrelated keys.
    const pattern = anchoredKeyPattern('SD-UNIFIED-PATH-1.1');
    expect(pattern.test('Merge SD-UNIFIED-PATH-1X1'), 'unescaped dot would wrongly match here').toBe(false);
    expect(pattern.test('Merge SD-UNIFIED-PATH-1.1')).toBe(true);
  });

  it('refuses non-array subjects rather than silently returning false', () => {
    expect(() => isSdLandedInMainHistory('SD-X-001', undefined)).toThrow(/subjects must be an array/);
  });

  it('the permitted git question is fixed and inspectable', () => {
    expect(mergeLogArgs()).toEqual(['log', 'main', '--merges', '--format=%s']);
    expect(mergeLogArgs({ sinceIso: '2026-01-01T00:00:00Z' }))
      .toEqual(['log', 'main', '--merges', '--format=%s', '--since=2026-01-01T00:00:00Z']);
  });
});

describe('fetchMergeSubjects — the one place production shells out', () => {
  it('refuses to run without an injected runGitLog rather than shelling out silently', () => {
    expect(() => fetchMergeSubjects({})).toThrow(/runGitLog must be injected/);
  });

  it('passes through whatever the injected runner returns', () => {
    const subjects = fetchMergeSubjects({ runGitLog: () => ['a', 'b'] });
    expect(subjects).toEqual(['a', 'b']);
  });
});

describe('scoreLeg1ALocal — fetches ONCE, proportional scoring, never a false zero on failure', () => {
  it('[TS-5, denominator-zero guard] items with no resolvable sd_key never score 0/0=NaN', () => {
    const r = scoreLeg1ALocal({ items: [{ item_id: 'd1', sd_key: null }], runGitLog: () => [] });
    expect(r.leg).toBe(LEG_ID);
    expect(r.unavailable, 'must be the unavailable shape, never a points node with NaN').toBeDefined();
    expect(r.points, 'no points node when unavailable').toBeUndefined();
    expect(r.unavailable.available).toBe(false);
    expect(r.unavailable.value).toBe(null);
  });

  it('[SECURITY f84884eb, S1/S2] fetches the git-log corpus EXACTLY ONCE, not once per key', () => {
    let calls = 0;
    const runGitLog = () => { calls += 1; return ['Merge pull request #1 from rickfelix/feat/SD-A-001']; };
    scoreLeg1ALocal({
      items: [
        { item_id: 'a', sd_key: 'SD-A-001' },
        { item_id: 'b', sd_key: 'SD-B-001' },
        { item_id: 'c', sd_key: 'SD-C-001' },
      ],
      runGitLog,
    });
    expect(calls, 'N unique keys must not mean N git spawns re-reading the same history').toBe(1);
  });

  it('[SECURITY f84884eb, S1] an EMPTY corpus (the shallow-clone / fetch-depth:1 case) is a measurement failure, never "0 landed"', () => {
    const r = scoreLeg1ALocal({ items: [{ item_id: 'a', sd_key: 'SD-A-001' }], runGitLog: () => [] });
    expect(r.unavailable, 'zero subjects must degrade to unavailable, never a false 0/2').toBeDefined();
    expect(r.points).toBeUndefined();
    expect(r.unavailable.reason).toMatch(/zero subject lines/);
  });

  it('[TESTING 7b22c9ee, F2] a throwing runGitLog (e.g. main genuinely unresolvable) degrades to unavailable, never propagates', () => {
    const runGitLog = () => { throw new Error('fatal: bad revision \'main\''); };
    expect(() => scoreLeg1ALocal({ items: [{ item_id: 'a', sd_key: 'SD-A-001' }], runGitLog })).not.toThrow();
    const r = scoreLeg1ALocal({ items: [{ item_id: 'a', sd_key: 'SD-A-001' }], runGitLog });
    expect(r.unavailable).toBeDefined();
    expect(r.unavailable.reason).toMatch(/git log failed/);
    expect(r.unavailable.reason).toMatch(/bad revision/);
  });

  it('[TS-6, dedupe + null-exclusion guard] duplicate and null sd_key entries do not distort the denominator', () => {
    const runGitLog = () => ['Merge pull request #1 from rickfelix/feat/SD-LANDED-001'];
    const r = scoreLeg1ALocal({
      items: [
        { item_id: 'a', sd_key: 'SD-LANDED-001' },
        { item_id: 'b', sd_key: 'SD-LANDED-001' }, // duplicate promotion — measured real at PLAN
        { item_id: 'c', sd_key: null },             // excluded, not a failure
      ],
      runGitLog,
    });
    // Deduped denominator = 1 unique key, which landed — full LEG_POINTS, not diluted by the
    // duplicate or the null.
    expect(r.points.value).toBe(LEG_POINTS);
    expect(r.landed_count.value).toBe(1);
  });

  it('proportional scoring: a PARTIAL landed population is neither 0 nor full LEG_POINTS', () => {
    // All-or-nothing (the OLD leg's shape) would score this 0 — the exact false-negative-tail
    // trap PLAN research found (squash-merges, renamed keys) would then zero an honestly-mostly-
    // measured leg.
    const runGitLog = () => ['Merge pull request #1 from rickfelix/feat/SD-LANDED-001'];
    const r = scoreLeg1ALocal({
      items: [
        { item_id: 'a', sd_key: 'SD-LANDED-001' },
        { item_id: 'b', sd_key: 'SD-NOT-LANDED-001' },
      ],
      runGitLog,
    });
    expect(r.points.value).toBe(1); // LEG_POINTS(2) * 1/2
    expect(r.points.value).toBeGreaterThan(0);
    expect(r.points.value).toBeLessThan(LEG_POINTS);
    expect(r.landed_count.value).toBe(1);
  });

  it('points.value is rounded to 2 decimals', () => {
    const runGitLog = () => ['Merge pull request #1 from rickfelix/feat/SD-LANDED-001'];
    const r = scoreLeg1ALocal({
      items: [
        { item_id: 'a', sd_key: 'SD-LANDED-001' },
        { item_id: 'b', sd_key: 'SD-X-002' },
        { item_id: 'c', sd_key: 'SD-X-003' },
      ],
      runGitLog,
    });
    // 2 * 1/3 = 0.6666... -> rounded to 0.67. Unrounded, this reaches an append-only table
    // (drive_score has no UPDATE/DELETE) and a chairman-facing SMS with no existing guard.
    expect(r.points.value).toBe(0.67);
  });

  it('the points citation discloses the false-positive tail (revert-shaped / prose-mention merges)', () => {
    // SECURITY evidence f84884eb (S3): the predicate is satisfiable by TEXT, not verified
    // landed code — a revert-shaped merge or a bare mention also end-anchor-matches. Disclosed
    // via cite()'s limitation field, never silently absorbed.
    const runGitLog = () => ['Merge pull request #1 from rickfelix/feat/SD-LANDED-001'];
    const r = scoreLeg1ALocal({ items: [{ item_id: 'a', sd_key: 'SD-LANDED-001' }], runGitLog });
    expect(r.points.limitation).toMatch(/FALSE POSITIVE/);
    expect(r.points.limitation).toMatch(/[Rr]evert/);
  });

  it('refuses to run without an injected runGitLog', () => {
    expect(() => scoreLeg1ALocal({ items: [{ sd_key: 'SD-X-001' }] })).toThrow(/runGitLog must be injected/);
  });

  it('items without a resolvable sd_key are excluded from the denominator, stated in the predicate', () => {
    const runGitLog = () => ['Merge pull request #1 from rickfelix/feat/SD-LANDED-001'];
    const r = scoreLeg1ALocal({
      items: [
        { item_id: 'a', sd_key: 'SD-LANDED-001' },
        { item_id: 'b', sd_key: null },
        { item_id: 'c' }, // sd_key entirely absent
      ],
      runGitLog,
    });
    expect(r.points.value).toBe(LEG_POINTS);
    expect(r.points.predicate).toMatch(/excluded from the denominator/);
  });
});

/**
 * A minimal Supabase-shaped fake sufficient to drive computePlanCheckStatus end to end, mirroring
 * the proven pattern in tests/unit/roadmap/plan-check-uncapped-pagination.test.js's
 * makeRangeAwareSupabase (not imported — that helper is file-local — but the row shapes below are
 * the exact ones proven to satisfy resolveCanonicalRoadmap + computePlanCheckStatus there).
 */
function makeFakeSupabaseFor(tables) {
  const from = (table) => {
    let rows = [...(tables[table] || [])];
    const b = {
      select() { return b; },
      eq(col, val) { rows = rows.filter((r) => r[col] === val); return b; },
      in(col, vals) { rows = rows.filter((r) => vals.includes(r[col])); return b; },
      not() { return b; },
      ilike() { return b; },
      or() { return b; },
      is() { return b; },
      neq() { return b; },
      gte() { return b; },
      lte() { return b; },
      gt() { return b; },
      lt() { return b; },
      order() { return b; },
      limit(n) { rows = rows.slice(0, n); return b; },
      range(f, t) { rows = rows.slice(f, t + 1); return b; },
      maybeSingle() { return Promise.resolve({ data: rows[0] || null, error: null }); },
      single() { return Promise.resolve({ data: rows[0] || null, error: null }); },
      then(resolve) { return Promise.resolve({ data: rows, error: null }).then(resolve); },
    };
    return b;
  };
  return { from };
}

describe('[TS-8] the done[]-shaped test fixture is bound to the REAL computePlanCheckStatus output shape', () => {
  it("fixture-factory keys match the REAL producer's actual return value, not a parallel hand-typed guess", async () => {
    // TESTING evidence 7b22c9ee (F5): an earlier version of this test compared a hand-typed
    // object's keys against a hand-typed array — renaming the real producer's field entirely
    // left it green. This version calls the REAL computePlanCheckStatus against a faked supabase
    // client, so a field-name drift in the actual producer fails THIS test, not just a copy of it.
    const { computePlanCheckStatus } = await import('../../../../lib/roadmap/plan-check-status.js');
    const completedAt = new Date().toISOString();
    const fakeSupabase = makeFakeSupabaseFor({
      strategic_roadmaps: [{ id: 'r1', title: 'Canonical', status: 'active', current_baseline_version: 1 }],
      roadmap_waves: [{ id: 'w1', title: 'Wave 1', sequence_rank: 1, status: 'approved', roadmap_id: 'r1' }],
      adam_task_ledger: [],
      v_plan_of_record_remainder: [{ id: 'item1', wave_id: 'w1', title: 'T', promoted_to_sd_key: 'SD-X-001', item_disposition: 'done', priority_rank: 1, remainder_state: 'done', lane: null, metadata: {} }],
      strategic_directives_v2: [{ sd_key: 'SD-X-001', status: 'completed', completion_date: completedAt, claiming_session_id: null }],
    });
    const status = await computePlanCheckStatus(fakeSupabase, { windowHours: 8760 });
    expect(status.done).toHaveLength(1);
    const row = status.done[0];
    expect(row).toHaveProperty('sd_key', 'SD-X-001');
    expect(row, 'promoted_to_sd_key is the SOURCE field, never the done[] row field').not.toHaveProperty('promoted_to_sd_key');
    // The exact contract scoreLeg1ALocal reads.
    const scored = scoreLeg1ALocal({ items: status.done, runGitLog: () => ['Merge pull request #1 from rickfelix/feat/SD-X-001'] });
    expect(scored.points.value).toBe(LEG_POINTS);
  });
});
