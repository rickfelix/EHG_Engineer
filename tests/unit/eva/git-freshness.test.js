import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execSync } from 'child_process';

// Mock child_process before importing the module
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

const { ensureFresh, getGitMeta, warnIfWorktree } = await import('../../../scripts/eva/git-freshness.js');

describe('git-freshness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('ensureFresh', () => {
    it('returns fresh when local matches remote', () => {
      execSync
        .mockReturnValueOnce('main\n') // branch
        .mockReturnValueOnce('') // fetch
        .mockReturnValueOnce('abc123def456\n') // HEAD sha
        .mockReturnValueOnce('abc123def456\n') // remote ref
        .mockReturnValueOnce('0\t0\n'); // rev-list counts

      const result = ensureFresh();
      expect(result.fresh).toBe(true);
      expect(result.behind).toBe(0);
      expect(result.pulled).toBe(false);
      expect(result.branch).toBe('main');
    });

    it('detects behind and auto-pulls', () => {
      execSync
        .mockReturnValueOnce('main\n') // branch
        .mockReturnValueOnce('') // fetch
        .mockReturnValueOnce('old123\n') // HEAD sha
        .mockReturnValueOnce('new456\n') // remote ref
        .mockReturnValueOnce('0\t3\n') // 3 behind
        .mockReturnValueOnce('') // pull
        .mockReturnValueOnce('new456\n'); // new HEAD sha

      const result = ensureFresh();
      expect(result.pulled).toBe(true);
      expect(result.fresh).toBe(true);
      expect(result.behind).toBe(0);
      expect(result.sha).toBe('new456');
    });

    it('reports stale when auto-pull fails', () => {
      execSync
        .mockReturnValueOnce('main\n') // branch
        .mockReturnValueOnce('') // fetch
        .mockReturnValueOnce('old123\n') // HEAD sha
        .mockReturnValueOnce('new456\n') // remote ref
        .mockReturnValueOnce('0\t2\n') // 2 behind
        .mockImplementationOnce(() => { throw new Error('merge conflict'); }); // pull fails

      const result = ensureFresh();
      expect(result.pulled).toBe(false);
      expect(result.fresh).toBe(false);
      expect(result.error).toContain('Auto-pull failed');
    });

    it('skips pull when autoPull is false', () => {
      execSync
        .mockReturnValueOnce('main\n')
        .mockReturnValueOnce('')
        .mockReturnValueOnce('old123\n')
        .mockReturnValueOnce('new456\n')
        .mockReturnValueOnce('0\t5\n');

      const result = ensureFresh({ autoPull: false });
      expect(result.fresh).toBe(false);
      expect(result.behind).toBe(5);
      expect(result.pulled).toBe(false);
    });

    it('handles no tracking branch gracefully', () => {
      execSync
        .mockReturnValueOnce('feature-branch\n')
        .mockImplementationOnce(() => { throw new Error('fetch failed'); }) // fetch
        .mockReturnValueOnce('abc123\n') // HEAD sha
        .mockImplementationOnce(() => { throw new Error('no ref'); }); // remote ref

      const result = ensureFresh();
      expect(result.fresh).toBe(true); // assumes fresh when can't compare
      expect(result.branch).toBe('feature-branch');
    });

    it('handles total git failure gracefully', () => {
      execSync.mockImplementation(() => { throw new Error('not a git repo'); });

      const result = ensureFresh();
      expect(result.error).toBeDefined();
      // Non-fatal — scoring still proceeds
    });
  });

  describe('getGitMeta', () => {
    it('returns sha, branch, and shortSha', () => {
      execSync
        .mockReturnValueOnce('abc123def4567890\n') // HEAD
        .mockReturnValueOnce('main\n') // branch
        .mockReturnValueOnce('.git\n'); // git-dir

      const meta = getGitMeta();
      expect(meta.sha).toBe('abc123def4567890');
      expect(meta.shortSha).toBe('abc123def4');
      expect(meta.branch).toBe('main');
      expect(meta.isWorktree).toBe(false);
    });

    it('detects worktree from git-dir path', () => {
      execSync
        .mockReturnValueOnce('abc123\n')
        .mockReturnValueOnce('feat/branch\n')
        .mockReturnValueOnce('/repo/.worktrees/feat-branch/.git\n');

      const meta = getGitMeta();
      expect(meta.isWorktree).toBe(true);
    });

    it('handles git failure gracefully', () => {
      execSync.mockImplementation(() => { throw new Error('not a git repo'); });

      const meta = getGitMeta();
      expect(meta.sha).toBe('');
      expect(meta.branch).toBe('');
    });
  });

  describe('warnIfWorktree', () => {
    it('warns when in a worktree', () => {
      warnIfWorktree({ isWorktree: true, branch: 'feat/test' });
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('WORKTREE DETECTED')
      );
    });

    it('does not warn when not in worktree', () => {
      warnIfWorktree({ isWorktree: false, branch: 'main' });
      expect(console.warn).not.toHaveBeenCalled();
    });
  });
});
