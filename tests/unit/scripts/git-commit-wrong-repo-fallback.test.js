/**
 * GATE5 git-commit-enforcement: regression guard + wrong-repo fallback
 * SD: SD-FDBK-INFRA-GATE5-GIT-COMMIT-001 (FR-1, FR-2)
 *
 * RCA 4fb06962 established that the witnessed cross-WORKTREE false-positive was already fixed by
 * SD-LEO-INFRA-BRANCH-AWARE-PLAN-001 (resolveWorktreeCwd), and that `git log --all` is repo-object-DB
 * scoped (not cwd-scoped). These tests lock in that fix + the gate invariants, and cover the new
 * strictly-more-permissive wrong-REPO fallback in checkCommitsExist.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the worktree resolver so TS-1 can assert verify() wires it without a real worktree.
vi.mock('../../../lib/resolve-worktree-cwd.js', () => ({
  resolveWorktreeCwd: () => '/fake/ehg/.worktrees/SD-TEST-GATE5',
}));

import GitCommitVerifier from '../../../scripts/verify-git-commit-status.js';

describe('GitCommitVerifier.checkCommitsExist — wrong-repo fallback + invariants', () => {
  let verifier;
  beforeEach(() => {
    verifier = new GitCommitVerifier('SD-TEST-GATE5', '/fake/resolved/repo');
    verifier.effectiveCwd = '/fake/resolved/repo';
  });

  it('TS-3: same-repo commits found on first pass — sibling-repo fallback is NEVER invoked (fail-open invariant)', async () => {
    vi.spyOn(verifier, 'gitCommand').mockResolvedValue({ success: true, stdout: 'abc1234 fix(SD-TEST-GATE5): work', stderr: '' });
    const inDir = vi.spyOn(verifier, 'gitCommandInDir').mockResolvedValue({ success: true, stdout: '', stderr: '' });

    const ok = await verifier.checkCommitsExist();

    expect(ok).toBe(true);
    expect(verifier.results.commitsExist).toBe(true);
    // The load-bearing same-repo guarantee: the fallback is not reached, so behavior is unchanged.
    expect(inDir).not.toHaveBeenCalled();
  });

  it('TS-4: wrong-repo resolution — commits found in the SIBLING platform repo via the fallback', async () => {
    vi.spyOn(verifier, 'gitCommand').mockResolvedValue({ success: true, stdout: '', stderr: '' }); // resolved repo: empty
    const inDir = vi.spyOn(verifier, 'gitCommandInDir').mockResolvedValue({ success: true, stdout: 'def5678 fix(SD-TEST-GATE5): work in sibling repo', stderr: '' });

    const ok = await verifier.checkCommitsExist();

    expect(ok).toBe(true);
    expect(verifier.results.commitsExist).toBe(true);
    expect(inDir).toHaveBeenCalled(); // fallback engaged only because the first pass found nothing
    expect(verifier.results.commitCount).toBeGreaterThan(0);
  });

  it('TS-2: no commits in ANY candidate repo — FAIL with No-commits-found blocker (true-negative preserved)', async () => {
    vi.spyOn(verifier, 'gitCommand').mockResolvedValue({ success: true, stdout: '', stderr: '' });
    vi.spyOn(verifier, 'gitCommandInDir').mockResolvedValue({ success: true, stdout: '', stderr: '' });

    const ok = await verifier.checkCommitsExist();

    expect(ok).toBe(false);
    expect(verifier.results.commitsExist).toBe(false);
    expect(verifier.results.blockers.some((b) => /No commits found/.test(b))).toBe(true);
  });

  it('TS-4b: fallback de-dupes and only fails when truly empty everywhere (sibling also empty → still found nowhere)', async () => {
    vi.spyOn(verifier, 'gitCommand').mockResolvedValue({ success: true, stdout: '', stderr: '' });
    // sibling returns blank/whitespace → treated as no commits
    vi.spyOn(verifier, 'gitCommandInDir').mockResolvedValue({ success: true, stdout: '   ', stderr: '' });

    const ok = await verifier.checkCommitsExist();

    expect(ok).toBe(false);
    expect(verifier.results.commitCount).toBe(0);
  });
});

describe('GitCommitVerifier.verify — locks in resolveWorktreeCwd worktree resolution (FR-1 / TS-1)', () => {
  it('TS-1: verify() resolves effectiveCwd to the SD worktree (guards SD-LEO-INFRA-BRANCH-AWARE-PLAN-001)', async () => {
    // Default appPath = the real EHG_Engineer worktree root (has a .git file), so verify() does not early-return.
    const v = new GitCommitVerifier('SD-TEST-GATE5');
    // Stub the 5 real-git checks so verify() touches no network/filesystem beyond the resolver.
    vi.spyOn(v, 'checkCleanWorkingDirectory').mockResolvedValue(true);
    vi.spyOn(v, 'checkCommitsExist').mockResolvedValue(true);
    vi.spyOn(v, 'checkAllCommitsPushed').mockResolvedValue(true);
    vi.spyOn(v, 'checkRemoteBranchExists').mockResolvedValue(true);
    vi.spyOn(v, 'checkBranchMatchesSD').mockResolvedValue(true);

    const results = await v.verify();

    expect(results.verdict).toBe('PASS');
    // resolveWorktreeCwd (mocked) returned a worktree path distinct from appPath → effectiveCwd updated.
    expect(v.effectiveCwd).toBe('/fake/ehg/.worktrees/SD-TEST-GATE5');
  });
});
