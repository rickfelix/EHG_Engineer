/**
 * SD-LEO-INFRA-WORKTREE-CONTENTION-CLEANUP-001 — FR-1 / AC-4 / AC-5.
 *
 * Four-quadrant matrix for the shared isReapable() predicate
 * (live/dead owner × clean/dirty tree) plus the unpushed dimension and the
 * "path gone" case. This is the single source of truth every removal path
 * consults, so the truth table is pinned here.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  isReapable,
  collectDirtyStatus,
  countUnpushedCommits,
  normalizePath,
  REAP_REASONS,
  fetchUpstreamOnce,
  _resetUpstreamFetchCache,
} from '../../lib/worktree-reapability.js';

// Mock git runner: (args, cwd) -> { stdout, stderr, code }. Simulates a
// dirty/clean working tree and N unpushed commits without touching real git.
function mockGit({ dirty = false, unpushed = 0, statusCode = 0, cherryCode = 0, ownsGitState = true } = {}) {
  return (args, cwd) => {
    if (args[0] === 'status') {
      return { code: statusCode, stdout: dirty ? ' M lib/file.js\n?? new.txt\n' : '', stderr: '' };
    }
    if (args[0] === 'cherry') {
      const lines = Array.from({ length: unpushed }, (_, i) => `+ ${i}abc123 commit ${i}`).join('\n');
      return { code: cherryCode, stdout: lines, stderr: '' };
    }
    // A mock standing in for a REAL worktree must be able to SAY it is one. Since -C the
    // helpers assert ownership before letting a BLOCKING answer through, and a runner
    // that cannot answer rev-parse is indistinguishable from a directory that owns no
    // git state. Note what changed here and what did not: the fixture now ANSWERS a
    // question it previously fell through on — no existing assertion was weakened.
    // ownsGitState:false simulates THE WALK-UP by naming a DIFFERENT toplevel, which is
    // what git really does from a .git-less directory nested in a repo.
    if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') {
      return {
        code: 0,
        stdout: ownsGitState ? String(cwd) : path.join(os.tmpdir(), 'some-ancestor-repo'),
        stderr: '',
      };
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

// QF-20260906-756: countUnpushedCommitsResult's `git cherry <upstream> HEAD` reads whatever local
// upstream ref the last fetch left behind, and nothing on the reap path fetched, so a squash-merged
// worktree read unsafe-to-reap for the fetch lag (PAT-LES-9256aa38dfc8). fetchUpstreamOnce is the
// once-per-run fix; these pin its memoization and fail-closed provenance shape.
describe('fetchUpstreamOnce (QF-20260906-756)', () => {
  function mockFetchGit({ fetchCode = 0, sha = 'abc123', revParseCode = 0, showCode = 0, ts = 1000 } = {}) {
    const calls = [];
    const runner = (args) => {
      calls.push(args);
      if (args[0] === 'fetch') return { code: fetchCode, stdout: '', stderr: fetchCode === 0 ? '' : 'network unreachable' };
      if (args[0] === 'rev-parse') return { code: revParseCode, stdout: revParseCode === 0 ? sha : '', stderr: '' };
      if (args[0] === 'show') return { code: showCode, stdout: showCode === 0 ? String(ts) : '', stderr: '' };
      return { code: 1, stdout: '', stderr: 'unexpected' };
    };
    runner.calls = calls;
    return runner;
  }

  beforeEach(() => { _resetUpstreamFetchCache(); });

  it('a successful fetch reports the ref, sha and a non-negative age', () => {
    const now = Date.now();
    const runner = mockFetchGit({ ts: Math.round(now / 1000) - 5 });
    const r = fetchUpstreamOnce('origin/main', { gitRunner: runner });
    expect(r).toEqual({ ref: 'origin/main', sha: 'abc123', age_s: expect.any(Number), fetched: true, error: null });
    expect(r.age_s).toBeGreaterThanOrEqual(0);
  });

  it('a failed fetch is fail-closed: fetched:false with the stderr as error, sha still read from the existing local ref', () => {
    const runner = mockFetchGit({ fetchCode: 1 });
    const r = fetchUpstreamOnce('origin/main', { gitRunner: runner });
    expect(r.fetched).toBe(false);
    expect(r.error).toMatch(/network unreachable/);
    expect(r.sha).toBe('abc123'); // rev-parse still answers from whatever local ref exists
  });

  it('memoizes per process: a second call with the same upstream does not re-invoke git at all', () => {
    const runner = mockFetchGit();
    fetchUpstreamOnce('origin/main', { gitRunner: runner });
    const callsAfterFirst = runner.calls.length;
    fetchUpstreamOnce('origin/main', { gitRunner: runner });
    expect(runner.calls.length).toBe(callsAfterFirst);
  });

  it('_resetUpstreamFetchCache clears the memo so the next call re-fetches', () => {
    const runner = mockFetchGit();
    fetchUpstreamOnce('origin/main', { gitRunner: runner });
    _resetUpstreamFetchCache();
    fetchUpstreamOnce('origin/main', { gitRunner: runner });
    expect(runner.calls.filter((a) => a[0] === 'fetch').length).toBe(2);
  });

  it('splits a remote/branch upstream correctly (fetch <remote> <branch>)', () => {
    const runner = mockFetchGit();
    fetchUpstreamOnce('origin/main', { gitRunner: runner });
    expect(runner.calls[0]).toEqual(['fetch', 'origin', 'main']);
  });
});
