/**
 * Regression test for 513c5b48 / QF-20260529-706.
 *
 * checkCommitsExist() previously interpolated an SD identifier into a shell
 * command string (`git log --all --oneline --grep="${term}"`) executed via the
 * shell. The search now passes an argv ARRAY through gitCommand/gitCommandInDir,
 * which run it via execFile (no shell) — removing the injection shape and the
 * cross-platform cmd.exe quoting hazard. These tests pin the argv contract.
 *
 * Worktree resolver mocked exactly as in git-commit-wrong-repo-fallback.test.js.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/resolve-worktree-cwd.js', () => ({
  resolveWorktreeCwd: () => '/fake/ehg/.worktrees/SD-TEST-GATE5',
}));

import GitCommitVerifier from '../../../scripts/verify-git-commit-status.js';

describe('GitCommitVerifier — 513c5b48 no-shell argv commit search', () => {
  let verifier;
  beforeEach(() => {
    verifier = new GitCommitVerifier('SD-TEST-GATE5', '/fake/resolved/repo');
    verifier.effectiveCwd = '/fake/resolved/repo';
  });

  it('first-pass search passes an argv array, not an interpolated shell string', async () => {
    const spy = vi.spyOn(verifier, 'gitCommand').mockResolvedValue({ success: true, stdout: 'abc1234 fix(SD-TEST-GATE5): work', stderr: '' });

    await verifier.checkCommitsExist();

    const arg = spy.mock.calls[0][0];
    expect(Array.isArray(arg)).toBe(true);
    expect(arg).toContain('--grep=SD-TEST-GATE5');
    // No shell-quoted git string survives (the injection/quoting hazard).
    expect(arg.join(' ')).not.toContain('"');
    expect(arg.some((a) => typeof a === 'string' && a.startsWith('git '))).toBe(false);
  });

  it('wrong-repo fallback also searches via an argv array', async () => {
    vi.spyOn(verifier, 'gitCommand').mockResolvedValue({ success: true, stdout: '', stderr: '' });
    const inDir = vi.spyOn(verifier, 'gitCommandInDir').mockResolvedValue({ success: true, stdout: 'def5678 fix(SD-TEST-GATE5): sibling', stderr: '' });

    await verifier.checkCommitsExist();

    expect(inDir).toHaveBeenCalled();
    const arg = inDir.mock.calls[0][0];
    expect(Array.isArray(arg)).toBe(true);
    expect(arg).toContain('--grep=SD-TEST-GATE5');
  });
});
