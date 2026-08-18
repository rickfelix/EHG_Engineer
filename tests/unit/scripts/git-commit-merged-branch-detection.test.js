/**
 * GATE5 git-commit-enforcement: merged-branch detection
 * SD-LEO-GEN-SECURITY-TELEGRAM-BOT-001 (harness-bug fix, discovered mid-SD, campaign mode)
 *
 * WHY THIS EXISTS: GATE5 assumes PLAN-TO-LEAD always runs BEFORE a PR merges, so a branch that
 * was legitimately merged and then deleted (attemptAutoMerge's standard cleanup) reads
 * identically to "work was never pushed" -- checkAllCommitsPushed/checkRemoteBranchExists both
 * FAIL on a missing remote branch either way. Reproduced live: SD-LEO-GEN-SECURITY-TELEGRAM-
 * BOT-001's own PR #7254 merged before this SD reached PLAN-TO-LEAD, and GATE5 blocked on
 * "Branch has no remote tracking branch; Branch does not exist on remote" despite the work being
 * fully committed, pushed, reviewed, and merged -- stronger evidence of completion than an open
 * branch would be. checkMergedPR() closes this by asking `gh pr list --state merged` before
 * concluding the branch was never pushed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execFile } from 'child_process';

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, execFile: vi.fn() };
});

import GitCommitVerifier from '../../../scripts/verify-git-commit-status.js';

describe('GitCommitVerifier.checkMergedPR', () => {
  let verifier;
  beforeEach(() => {
    verifier = new GitCommitVerifier('SD-TEST-GATE5-MERGE', '/fake/resolved/repo');
    verifier.effectiveCwd = '/fake/resolved/repo';
    vi.clearAllMocks();
  });

  it('returns merged:false without calling gh when the branch still exists on origin (normal, unmerged case untouched)', async () => {
    vi.spyOn(verifier, 'gitCommand').mockResolvedValue({ success: true, stdout: 'abc123\trefs/heads/feat/x', stderr: '' });

    const result = await verifier.checkMergedPR('feat/x');

    expect(result.merged).toBe(false);
    expect(execFile).not.toHaveBeenCalled();
  });

  it('returns merged:true with the PR number when the branch is gone from origin but gh reports a merged PR', async () => {
    vi.spyOn(verifier, 'gitCommand').mockResolvedValue({ success: true, stdout: '', stderr: '' });
    execFile.mockImplementation((cmd, args, opts, cb) => {
      cb(null, { stdout: JSON.stringify([{ number: 7254, mergedAt: '2026-08-18T18:00:00Z' }]), stderr: '' });
    });

    const result = await verifier.checkMergedPR('feat/SD-LEO-GEN-SECURITY-TELEGRAM-BOT-001');

    expect(result.merged).toBe(true);
    expect(result.prNumber).toBe(7254);
  });

  it('returns merged:false when the branch is gone from origin AND gh reports no merged PR (true negative -- never pushed at all)', async () => {
    vi.spyOn(verifier, 'gitCommand').mockResolvedValue({ success: true, stdout: '', stderr: '' });
    execFile.mockImplementation((cmd, args, opts, cb) => {
      cb(null, { stdout: '[]', stderr: '' });
    });

    const result = await verifier.checkMergedPR('feat/never-pushed');

    expect(result.merged).toBe(false);
    expect(result.prNumber).toBe(null);
  });

  it('fails safe (merged:false) when gh itself errors, falling through to the normal stricter checks', async () => {
    vi.spyOn(verifier, 'gitCommand').mockResolvedValue({ success: true, stdout: '', stderr: '' });
    execFile.mockImplementation((cmd, args, opts, cb) => {
      cb(new Error('gh: command not found'), null);
    });

    const result = await verifier.checkMergedPR('feat/x');

    expect(result.merged).toBe(false);
  });
});

describe('GitCommitVerifier.verify — merged-branch shortcut overrides checks 3/4 only when a merged PR is confirmed', () => {
  it('a merged PR flips checks 3/4 from FAIL to PASS and clears their specific blockers', async () => {
    const v = new GitCommitVerifier('SD-TEST-GATE5-MERGE');
    vi.spyOn(v, 'checkCleanWorkingDirectory').mockResolvedValue(true);
    vi.spyOn(v, 'checkCommitsExist').mockResolvedValue(true);
    vi.spyOn(v, 'checkAllCommitsPushed').mockImplementation(async () => {
      v.results.currentBranch = 'feat/SD-TEST-GATE5-MERGE';
      v.results.blockers.push('Branch "feat/SD-TEST-GATE5-MERGE" has no remote tracking branch');
      return false;
    });
    vi.spyOn(v, 'checkRemoteBranchExists').mockImplementation(async () => {
      v.results.blockers.push('Branch "feat/SD-TEST-GATE5-MERGE" does not exist on remote');
      return false;
    });
    vi.spyOn(v, 'checkBranchMatchesSD').mockResolvedValue(true);
    vi.spyOn(v, 'checkMergedPR').mockResolvedValue({ merged: true, prNumber: 9999, mergedAt: '2026-08-18T18:00:00Z' });

    const results = await v.verify();

    expect(results.verdict).toBe('PASS');
    expect(results.blockers).toEqual([]);
    expect(results.mergedPR).toEqual({ merged: true, prNumber: 9999, mergedAt: '2026-08-18T18:00:00Z' });
  });

  it('a genuinely unmerged, unpushed branch still FAILs (no false green from the shortcut)', async () => {
    const v = new GitCommitVerifier('SD-TEST-GATE5-MERGE');
    vi.spyOn(v, 'checkCleanWorkingDirectory').mockResolvedValue(true);
    vi.spyOn(v, 'checkCommitsExist').mockResolvedValue(true);
    vi.spyOn(v, 'checkAllCommitsPushed').mockImplementation(async () => {
      v.results.currentBranch = 'feat/never-pushed';
      v.results.blockers.push('Branch "feat/never-pushed" has no remote tracking branch');
      return false;
    });
    vi.spyOn(v, 'checkRemoteBranchExists').mockResolvedValue(false);
    vi.spyOn(v, 'checkBranchMatchesSD').mockResolvedValue(true);
    vi.spyOn(v, 'checkMergedPR').mockResolvedValue({ merged: false, prNumber: null, mergedAt: null });

    const results = await v.verify();

    expect(results.verdict).toBe('FAIL');
    expect(results.blockers.length).toBeGreaterThan(0);
  });
});
