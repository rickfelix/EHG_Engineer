/**
 * SD-LEO-INFRA-WORKTREE-CONTENTION-CLEANUP-001 — FR-1 / AC-4 / AC-5.
 *
 * Four-quadrant matrix for the shared isReapable() predicate
 * (live/dead owner × clean/dirty tree) plus the unpushed dimension and the
 * "path gone" case. This is the single source of truth every removal path
 * consults, so the truth table is pinned here.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  isReapable,
  collectDirtyStatus,
  countUnpushedCommits,
  normalizePath,
  REAP_REASONS,
} from '../../lib/worktree-reapability.js';

// Mock git runner: (args, cwd) -> { stdout, stderr, code }. Simulates a
// dirty/clean working tree and N unpushed commits without touching real git.
function mockGit({ dirty = false, unpushed = 0, statusCode = 0, cherryCode = 0 } = {}) {
  return (args) => {
    if (args[0] === 'status') {
      return { code: statusCode, stdout: dirty ? ' M lib/file.js\n?? new.txt\n' : '', stderr: '' };
    }
    if (args[0] === 'cherry') {
      const lines = Array.from({ length: unpushed }, (_, i) => `+ ${i}abc123 commit ${i}`).join('\n');
      return { code: cherryCode, stdout: lines, stderr: '' };
    }
    return { code: 0, stdout: '', stderr: '' };
  };
}

describe('worktree-reapability — isReapable four-quadrant matrix', () => {
  let wt;
  beforeAll(() => {
    wt = fs.mkdtempSync(path.join(os.tmpdir(), 'reapability-'));
  });
  afterAll(() => {
    try { fs.rmSync(wt, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('Q1 live owner + clean tree → NOT reapable (live_owner)', () => {
    const r = isReapable(wt, { liveOwner: true, gitRunner: mockGit({ dirty: false }) });
    expect(r.reapable).toBe(false);
    expect(r.reason).toBe(REAP_REASONS.LIVE_OWNER);
  });

  it('Q2 live owner + dirty tree → NOT reapable (live_owner takes precedence over dirty)', () => {
    const r = isReapable(wt, { liveOwner: true, gitRunner: mockGit({ dirty: true, unpushed: 3 }) });
    expect(r.reapable).toBe(false);
    expect(r.reason).toBe(REAP_REASONS.LIVE_OWNER);
  });

  it('Q3 dead owner + dirty tree → NOT reapable (dirty_tree)', () => {
    const r = isReapable(wt, { liveOwner: false, gitRunner: mockGit({ dirty: true }) });
    expect(r.reapable).toBe(false);
    expect(r.reason).toBe(REAP_REASONS.DIRTY_TREE);
  });

  it('Q4 dead owner + clean tree + pushed → REAPABLE (orphan_clean, no-leak case)', () => {
    const r = isReapable(wt, { liveOwner: false, gitRunner: mockGit({ dirty: false, unpushed: 0 }) });
    expect(r.reapable).toBe(true);
    expect(r.reason).toBe(REAP_REASONS.ORPHAN_CLEAN);
  });

  it('dead owner + clean tree but UNPUSHED commits → NOT reapable (unpushed)', () => {
    const r = isReapable(wt, { liveOwner: false, gitRunner: mockGit({ dirty: false, unpushed: 2 }) });
    expect(r.reapable).toBe(false);
    expect(r.reason).toBe(REAP_REASONS.UNPUSHED);
  });

  it('non-existent worktree path → reapable (nothing to lose)', () => {
    const gone = path.join(wt, 'does-not-exist');
    const r = isReapable(gone, { liveOwner: false, gitRunner: mockGit({ dirty: true, unpushed: 5 }) });
    expect(r.reapable).toBe(true);
    expect(r.reason).toBe(REAP_REASONS.ORPHAN_CLEAN);
  });
});

describe('worktree-reapability — helpers', () => {
  let wt;
  beforeAll(() => { wt = fs.mkdtempSync(path.join(os.tmpdir(), 'reapability-h-')); });
  afterAll(() => { try { fs.rmSync(wt, { recursive: true, force: true }); } catch { /* ignore */ } });

  it('collectDirtyStatus counts dirty + untracked lines', () => {
    const s = collectDirtyStatus(wt, { gitRunner: mockGit({ dirty: true }) });
    expect(s.exists).toBe(true);
    expect(s.dirtyCount).toBe(2);
    expect(s.untracked).toContain('new.txt');
  });

  it('collectDirtyStatus on missing path → exists:false, dirtyCount:0', () => {
    const s = collectDirtyStatus(path.join(wt, 'nope'), { gitRunner: mockGit({ dirty: true }) });
    expect(s.exists).toBe(false);
    expect(s.dirtyCount).toBe(0);
  });

  it('collectDirtyStatus treats a git error as non-dirty (fail-safe, never blocks)', () => {
    const s = collectDirtyStatus(wt, { gitRunner: mockGit({ statusCode: 128 }) });
    expect(s.dirtyCount).toBe(0);
  });

  it('countUnpushedCommits counts only + lines from git cherry', () => {
    expect(countUnpushedCommits(wt, { gitRunner: mockGit({ unpushed: 4 }) })).toBe(4);
    expect(countUnpushedCommits(wt, { gitRunner: mockGit({ unpushed: 0 }) })).toBe(0);
  });

  it('normalizePath → forward-slash + lowercase + resolved', () => {
    const n = normalizePath('C:\\\\Foo\\\\Bar');
    expect(n).not.toContain('\\\\');
    expect(n).toBe(n.toLowerCase());
  });

  it('REAP_REASONS is frozen', () => {
    expect(Object.isFrozen(REAP_REASONS)).toBe(true);
  });
});
