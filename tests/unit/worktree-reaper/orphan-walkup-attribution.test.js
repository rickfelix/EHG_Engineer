/**
 * SD-FDBK-INFRA-ORPHAN-WORKTREE-STRANDING-001-C — the walk-up, closed at BOTH inputs.
 *
 * THE DEFECT. `git status` run with cwd=<a .git-less directory nested in a repo> does not
 * fail — discovery CLIMBS OUT and answers about the ANCESTOR. The probe SUCCEEDS WITH
 * SOMEBODY ELSE'S ANSWER, so `unknown` stays false, so isReapable returns dirty_tree at
 * its first check and never reaches the `if (dirty.unknown || ahead.unknown)` branch where
 * sibling -B consults resolveWorktreeRoot. -B's guard cannot see this input at all.
 *
 * WHY THE FIRST BLOCK OF TESTS USES REAL GIT. A mock can only reproduce a walk-up that
 * someone already understood well enough to write down; these fixtures make git itself
 * perform the walk-up, so the test would have caught the bug without anyone knowing the
 * mechanism. The mock-based blocks that follow then pin the properties real git cannot
 * be asked about cheaply (call counts, thrown runners).
 *
 * EVERY ASSERTION IS PAIRED. An orphan reporting 0 in isolation is equally consistent
 * with a helper that returns 0 for everything, so each orphan assertion is made in the
 * same test as the owning directory's non-zero count.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  collectDirtyStatus,
  countUnpushedCommitsResult,
  countUnpushedCommits,
  isReapable,
  REAP_REASONS,
} from '../../../lib/worktree-reapability.js';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

describe('the walk-up, reproduced with REAL git (FR-1, FR-2, FR-3)', () => {
  let repoRoot;
  let orphan;

  beforeAll(() => {
    repoRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'walkup-repo-')));
    git(repoRoot, 'init', '-q');
    git(repoRoot, 'config', 'user.email', 'test@example.invalid');
    git(repoRoot, 'config', 'user.name', 'Test');
    git(repoRoot, 'config', 'commit.gpgsign', 'false');

    fs.writeFileSync(path.join(repoRoot, 'base.txt'), 'base\n');
    git(repoRoot, 'add', '-A');
    git(repoRoot, 'commit', '-q', '-m', 'base');

    // A SECOND commit so the parent is DELIBERATELY AHEAD of the ref we use as upstream.
    // At parity the buggy and the fixed code BOTH return 0 — which is exactly how this
    // input got missed when FR-2 was originally scoped rename-only.
    fs.writeFileSync(path.join(repoRoot, 'ahead.txt'), 'ahead\n');
    git(repoRoot, 'add', '-A');
    git(repoRoot, 'commit', '-q', '-m', 'ahead');

    // Make the PARENT genuinely dirty. With a clean parent the buggy and fixed code agree,
    // so a dirty parent is required for the FR-1 assertion to mean anything.
    fs.writeFileSync(path.join(repoRoot, 'base.txt'), 'base modified\n');
    fs.writeFileSync(path.join(repoRoot, 'untracked.txt'), 'new\n');

    // THE STRANDED SHAPE: a directory that exists, holds no .git, and is not a registered
    // worktree — the same shape as the three real stranded dirs found on disk.
    orphan = path.join(repoRoot, 'orphan-dir');
    fs.mkdirSync(orphan);
  });

  afterAll(() => { try { fs.rmSync(repoRoot, { recursive: true, force: true }); } catch { /* ignore */ } });

  it('FR-1: does not attribute the ancestor dirt to the orphan, while the root keeps its own', () => {
    const rootStatus = collectDirtyStatus(repoRoot);
    const orphanStatus = collectDirtyStatus(orphan);

    // The root owns its git state and must still report its OWN dirt — the fix must not
    // blind the guard to real dirt.
    expect(rootStatus.dirtyCount).toBeGreaterThan(0);
    expect(rootStatus.ownsGitState).toBe(true);
    expect(rootStatus.untracked).toContain('untracked.txt');

    // BEFORE the fix these two were byte-identical. That equality IS the bug.
    expect(orphanStatus.dirtyCount).toBe(0);
    expect(orphanStatus.ownsGitState).toBe(false);
    expect(orphanStatus.untracked).toEqual([]);
    expect(orphanStatus.modified).toEqual([]);
    expect(orphanStatus.dirtyCount).not.toBe(rootStatus.dirtyCount);

    // DISPROVED-OWNERSHIP IS NOT COULD-NOT-LOOK. git answered; it answered about somebody
    // else. Setting unknown here would route the tree into UNVERIFIABLE and re-strand it.
    expect(orphanStatus.unknown).toBe(false);
    expect(orphanStatus.exists).toBe(true);
  });

  it('FR-2: does not attribute the ancestor history to the orphan, with the parent AHEAD', () => {
    const rootAhead = countUnpushedCommitsResult(repoRoot, { upstream: 'HEAD~1' });
    const orphanAhead = countUnpushedCommitsResult(orphan, { upstream: 'HEAD~1' });

    // The parent really is ahead — without this the assertion below is vacuous.
    expect(rootAhead.count).toBeGreaterThan(0);
    expect(rootAhead.ownsGitState).toBe(true);

    expect(orphanAhead.count).toBe(0);
    expect(orphanAhead.ownsGitState).toBe(false);
    expect(orphanAhead.unknown).toBe(false);

    // The plain-number wrapper delegates, so it inherits the fix with no second edit —
    // asserted rather than assumed, because worktree-reaper.mjs:1324 calls the WRAPPER.
    expect(countUnpushedCommits(orphan, { upstream: 'HEAD~1' })).toBe(0);
    expect(countUnpushedCommits(repoRoot, { upstream: 'HEAD~1' })).toBeGreaterThan(0);
  });

  it('FR-3: isReapable frees the orphan at the level where the stranding actually manifests', () => {
    // Consumers that depend on this verdict, enumerated so the coverage claim is auditable:
    //   lib/worktree-manager.js:1498, lib/worktree-quota.js:266,
    //   scripts/cleanup-pending-sweep.mjs:245, scripts/safe-worktree-remove.mjs (guarded default).
    const orphanVerdict = isReapable(orphan, { liveOwner: false, upstream: 'HEAD~1' });
    expect(orphanVerdict.reapable).toBe(true);
    expect(orphanVerdict.reason).toBe(REAP_REASONS.ORPHAN_CLEAN);

    // OPPOSITE POLARITY: the genuinely dirty owning tree is still protected. Reached via
    // the dirty_tree early-out, i.e. the exact branch the orphan no longer trips.
    const rootVerdict = isReapable(repoRoot, { liveOwner: false, upstream: 'HEAD~1' });
    expect(rootVerdict.reapable).toBe(false);
    expect(rootVerdict.reason).toBe(REAP_REASONS.DIRTY_TREE);

    // And a live owner still outranks everything.
    expect(isReapable(orphan, { liveOwner: true }).reason).toBe(REAP_REASONS.LIVE_OWNER);
  });
});

describe('the laziness invariant — the property that bounds the blast radius', () => {
  let wt;
  beforeAll(() => { wt = fs.mkdtempSync(path.join(os.tmpdir(), 'walkup-lazy-')); });
  afterAll(() => { try { fs.rmSync(wt, { recursive: true, force: true }); } catch { /* ignore */ } });

  /** Counting runner: records every subcommand it is asked for. */
  function countingGit({ dirty = false, cherry = 0, owns = true } = {}) {
    const calls = [];
    const runner = (args, cwd) => {
      calls.push(args[0] === 'rev-parse' ? 'rev-parse' : args[0]);
      if (args[0] === 'status') return { code: 0, stdout: dirty ? ' M a.js\n?? b.js\n' : '', stderr: '' };
      if (args[0] === 'cherry') {
        return { code: 0, stdout: Array.from({ length: cherry }, (_, i) => `+ ${i}aaa msg`).join('\n'), stderr: '' };
      }
      if (args[0] === 'rev-parse') {
        return { code: 0, stdout: owns ? String(cwd) : path.join(os.tmpdir(), 'elsewhere'), stderr: '' };
      }
      return { code: 0, stdout: '', stderr: '' };
    };
    runner.calls = calls;
    return runner;
  }

  it('a CLEAN status asks nobody who owns the tree', () => {
    const g = countingGit({ dirty: false });
    const s = collectDirtyStatus(wt, { gitRunner: g });
    expect(s.dirtyCount).toBe(0);
    // The whole point: a clean answer is verdict-identical either way, so the probe that
    // broke -B's unconditional hoist never fires here.
    expect(g.calls.filter((c) => c === 'rev-parse')).toHaveLength(0);
    // Not measured, so not claimed.
    expect(s.ownsGitState).toBeUndefined();
  });

  it('a ZERO cherry count asks nobody who owns the tree', () => {
    const g = countingGit({ cherry: 0 });
    const r = countUnpushedCommitsResult(wt, { gitRunner: g });
    expect(r.count).toBe(0);
    expect(g.calls.filter((c) => c === 'rev-parse')).toHaveLength(0);
    expect(r.ownsGitState).toBeUndefined();
  });

  it('a BLOCKING answer asks exactly once, on each helper', () => {
    const gd = countingGit({ dirty: true });
    collectDirtyStatus(wt, { gitRunner: gd });
    expect(gd.calls.filter((c) => c === 'rev-parse')).toHaveLength(1);

    const gc = countingGit({ cherry: 3 });
    countUnpushedCommitsResult(wt, { gitRunner: gc });
    expect(gc.calls.filter((c) => c === 'rev-parse')).toHaveLength(1);
  });

  it('OPPOSITE POLARITY: an owning tree keeps its own blocking answer', () => {
    const s = collectDirtyStatus(wt, { gitRunner: countingGit({ dirty: true, owns: true }) });
    expect(s.dirtyCount).toBe(2);
    expect(s.ownsGitState).toBe(true);
    expect(s.modified).toContain('a.js');

    const r = countUnpushedCommitsResult(wt, { gitRunner: countingGit({ cherry: 3, owns: true }) });
    expect(r.count).toBe(3);
    expect(r.ownsGitState).toBe(true);
  });

  it('a THROWN ownership probe fails CLOSED — could-not-tell is not permission to delete', () => {
    // resolveWorktreeRoot claims ownership when the probe throws, which routes an
    // unanswerable case back into "keep the blocking answer". For a GUARD that is the
    // right direction: if we cannot tell whose dirt it is, do not license deletion.
    const throwing = (args) => {
      if (args[0] === 'status') return { code: 0, stdout: ' M a.js\n', stderr: '' };
      if (args[0] === 'rev-parse') throw new Error('probe exploded');
      return { code: 0, stdout: '', stderr: '' };
    };
    const s = collectDirtyStatus(wt, { gitRunner: throwing });
    expect(s.dirtyCount).toBe(1);
    expect(s.ownsGitState).toBe(true);
  });
});
