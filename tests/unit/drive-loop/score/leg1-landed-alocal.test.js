/**
 * SD-LEO-INFRA-DRIVE-SCORE-LEG1-ALOCAL-001 — leg1 A-LOCAL: landed means SD-key end-anchored in a
 * main merge-commit subject, measured over a completed-items window, scored proportionally.
 *
 * Supersedes lib/drive-loop/score/leg1-landed.js's merge-base-ancestry rule (kept as
 * reference-only — see its header amendment). Two properties this file exists to prove, each
 * corresponding to a real defect found during PLAN-phase adversarial review (VALIDATION evidence
 * 9a48cac4, TESTING evidence 8606170f):
 *
 *   ANCHORING — a naive substring grep reports a PARENT SD landed off a CHILD's merge, because
 *   child keys extend the parent's key as a string. Measured over 5608 real sd_key values: the
 *   no-separator shape ('-001' vs '-001A') collides 103 times, the hyphenated shape ('-001' vs
 *   '-001-B') collides 1583 times — both guarded here, not just the more obvious one.
 *
 *   PROPORTIONAL SCORING — all-or-nothing (the OLD leg's shape) would zero the whole leg on a
 *   real, measured false-negative tail (squash-merges with no merge commit; renamed/abbreviated
 *   landed keys). Proportional scoring reports that tail as an honest partial measurement.
 */

import { describe, it, expect } from 'vitest';
import {
  isSdLandedInMainHistory,
  scoreLeg1ALocal,
  anchoredKeyPattern,
  mergeLogArgs,
  LEG_ID,
  LEG_POINTS,
} from '../../../../lib/drive-loop/score/leg1-landed-alocal.js';

function gitLogDouble(subjects = []) {
  const calls = [];
  const runGitLog = (args) => {
    calls.push(args.join(' '));
    return subjects;
  };
  return { runGitLog, calls };
}

describe('isSdLandedInMainHistory — end-anchored merge-history match', () => {
  it('[TS-1, positive] a subject containing the exact key, end-anchored, measures landed', () => {
    const { runGitLog } = gitLogDouble(['Merge pull request #6950 from rickfelix/feat/SD-LEO-INFRA-DRIVE-SCORE-LEG1-001']);
    expect(isSdLandedInMainHistory('SD-LEO-INFRA-DRIVE-SCORE-LEG1-001', { runGitLog })).toBe(true);
  });

  it('[TS-2, negative] a fabricated never-landed key measures NOT landed', () => {
    const { runGitLog } = gitLogDouble(['Merge pull request #1 from rickfelix/feat/SD-SOME-OTHER-001']);
    expect(isSdLandedInMainHistory('SD-FAKE-NEVER-MERGED-001', { runGitLog })).toBe(false);
  });

  it("[TS-3a, end-anchor: hyphenated child suffix] a parent key is NOT landed off its child's merge", () => {
    // Real collision shape found during PLAN research: DRIVE-LOOP-INSTRUMENT-001 (parent) has 0
    // end-anchored merges of its own but 5 substring hits, all belonging to -001-B/-C/-D/-E.
    const { runGitLog } = gitLogDouble(['Merge pull request #1 from rickfelix/feat/SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B']);
    expect(
      isSdLandedInMainHistory('SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001', { runGitLog }),
      'the parent key is a hyphenated PREFIX of the merged child key — must not read as landed',
    ).toBe(false);
  });

  it('[TS-3b, end-anchor: no-separator child suffix — the DOMINANT real collision shape] a parent key is NOT landed off a no-separator child variant', () => {
    // Measured 103 pairs across 5608 real SD keys (TESTING evidence 8606170f) — 100x more common
    // than the hyphenated shape above, and previously unguarded by any existing helper.
    const { runGitLog } = gitLogDouble(['Merge pull request #1 from rickfelix/feat/SD-LEO-INFRA-CONTEXT-AWARE-LLM-001A']);
    expect(isSdLandedInMainHistory('SD-LEO-INFRA-CONTEXT-AWARE-LLM-001', { runGitLog })).toBe(false);
  });

  it('a key at true line-end (no trailing character at all) still matches', () => {
    const { runGitLog } = gitLogDouble(['...from rickfelix/feat/SD-X-001']);
    expect(isSdLandedInMainHistory('SD-X-001', { runGitLog })).toBe(true);
  });

  it('a dot in the key is escaped, not treated as a wildcard', () => {
    // Keys can contain '.' (e.g. SD-UNIFIED-PATH-1.1) — an unescaped '.' would match ANY
    // character, silently widening the match to unrelated keys.
    const pattern = anchoredKeyPattern('SD-UNIFIED-PATH-1.1');
    expect(pattern.test('Merge SD-UNIFIED-PATH-1X1'), 'unescaped dot would wrongly match here').toBe(false);
    expect(pattern.test('Merge SD-UNIFIED-PATH-1.1')).toBe(true);
  });

  it('refuses to run without an injected runGitLog rather than shelling out silently', () => {
    expect(() => isSdLandedInMainHistory('SD-X-001')).toThrow(/runGitLog must be injected/);
  });

  it('the permitted git question is fixed and inspectable', () => {
    expect(mergeLogArgs()).toEqual(['log', 'main', '--merges', '--format=%s']);
    expect(mergeLogArgs({ sinceIso: '2026-01-01T00:00:00Z' }))
      .toEqual(['log', 'main', '--merges', '--format=%s', '--since=2026-01-01T00:00:00Z']);
  });
});

describe('scoreLeg1ALocal — proportional scoring, dedup, null-exclusion, denominator-zero', () => {
  it('[TS-5, denominator-zero guard] items with no resolvable sd_key never score 0/0=NaN', () => {
    const { runGitLog } = gitLogDouble([]);
    const r = scoreLeg1ALocal({ items: [{ item_id: 'd1', sd_key: null }], runGitLog });
    expect(r.leg).toBe(LEG_ID);
    expect(r.unavailable, 'must be the unavailable shape, never a points node with NaN').toBeDefined();
    expect(r.points, 'no points node when unavailable').toBeUndefined();
    expect(r.unavailable.available).toBe(false);
    expect(r.unavailable.value).toBe(null);
  });

  it('[TS-6, dedupe + null-exclusion guard] duplicate and null sd_key entries do not distort the denominator', () => {
    const { runGitLog } = gitLogDouble(['Merge pull request #1 from rickfelix/feat/SD-LANDED-001']);
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
    const { runGitLog } = gitLogDouble(['Merge pull request #1 from rickfelix/feat/SD-LANDED-001']);
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
    const { runGitLog } = gitLogDouble(['Merge pull request #1 from rickfelix/feat/SD-LANDED-001']);
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

  it('refuses to run without an injected runGitLog', () => {
    expect(() => scoreLeg1ALocal({ items: [{ sd_key: 'SD-X-001' }] })).toThrow(/runGitLog must be injected/);
  });

  it('items without a resolvable sd_key are excluded from the denominator, stated in the predicate', () => {
    const { runGitLog } = gitLogDouble(['Merge pull request #1 from rickfelix/feat/SD-LANDED-001']);
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

describe('[TS-8] the done[]-shaped test fixture is bound to the REAL computePlanCheckStatus output shape', () => {
  it('fixture-factory keys match the documented done[] row shape (lib/roadmap/plan-check-status.js:231-237)', () => {
    // The producer emits sd_key (sourced from item.promoted_to_sd_key — a DIFFERENT field name).
    // A hand-typed fixture using the SOURCE field name directly on the row (promoted_to_sd_key)
    // rather than the OUTPUT field name (sd_key) would silently read as undefined -> false zero,
    // the exact harm this SD exists to prevent. This test pins the OUTPUT contract every other
    // fixture in this suite must match.
    const fixtureRow = { item_id: 'd1', title: 'T', wave: 'W', sd_key: 'SD-X-001', completed_at: '2026-01-01T00:00:00Z' };
    const DOCUMENTED_DONE_ROW_KEYS = ['item_id', 'title', 'wave', 'sd_key', 'completed_at'];
    expect(Object.keys(fixtureRow).sort()).toEqual([...DOCUMENTED_DONE_ROW_KEYS].sort());
    expect(fixtureRow, 'promoted_to_sd_key is the SOURCE field, never the done[] row field').not.toHaveProperty('promoted_to_sd_key');
  });
});
