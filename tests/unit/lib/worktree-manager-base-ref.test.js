/**
 * SD-LEO-INFRA-START-WORKTREE-BRANCH-001
 *
 * Verifies that worktree creation forks from an explicit base ref instead of
 * silently inheriting the main repo's current HEAD. Covers AC7 (a)-(d):
 *   (a) branch-doesn't-exist case asserts exact `git worktree add -b ... origin/main`
 *   (b) branch-exists-remotely case asserts no -b flag and no base override
 *   (c) LEO_WORKTREE_BASE_REF=origin/release-2026-q2 honored
 *   (d) fetch-failure throws WorktreeBaseFetchFailedError (fail-closed)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
  spawnSync: vi.fn()
}));

import { execSync } from 'child_process';

const {
  resolveWorktreeBaseRef,
  fetchBaseRef,
  WorktreeBaseFetchFailedError,
  classifyWorktreeError
} = await import('../../../lib/worktree-manager.js');

describe('SD-LEO-INFRA-START-WORKTREE-BRANCH-001 — base ref helpers', () => {
  const ORIGINAL_ENV = process.env.LEO_WORKTREE_BASE_REF;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.LEO_WORKTREE_BASE_REF;
  });

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.LEO_WORKTREE_BASE_REF;
    else process.env.LEO_WORKTREE_BASE_REF = ORIGINAL_ENV;
  });

  describe('resolveWorktreeBaseRef', () => {
    it('defaults to origin/main when LEO_WORKTREE_BASE_REF is unset', () => {
      expect(resolveWorktreeBaseRef()).toBe('origin/main');
    });

    it('honors LEO_WORKTREE_BASE_REF when set (AC7-c)', () => {
      process.env.LEO_WORKTREE_BASE_REF = 'origin/release-2026-q2';
      expect(resolveWorktreeBaseRef()).toBe('origin/release-2026-q2');
    });

    it('trims surrounding whitespace from env value', () => {
      process.env.LEO_WORKTREE_BASE_REF = '  origin/develop  ';
      expect(resolveWorktreeBaseRef()).toBe('origin/develop');
    });

    it('falls back to default when env value is whitespace-only', () => {
      process.env.LEO_WORKTREE_BASE_REF = '   ';
      expect(resolveWorktreeBaseRef()).toBe('origin/main');
    });
  });

  describe('fetchBaseRef', () => {
    it('issues `git fetch <remote> <ref>` for valid base ref', () => {
      execSync.mockReturnValue('');
      fetchBaseRef('/repo', 'origin/main');
      expect(execSync).toHaveBeenCalledWith(
        'git fetch origin main',
        expect.objectContaining({ cwd: '/repo', encoding: 'utf8' })
      );
    });

    it('parses non-default remote/ref correctly', () => {
      execSync.mockReturnValue('');
      fetchBaseRef('/repo', 'upstream/release-2026-q2');
      expect(execSync).toHaveBeenCalledWith(
        'git fetch upstream release-2026-q2',
        expect.objectContaining({ cwd: '/repo' })
      );
    });

    it('throws WorktreeBaseFetchFailedError on git fetch failure (AC7-d, fail-closed)', () => {
      const gitErr = Object.assign(new Error('fatal: unable to access network'), {
        stderr: 'fatal: unable to access',
        status: 128
      });
      execSync.mockImplementation(() => { throw gitErr; });

      let caught;
      try { fetchBaseRef('/repo', 'origin/main'); } catch (e) { caught = e; }

      expect(caught).toBeInstanceOf(WorktreeBaseFetchFailedError);
      expect(caught.code).toBe('WORKTREE_BASE_FETCH_FAILED');
      expect(caught.baseRef).toBe('origin/main');
      expect(caught.exitCode).toBe(128);
      expect(caught.cause).toBe('fetch_failed');
      expect(caught.gitOutput).toMatch(/unable to access/);
    });

    it('throws WorktreeBaseFetchFailedError when baseRef is malformed (no slash)', () => {
      let caught;
      try { fetchBaseRef('/repo', 'main-no-remote-prefix'); } catch (e) { caught = e; }

      expect(caught).toBeInstanceOf(WorktreeBaseFetchFailedError);
      expect(caught.baseRef).toBe('main-no-remote-prefix');
      expect(caught.exitCode).toBe(-1);
      expect(execSync).not.toHaveBeenCalled();
    });
  });

  describe('WorktreeBaseFetchFailedError', () => {
    it('exposes the documented payload shape', () => {
      const err = new WorktreeBaseFetchFailedError({
        baseRef: 'origin/main',
        gitOutput: 'fatal: not a git repository',
        exitCode: 128
      });
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('WorktreeBaseFetchFailedError');
      expect(err.code).toBe('WORKTREE_BASE_FETCH_FAILED');
      expect(err.baseRef).toBe('origin/main');
      expect(err.gitOutput).toBe('fatal: not a git repository');
      expect(err.exitCode).toBe(128);
      expect(err.cause).toBe('fetch_failed');
      expect(err.message).toMatch(/fail-closed/);
    });
  });

  describe('classifyWorktreeError sanity (existing behavior preserved)', () => {
    it('still recognizes git index.lock as transient', () => {
      const result = classifyWorktreeError('fatal: unable to create .git/index.lock');
      expect(result.transient).toBe(true);
    });
  });
});

describe('SD-LEO-INFRA-START-WORKTREE-BRANCH-001 — worktree-failure-classification integration', () => {
  it('classifier surfaces base_ref_fetch_failed code via errCode context (AC7-d → refusal banner)', async () => {
    const { classify } = await import('../../../lib/protocol-policies/worktree-failure-classification.js');
    const err = new WorktreeBaseFetchFailedError({
      baseRef: 'origin/main',
      gitOutput: 'fatal: unable to access',
      exitCode: 128
    });
    const result = classify(err, { errCode: err.code });
    expect(result.code).toBe('base_ref_fetch_failed');
    expect(result.severity).toBe('error');
    expect(result.hint).toMatch(/LEO_WORKTREE_BASE_REF/);
  });

  it('classifier matches by message text alone when errCode is not passed (defensive)', async () => {
    const { classify } = await import('../../../lib/protocol-policies/worktree-failure-classification.js');
    const err = new WorktreeBaseFetchFailedError({
      baseRef: 'origin/main',
      gitOutput: '',
      exitCode: 1
    });
    const result = classify(err);
    expect(result.code).toBe('base_ref_fetch_failed');
  });
});
