/**
 * autoDetectGitInfo unit tests
 * SD-LEO-FIX-COMPLETE-QUICK-FIX-001
 *
 * Covers the four runtime paths:
 *   1. PR merged + branch deleted → mergeCommit.oid + headRefName + summed LOC
 *   2. gh exits non-zero → throws operator-readable error (no silent fallback)
 *   3. No --pr-url + CWD NOT a QF worktree → refuse-to-auto-detect throws
 *   4. No --pr-url + CWD IS a QF worktree → legacy git rev-parse path (regression)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execSync } from 'child_process';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

const {
  autoDetectGitInfo,
  extractPRNumber,
  isInQFWorktree,
  fetchPRMetadata,
} = await import('../../../scripts/modules/complete-quick-fix/git-operations.js');

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('extractPRNumber', () => {
  it('parses standard GitHub PR URL', () => {
    expect(extractPRNumber('https://github.com/rickfelix/EHG_Engineer/pull/3331')).toBe(3331);
  });
  it('returns null for non-PR URL', () => {
    expect(extractPRNumber('https://github.com/rickfelix/EHG_Engineer/issues/5')).toBeNull();
  });
  it('returns null for empty/invalid input', () => {
    expect(extractPRNumber(null)).toBeNull();
    expect(extractPRNumber('')).toBeNull();
    expect(extractPRNumber(123)).toBeNull();
  });
});

describe('autoDetectGitInfo — PR-metadata authoritative path', () => {
  it('Path 1: PR merged + branch deleted → returns mergeCommit.oid + headRefName + (additions+deletions)', () => {
    execSync.mockReturnValueOnce(JSON.stringify({
      state: 'MERGED',
      headRefName: 'qf/QF-EXAMPLE-001',
      mergeCommit: { oid: 'a1b2c3d4e5f6789012345678901234567890abcd' },
      additions: 80,
      deletions: 5,
      url: 'https://github.com/org/repo/pull/999',
    }));

    const result = autoDetectGitInfo('C:/main-repo', {
      prUrl: 'https://github.com/org/repo/pull/999',
    });

    expect(result.commitSha).toBe('a1b2c3d4e5f6789012345678901234567890abcd');
    expect(result.branchName).toBe('qf/QF-EXAMPLE-001');
    expect(result.actualLoc).toBe(85);
    expect(execSync).toHaveBeenCalledTimes(1);
    expect(execSync.mock.calls[0][0]).toContain('gh pr view 999');
  });

  it('Path 2: gh exits non-zero → throws operator-readable error (no silent fallback to CWD HEAD)', () => {
    const ghError = Object.assign(new Error('gh failed'), {
      status: 1,
      stderr: Buffer.from('gh: authentication required\n'),
    });
    execSync.mockImplementationOnce(() => { throw ghError; });

    expect(() => autoDetectGitInfo('C:/main-repo', {
      prUrl: 'https://github.com/org/repo/pull/999',
    })).toThrow(/gh pr view 999 exited 1/);

    // Must NOT fall back to git rev-parse HEAD on gh failure
    expect(execSync).toHaveBeenCalledTimes(1);
    expect(execSync.mock.calls[0][0]).toContain('gh pr view 999');
  });

  it('Open PR returns headRefName + summed LOC even when mergeCommit is null', () => {
    execSync.mockReturnValueOnce(JSON.stringify({
      state: 'OPEN',
      headRefName: 'feat/SD-FOO-001',
      mergeCommit: null,
      additions: 30,
      deletions: 10,
      url: 'https://github.com/org/repo/pull/100',
    }));

    const result = autoDetectGitInfo('C:/main-repo', {
      prUrl: 'https://github.com/org/repo/pull/100',
    });

    expect(result.commitSha).toBeUndefined(); // open PR — caller must source commitSha elsewhere
    expect(result.branchName).toBe('feat/SD-FOO-001');
    expect(result.actualLoc).toBe(40);
  });

  it('Throws on unexpected PR state (e.g., CLOSED)', () => {
    execSync.mockReturnValueOnce(JSON.stringify({
      state: 'CLOSED',
      headRefName: 'feat/old-branch',
      mergeCommit: null,
      additions: 0,
      deletions: 0,
    }));

    expect(() => autoDetectGitInfo('C:/main-repo', {
      prUrl: 'https://github.com/org/repo/pull/777',
    })).toThrow(/unexpected state 'CLOSED'/);
  });

  it('Throws on invalid --pr-url', () => {
    expect(() => autoDetectGitInfo('C:/main-repo', {
      prUrl: 'not-a-url',
    })).toThrow(/Invalid --pr-url/);
    expect(execSync).not.toHaveBeenCalled();
  });
});

describe('autoDetectGitInfo — no --pr-url paths', () => {
  it('Path 3: CWD NOT in a QF worktree → throws refuse-to-auto-detect', () => {
    // git rev-parse --git-dir succeeds but path does NOT match worktrees pattern
    execSync.mockReturnValueOnce('.git\n');

    expect(() => autoDetectGitInfo('C:/Users/rickf/Projects/_EHG/EHG_Engineer', {})).toThrow(
      /Cannot auto-detect git info/
    );

    // Must NOT proceed to git rev-parse HEAD
    expect(execSync).toHaveBeenCalledTimes(1);
    expect(execSync.mock.calls[0][0]).toContain('git rev-parse --git-dir');
  });

  it('Path 4: CWD IS in a QF worktree → legacy git rev-parse path runs (regression-safe)', () => {
    const wtPath = 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/qf/QF-20260424-808';
    execSync
      .mockReturnValueOnce('C:/Users/rickf/Projects/_EHG/EHG_Engineer/.git/worktrees/QF-20260424-808\n') // git rev-parse --git-dir (isInQFWorktree)
      .mockReturnValueOnce('2f97e7a78a516eed10172f328df5421f0d7fa8cf\n') // git rev-parse HEAD
      .mockReturnValueOnce('qf/QF-20260424-808\n') // git rev-parse --abbrev-ref HEAD
      .mockReturnValueOnce(' 1 file changed, 90 insertions(+)\n'); // git diff --shortstat

    const result = autoDetectGitInfo(wtPath, {});

    expect(result.commitSha).toBe('2f97e7a78a516eed10172f328df5421f0d7fa8cf');
    expect(result.branchName).toBe('qf/QF-20260424-808');
    expect(result.actualLoc).toBe(90);
  });
});

describe('autoDetectGitInfo — explicit options short-circuit', () => {
  it('returns immediately when all three values are explicit', () => {
    const result = autoDetectGitInfo('C:/anywhere', {
      commitSha: 'deadbeef',
      branchName: 'feat/explicit',
      actualLoc: 42,
    });
    expect(result).toEqual({
      commitSha: 'deadbeef',
      branchName: 'feat/explicit',
      actualLoc: 42,
    });
    expect(execSync).not.toHaveBeenCalled();
  });
});

describe('isInQFWorktree', () => {
  it('returns true for .worktrees/qf/QF-* path', () => {
    execSync.mockReturnValueOnce('/some/.git/worktrees/X\n');
    expect(isInQFWorktree('C:/repo/.worktrees/qf/QF-20260424-808')).toBe(true);
  });
  it('returns true for .worktrees/QF-* path', () => {
    execSync.mockReturnValueOnce('/some/.git/worktrees/X\n');
    expect(isInQFWorktree('C:/repo/.worktrees/QF-20260424-808')).toBe(true);
  });
  it('returns false for SD worktree (not QF)', () => {
    execSync.mockReturnValueOnce('/some/.git/worktrees/X\n');
    expect(isInQFWorktree('C:/repo/.worktrees/SD-FOO-001')).toBe(false);
  });
  it('returns false when git rev-parse fails', () => {
    execSync.mockImplementationOnce(() => { throw new Error('not a git repo'); });
    expect(isInQFWorktree('C:/some/random/path')).toBe(false);
  });
});

describe('fetchPRMetadata', () => {
  it('parses valid JSON response', () => {
    execSync.mockReturnValueOnce(JSON.stringify({ state: 'MERGED', headRefName: 'x' }));
    const result = fetchPRMetadata(123, 'C:/repo');
    expect(result.state).toBe('MERGED');
    expect(result.headRefName).toBe('x');
  });
  it('throws on non-JSON response', () => {
    execSync.mockReturnValueOnce('not json at all');
    expect(() => fetchPRMetadata(123, 'C:/repo')).toThrow(/non-JSON/);
  });
  it('throws on JSON missing state field', () => {
    execSync.mockReturnValueOnce(JSON.stringify({ headRefName: 'x' }));
    expect(() => fetchPRMetadata(123, 'C:/repo')).toThrow(/malformed JSON/);
  });
});
