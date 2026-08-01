/**
 * SD-FDBK-INFRA-ORPHAN-WORKTREE-STRANDING-001-B FR-7 — the SSOT stops reading
 * "I could not look" as "I looked and found nothing".
 *
 * lib/worktree-reapability.js declares itself the single source of truth for "is this
 * worktree safe to remove?" and gates four removal paths. It failed open four ways:
 * collectDirtyStatus returned dirtyCount:0 on non-zero git exit AND on throw, and
 * countUnpushedCommits returned 0 in both cases. Composed through isReapable, a tree
 * whose git commands merely FAILED — locked index, corrupt or pruned gitdir, Windows
 * permission error — reported clean AND fully pushed and came back reapable:true.
 *
 * The guards child cannot claim "a venue with a live occupant is not reapable" while the
 * module four removal paths consult answers reapable:true for a tree it never managed to
 * inspect. Moved here from sibling -C by coordinator ruling: a merge conflict is a merge
 * problem, shipping an invariant that is already false is a correctness problem.
 */
import { describe, test, expect } from 'vitest';
import {
  collectDirtyStatus,
  countUnpushedCommits,
  countUnpushedCommitsResult,
  isReapable,
  REAP_REASONS,
} from '../../lib/worktree-reapability.js';

// A real path, so the fs.existsSync pre-checks pass and the git runner is genuinely reached.
const REAL = process.cwd();

const failing = () => ({ code: 128, stdout: '', stderr: 'fatal: index file corrupt' });
const throwing = () => { throw new Error('EPERM: operation not permitted'); };
const clean = (args) => (args[0] === 'status' ? { code: 0, stdout: '' } : { code: 0, stdout: '' });

describe('FR-7 — could-not-look is not proof-of-clean', () => {
  test('THE DEFECT, at the level where it caused harm: a git failure no longer yields reapable:true', () => {
    const r = isReapable(REAL, { gitRunner: failing });
    expect(r.reapable).toBe(false);
    expect(r.reason).toBe(REAP_REASONS.UNVERIFIABLE);
  });

  test('a THROWING git runner is equally unverifiable, not clean', () => {
    const r = isReapable(REAL, { gitRunner: throwing });
    expect(r.reapable).toBe(false);
    expect(r.reason).toBe(REAP_REASONS.UNVERIFIABLE);
  });

  test('OPPOSITE POLARITY: a tree that genuinely answers clean is STILL reapable', () => {
    // Without this, "fail closed" degenerates into "never reap", the pool fills,
    // and the fleet stalls — the exact over-correction this SD is trying to avoid.
    const r = isReapable(REAL, { gitRunner: clean });
    expect(r.reapable).toBe(true);
    expect(r.reason).toBe(REAP_REASONS.ORPHAN_CLEAN);
  });

  test('a POSITIVE dirty answer keeps its specific reason rather than being masked as unverifiable', () => {
    const dirty = (args) => (args[0] === 'status'
      ? { code: 0, stdout: ' M src/a.js\n?? b.txt\n' }
      : { code: 0, stdout: '' });
    expect(isReapable(REAL, { gitRunner: dirty }).reason).toBe(REAP_REASONS.DIRTY_TREE);
  });

  test('a positive unpushed answer likewise keeps UNPUSHED', () => {
    const ahead = (args) => (args[0] === 'status'
      ? { code: 0, stdout: '' }
      : { code: 0, stdout: '+ abc123 subject\n' });
    expect(isReapable(REAL, { gitRunner: ahead }).reason).toBe(REAP_REASONS.UNPUSHED);
  });

  test('unpushed-probe failure alone is unverifiable, even when the dirty probe succeeded', () => {
    const mixed = (args) => (args[0] === 'status' ? { code: 0, stdout: '' } : { code: 128, stdout: '' });
    expect(isReapable(REAL, { gitRunner: mixed }).reason).toBe(REAP_REASONS.UNVERIFIABLE);
  });
});

describe('FR-7 — back-compatibility of the probe contracts', () => {
  test('collectDirtyStatus keeps every existing field and only ADDS unknown', () => {
    const ok = collectDirtyStatus(REAL, { gitRunner: clean });
    expect(ok).toMatchObject({ dirtyCount: 0, untracked: [], modified: [], exists: true, unknown: false });
    const bad = collectDirtyStatus(REAL, { gitRunner: failing });
    expect(bad).toMatchObject({ dirtyCount: 0, untracked: [], modified: [], exists: true, unknown: true });
  });

  test('countUnpushedCommits still returns a plain NUMBER for its existing callers', () => {
    // The wrapper must stay number-returning: changing its shape would break every
    // existing consumer for the sake of a signal only isReapable needs.
    expect(countUnpushedCommits(REAL, { gitRunner: failing })).toBe(0);
    expect(typeof countUnpushedCommits(REAL, { gitRunner: clean })).toBe('number');
  });

  test('countUnpushedCommitsResult exposes the distinction the wrapper cannot', () => {
    expect(countUnpushedCommitsResult(REAL, { gitRunner: failing })).toEqual({ count: 0, unknown: true });
    expect(countUnpushedCommitsResult(REAL, { gitRunner: clean })).toEqual({ count: 0, unknown: false });
    // Same count, opposite meaning — which is precisely why 0 was not safe to act on.
  });

  test('a non-existent path is NOT unverifiable — absent is a real answer', () => {
    expect(countUnpushedCommitsResult('C:/no/such/path/at/all', { gitRunner: throwing }))
      .toEqual({ count: 0, unknown: false });
  });
});
