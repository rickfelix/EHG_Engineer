/**
 * Tests for the ENF-21 Vanished-Worktree-Linkage Guard (QF-20260914-380).
 *
 * The guard blocks a `git` command that targets a `.worktrees/**` tree whose own `.git`
 * entry no longer exists — the incident this ticket fixes: once that entry vanishes, every
 * later git command silently walks up to the enclosing repo's `.git` (the shared root)
 * instead of erroring, so a session that believes it is isolated actually mutates the tree
 * the whole fleet depends on. It must FAIL-OPEN (no check injected, a non-.worktrees path, an
 * intact `.git` entry) so a healthy session is never blocked.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { decideVanishedWorktreeLinkage, parseGitTargets } = require('../../scripts/hooks/lib/vanished-worktree-guard.cjs');

const WT = 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/qf/QF-1';
const WT_SUB = WT + '/scripts/hooks';
const ROOT = 'C:/Users/rickf/Projects/_EHG/EHG_Engineer';

// Models a REALISTIC filesystem: `.git` exists ONLY at the listed worktree ROOT paths, never at
// an arbitrary subdirectory — mirrors that a worktree's `.git` FILE lives at its root alone.
// (Adversarial-review finding, PR #8964: the original test helper let `.git` "exist" at ANY
// path by default, which is why it never caught the guard checking the wrong directory.)
// `missingRoots` removes specific roots from that set, simulating a vanished linkage.
const fsWithHealthyRoots = (healthyRoots, ...missingRoots) => ({
  gitLinkExists: (dir) => {
    const d = String(dir).replace(/\\/g, '/');
    return healthyRoots.some((r) => r.replace(/\\/g, '/') === d)
      && !missingRoots.some((m) => m.replace(/\\/g, '/') === d);
  },
});

describe('decideVanishedWorktreeLinkage — blocks a vanished .git linkage (FR-1)', () => {
  it('blocks a plain git command run from a worktree cwd whose .git entry is gone', () => {
    const v = decideVanishedWorktreeLinkage('git status', { cwd: WT, ...fsWithHealthyRoots([]) });
    expect(v).toMatchObject({ block: true, reason: 'vanished_worktree_linkage', dir: WT });
  });

  it('blocks any git verb, not only checkout/reset (the whole point vs. shared-tree-guard)', () => {
    expect(decideVanishedWorktreeLinkage('git log --oneline -5', { cwd: WT, ...fsWithHealthyRoots([]) }).block).toBe(true);
    expect(decideVanishedWorktreeLinkage('git diff', { cwd: WT, ...fsWithHealthyRoots([]) }).block).toBe(true);
  });

  it('blocks git -C <worktree> ... when that explicit target has vanished', () => {
    const v = decideVanishedWorktreeLinkage(`git -C ${WT} status`, { cwd: ROOT, ...fsWithHealthyRoots([]) });
    expect(v).toMatchObject({ block: true, dir: WT });
  });

  it('blocks a checkout chained after cd into the vanished worktree', () => {
    const v = decideVanishedWorktreeLinkage(`cd ${WT} && git status`, { cwd: ROOT, ...fsWithHealthyRoots([]) });
    expect(v.block).toBe(true);
  });

  it('blocks a git command from a SUBDIRECTORY whose worktree root has also vanished', () => {
    const v = decideVanishedWorktreeLinkage('git status', { cwd: WT_SUB, ...fsWithHealthyRoots([]) });
    expect(v.block).toBe(true);
  });
});

describe('decideVanishedWorktreeLinkage — fails open on every safe case (FR-2)', () => {
  it('allows when no gitLinkExists check is injected (never blocks by default)', () => {
    expect(decideVanishedWorktreeLinkage('git status', { cwd: WT }).block).toBe(false);
  });

  it('allows a git command in the worktree root when its .git entry is intact', () => {
    expect(decideVanishedWorktreeLinkage('git status', { cwd: WT, ...fsWithHealthyRoots([WT]) }).block).toBe(false);
  });

  // CRITICAL regression case (adversarial review, PR #8964 round 1): `.git` lives ONLY at the
  // worktree ROOT, never in a subdirectory. A git command whose effective directory is a
  // SUBDIRECTORY of a perfectly healthy worktree must walk UP and find it there, not
  // false-positive block just because .git is absent from that exact subdirectory.
  it('allows git -C <worktree>/<subdir> ... when the worktree ROOT is healthy (git command in a healthy subdirectory)', () => {
    const v = decideVanishedWorktreeLinkage(`git -C ${WT_SUB} status`, { cwd: ROOT, ...fsWithHealthyRoots([WT]) });
    expect(v.block).toBe(false);
  });

  it('allows cd-ing into a healthy worktree subdirectory then running git', () => {
    const v = decideVanishedWorktreeLinkage(`cd ${WT_SUB} && git log`, { cwd: ROOT, ...fsWithHealthyRoots([WT]) });
    expect(v.block).toBe(false);
  });

  it('allows a plain git command whose tracked cwd is already a healthy worktree subdirectory', () => {
    const v = decideVanishedWorktreeLinkage('git status', { cwd: WT_SUB, ...fsWithHealthyRoots([WT]) });
    expect(v.block).toBe(false);
  });

  it('allows a git command in the SHARED ROOT even if some unrelated worktree has vanished', () => {
    expect(decideVanishedWorktreeLinkage('git status', { cwd: ROOT, ...fsWithHealthyRoots([]) }).block).toBe(false);
  });

  it('allows a non-git command run from inside the vanished worktree', () => {
    expect(decideVanishedWorktreeLinkage('ls -la', { cwd: WT, ...fsWithHealthyRoots([]) }).block).toBe(false);
  });
});

describe('parseGitTargets — pure parsing helper', () => {
  it('returns null for a non-git segment', () => {
    expect(parseGitTargets('ls -la')).toBeNull();
  });

  it('returns empty dirs for a plain git command', () => {
    expect(parseGitTargets('git status')).toEqual({ dirs: [] });
  });

  it('captures -C <dir>', () => {
    expect(parseGitTargets(`git -C ${WT} status`)).toEqual({ dirs: [WT] });
  });

  it('captures --work-tree=<dir>', () => {
    expect(parseGitTargets(`git --work-tree=${WT} status`)).toEqual({ dirs: [WT] });
  });

  it('strips a leading VAR=value env assignment', () => {
    expect(parseGitTargets(`FOO=bar git -C ${WT} log`)).toEqual({ dirs: [WT] });
  });
});
