/**
 * Tests for the ENF-17 Shared-Tree Hijack Guard (SD-LEO-FEAT-SHARED-TREE-HIJACK-001).
 *
 * The guard blocks a HEAD-moving git op (checkout/switch to a branch, or `reset --hard`)
 * run in the SHARED repo ROOT while a DIFFERENT session holds the active-coordinator
 * pointer — the 2026-06-11 incident where a QF worker's shared-root checkout un-deployed
 * the coordinator's branch. It must FAIL-OPEN (no coordinator / self / worktree / error)
 * so a solo or isolated worker is never locked out, and must NOT touch file-restore checkouts.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  decideSharedTreeCheckout,
  classifyHeadMovingGitOp,
  extractGitCDir,
} = require('../../scripts/hooks/lib/shared-tree-guard.cjs');

const ME = 'sess-worker-aaaa';
const COORD = 'sess-coordinator-bbbb';
const ROOT = 'C:/Users/rickf/Projects/_EHG/EHG_Engineer';
const WT = 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-X';

// Foreign coordinator active, current session is a worker in the shared root.
const foreign = (over = {}) => ({ cwd: ROOT, sessionId: ME, coordinatorSessionId: COORD, env: {}, ...over });

describe('decideSharedTreeCheckout — blocks shared-root hijack (FR-1)', () => {
  it('blocks git checkout <branch> in the shared root while a foreign coordinator is active', () => {
    const v = decideSharedTreeCheckout('git checkout some-branch', foreign());
    expect(v).toMatchObject({ block: true, reason: 'shared_root_hijack', kind: 'branch' });
  });

  it('blocks git switch <branch> in the shared root', () => {
    expect(decideSharedTreeCheckout('git switch other', foreign()).block).toBe(true);
  });

  it('blocks git checkout -b <branch> (create+switch moves HEAD)', () => {
    expect(decideSharedTreeCheckout('git checkout -b qf/QF-1', foreign()).block).toBe(true);
  });

  it('blocks git reset --hard in the shared root (same hijack class)', () => {
    const v = decideSharedTreeCheckout('git reset --hard origin/main', foreign());
    expect(v).toMatchObject({ block: true, kind: 'reset' });
  });

  it('blocks a checkout chained after a shell separator', () => {
    expect(decideSharedTreeCheckout('cd subdir && git checkout feat/y', foreign()).block).toBe(true);
  });
});

describe('decideSharedTreeCheckout — allows safe ops (FR-1 file-restore + FR-2)', () => {
  it('allows file-restore checkout (git checkout -- file) — HEAD does not move', () => {
    expect(decideSharedTreeCheckout('git checkout -- src/app.js', foreign()).block).toBe(false);
  });

  it('allows ref-scoped file restore (git checkout main -- file)', () => {
    expect(decideSharedTreeCheckout('git checkout main -- src/app.js', foreign()).block).toBe(false);
  });

  it('allows git reset (soft/mixed, no --hard)', () => {
    expect(decideSharedTreeCheckout('git reset HEAD~1', foreign()).block).toBe(false);
    expect(decideSharedTreeCheckout('git reset --soft HEAD~1', foreign()).block).toBe(false);
  });

  it('allows checkout when effective cwd is inside an isolated worktree', () => {
    expect(decideSharedTreeCheckout('git checkout feat/x', foreign({ cwd: WT })).block).toBe(false);
  });

  it('allows checkout targeting a worktree via git -C <worktree> from the root', () => {
    const v = decideSharedTreeCheckout(`git -C ${WT} checkout feat/x`, foreign({ cwd: ROOT }));
    expect(v.block).toBe(false);
  });

  it('allows when no active coordinator (fail-open for solo operator)', () => {
    expect(decideSharedTreeCheckout('git checkout some-branch', foreign({ coordinatorSessionId: null })).block).toBe(false);
  });

  it('allows when the current session IS the coordinator', () => {
    expect(decideSharedTreeCheckout('git checkout some-branch', foreign({ sessionId: COORD })).block).toBe(false);
  });

  it('treats a malformed/empty coordinator id as no-coordinator (allow)', () => {
    expect(decideSharedTreeCheckout('git checkout some-branch', foreign({ coordinatorSessionId: '' })).block).toBe(false);
  });

  it('allows git checkout --help (informational)', () => {
    expect(decideSharedTreeCheckout('git checkout --help', foreign()).block).toBe(false);
  });

  it('allows non-git and non-branch commands', () => {
    expect(decideSharedTreeCheckout('npm test', foreign()).block).toBe(false);
    expect(decideSharedTreeCheckout('git status', foreign()).block).toBe(false);
    expect(decideSharedTreeCheckout('git commit -m "checkout"', foreign()).block).toBe(false);
  });
});

describe('decideSharedTreeCheckout — flag disable (FR-3)', () => {
  it('allows everything when LEO_SHARED_TREE_GUARD=off', () => {
    const v = decideSharedTreeCheckout('git checkout some-branch', foreign({ env: { LEO_SHARED_TREE_GUARD: 'off' } }));
    expect(v).toMatchObject({ block: false, reason: 'guard_disabled' });
  });
});

describe('classifyHeadMovingGitOp / extractGitCDir helpers', () => {
  it('classifies branch vs reset vs file-restore', () => {
    expect(classifyHeadMovingGitOp('git checkout x')).toMatchObject({ kind: 'branch' });
    expect(classifyHeadMovingGitOp('git switch -c x')).toMatchObject({ kind: 'branch' });
    expect(classifyHeadMovingGitOp('git reset --hard')).toMatchObject({ kind: 'reset' });
    expect(classifyHeadMovingGitOp('git checkout -- f')).toBeNull();
    expect(classifyHeadMovingGitOp('git status')).toBeNull();
  });

  it('extracts the -C dir (space and = forms, quoted)', () => {
    expect(extractGitCDir('git -C /tmp/x checkout y')).toBe('/tmp/x');
    expect(extractGitCDir('git -C="/tmp/a b" checkout y')).toBe('/tmp/a b');
    expect(extractGitCDir('git checkout y')).toBeNull();
  });
});
