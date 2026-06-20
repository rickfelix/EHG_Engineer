/**
 * Semantic / problem-phrased dedup — SD-LEO-INFRA-SOURCING-DEDUP-SEMANTIC-001.
 *
 * findDedupMatch was title-only (exact normalized title OR Jaccard>=0.8 over title tokens), so it
 * missed PROBLEM-PHRASED restatements of already-shipped work (Adam triage: 116/208 = 56% of staged
 * keepers were such dups). A description-aware problem-key path now catches them — PRECISION-FIRST:
 * a false positive would drop NOVEL work via the disposition gate, so the bar is high (>=0.6
 * overlap-coefficient over normalized problem-key token-sets AND >=4 shared meaningful tokens). These tests pin both the
 * catch (problem-phrased dup) and the precision guard (novel work never falsely flagged).
 */
import { describe, it, expect } from 'vitest';
import { routeCandidate, normalizeProblemKey, LANES } from '../../../lib/sourcing-engine/router.js';

describe('normalizeProblemKey (FR-1)', () => {
  it('strips SD/QF keys, version numbers, uuids, urls, punctuation, stopwords, short/number tokens', () => {
    const k = normalizeProblemKey(
      'SD-LEO-FOO-001 v2.1.108 reaper destroyed uncommitted worktree changes',
      'see https://x.y/z and 550e8400-e29b-41d4-a716-446655440000 — the QF-1 fix is at 42'
    );
    // identifiers/stopwords/numbers gone; meaningful problem words kept
    expect(k.has('reaper')).toBe(true);
    expect(k.has('destroyed')).toBe(true);
    expect(k.has('uncommitted')).toBe(true);
    expect(k.has('worktree')).toBe(true);
    for (const junk of ['sd', 'qf', 'v2', '108', '42', 'the', 'and', 'fix']) {
      expect(k.has(junk)).toBe(false);
    }
  });

  it('an opaque/short title yields too few tokens to ever drive a match', () => {
    expect(normalizeProblemKey('v2.1.108', null).size).toBe(0);
  });
});

const existing = [{
  sd_key: 'SD-LEO-INFRA-REAPER-PRESERVE-001',
  title: 'Worktree reaper preserve-before-delete hardening',
  description: 'The worktree reaper destroyed uncommitted tracked changes when removing a worktree because preservation only copied untracked files.',
}];

describe('findDedupMatch semantic path via routeCandidate (FR-1) — catch problem-phrased dups', () => {
  it('catches a restatement with a DIFFERENT title but the same problem text', () => {
    const r = routeCandidate({
      source_id: 'uuid-1',
      title: 'Data loss during cleanup',                          // title shares ~nothing with the SD title
      description: 'Reaper removing a worktree destroyed uncommitted tracked changes; preservation only handled untracked files.',
    }, { existing });
    expect(r.lane).toBe(LANES.DEDUP);
    expect(r.dedup_match_sd_key).toBe('SD-LEO-INFRA-REAPER-PRESERVE-001');
  });

  it('PRECISION: a novel candidate sharing only generic tokens is NOT flagged', () => {
    const r = routeCandidate({
      source_id: 'uuid-2',
      title: 'Add a dashboard widget for revenue trends',
      description: 'Build a new dashboard panel charting weekly revenue so the chairman can see trends.',
    }, { existing });
    expect(r.lane).not.toBe(LANES.DEDUP);
    expect(r.dedup_match_sd_key == null || r.dedup_match_sd_key === undefined).toBe(true);
  });

  it('PRECISION: an opaque candidate (bare version title, no description) is NOT force-matched', () => {
    const r = routeCandidate({ source_id: 'uuid-3', title: 'v2.1.108', description: null }, { existing });
    expect(r.lane).not.toBe(LANES.DEDUP);
  });

  it('a title-level (exact) match still wins first — no regression', () => {
    const r = routeCandidate(
      { source_id: 'uuid-4', title: 'Worktree reaper preserve-before-delete hardening', description: 'unrelated body' },
      { existing }
    );
    expect(r.lane).toBe(LANES.DEDUP);
    expect(r.dedup_match_sd_key).toBe('SD-LEO-INFRA-REAPER-PRESERVE-001');
  });

  it('no existing description → degrades to title-only (no semantic false-positive)', () => {
    const titleOnly = [{ sd_key: 'SD-X-001', title: 'Worktree reaper preserve hardening' }];
    const r = routeCandidate(
      { source_id: 'uuid-5', title: 'Completely different feature', description: 'reaper removing a worktree destroyed uncommitted tracked changes preservation untracked' },
      { existing: titleOnly }
    );
    // existing has no description; candidate problem-key can't reach >=4 overlap on title alone here
    expect(r.lane).not.toBe(LANES.DEDUP);
  });
});
