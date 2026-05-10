/**
 * Unit tests for lib/multi-repo/index.js getRepoGitStatus stderr-leak fix.
 * QF-20260509-442 — PAT-EXEC-SYNC-STDERR-LEAK-IN-CATCH-001.
 *
 * Pins:
 *   1. When origin/<branch> ref doesn't exist (rev-parse --verify throws),
 *      rev-list --count is NOT called and unpushedCount = 0.
 *   2. When origin/<branch> exists, rev-list --count is called and the count
 *      is parsed correctly.
 *   3. All execSync calls in getRepoGitStatus pass stdio:'pipe' so child
 *      stderr cannot leak to parent terminal even when the command throws
 *      and the JS exception is swallowed by an empty catch.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let execSyncMock;

vi.mock('child_process', () => ({
  execSync: (...args) => execSyncMock(...args),
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    statSync: vi.fn(() => ({ mtime: new Date() })),
  };
});

async function importModule() {
  vi.resetModules();
  return import('../../lib/multi-repo/index.js');
}

function findCallContaining(calls, needle) {
  return calls.find((c) => typeof c[0] === 'string' && c[0].includes(needle));
}

describe('lib/multi-repo getRepoGitStatus — stderr leak fix', () => {
  beforeEach(() => {
    execSyncMock = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does NOT call rev-list when origin/<branch> ref is missing (PR-merged + remote-deleted scenario)', async () => {
    execSyncMock.mockImplementation((cmd) => {
      if (cmd.includes('rev-parse --abbrev-ref HEAD')) return 'feat/merged-branch\n';
      if (cmd.includes('git status --porcelain')) return '';
      if (cmd.includes('rev-parse --verify --quiet refs/remotes/origin/')) {
        const err = new Error("fatal: Needed a single revision");
        err.status = 1;
        throw err;
      }
      if (cmd.includes('rev-list --count origin/')) {
        throw new Error('rev-list should not be called when origin ref is missing');
      }
      return '';
    });

    const { getRepoGitStatus } = await importModule();
    const result = getRepoGitStatus('/some/repo');

    expect(result.branch).toBe('feat/merged-branch');
    expect(result.unpushedCount).toBe(0);
    expect(result.hasUnpushed).toBe(false);
    const revListCall = findCallContaining(execSyncMock.mock.calls, 'rev-list --count origin/');
    expect(revListCall).toBeUndefined();
    const verifyCall = findCallContaining(execSyncMock.mock.calls, 'rev-parse --verify --quiet refs/remotes/origin/feat/merged-branch');
    expect(verifyCall).toBeDefined();
  });

  it('calls rev-list and parses count when origin/<branch> ref exists', async () => {
    execSyncMock.mockImplementation((cmd) => {
      if (cmd.includes('rev-parse --abbrev-ref HEAD')) return 'feat/active-branch\n';
      if (cmd.includes('git status --porcelain')) return '';
      if (cmd.includes('rev-parse --verify --quiet refs/remotes/origin/')) return '';
      if (cmd.includes('rev-list --count origin/feat/active-branch..HEAD')) return '3\n';
      return '';
    });

    const { getRepoGitStatus } = await importModule();
    const result = getRepoGitStatus('/some/repo');

    expect(result.unpushedCount).toBe(3);
    expect(result.hasUnpushed).toBe(true);
    const revListCall = findCallContaining(execSyncMock.mock.calls, 'rev-list --count origin/feat/active-branch..HEAD');
    expect(revListCall).toBeDefined();
  });

  it('passes stdio:"pipe" to ALL execSync calls in getRepoGitStatus (regression-pin against stderr leak)', async () => {
    execSyncMock.mockImplementation((cmd) => {
      if (cmd.includes('rev-parse --abbrev-ref HEAD')) return 'main\n';
      if (cmd.includes('git status --porcelain')) return '';
      if (cmd.includes('rev-parse --verify --quiet refs/remotes/origin/')) return '';
      if (cmd.includes('rev-list --count origin/main..HEAD')) return '0\n';
      return '';
    });

    const { getRepoGitStatus } = await importModule();
    getRepoGitStatus('/some/repo');

    // PAT-EXEC-SYNC-STDERR-LEAK-IN-CATCH-001: every execSync invocation in
    // this code path must set stdio:'pipe' (or array form) so child stderr
    // is captured rather than inherited to the parent terminal.
    for (const call of execSyncMock.mock.calls) {
      const opts = call[1] ?? {};
      const stdio = opts.stdio;
      const ok = stdio === 'pipe'
        || (Array.isArray(stdio) && stdio.length === 3 && stdio[2] !== 'inherit' && stdio[2] !== 2);
      expect(ok, `execSync call missing stdio:'pipe': ${call[0]}`).toBe(true);
    }
  });

  it('returns shape with default unpushedCount=0 on outer catch (e.g. cwd not a repo)', async () => {
    execSyncMock.mockImplementation(() => {
      const err = new Error('fatal: not a git repository');
      err.status = 128;
      throw err;
    });

    const { getRepoGitStatus } = await importModule();
    const result = getRepoGitStatus('/not-a-repo');

    expect(result.error).toMatch(/not a git repository/);
    expect(result.unpushedCount).toBe(0);
    expect(result.hasUnpushed).toBe(false);
    expect(result.isClean).toBe(true);
  });
});
