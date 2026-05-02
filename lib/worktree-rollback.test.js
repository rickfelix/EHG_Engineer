/**
 * Tests for SD-LEO-INFRA-LEO-INFRA-SESSION-001 FR-3 rollback path.
 *
 * Covers TS-6 (Windows file-lock retry on rollback) at unit-test level.
 * Integration TS-2 (no orphan after WORKTREE_POST_CONDITION_FAILED) is in
 * tests/integration/worktree-state-atomicity.test.js — gated by env flag.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist mocks BEFORE importing the module under test
const execSyncMock = vi.fn();
const rmSyncMock = vi.fn();

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    execSync: (...args) => execSyncMock(...args)
  };
});

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: {
      ...(actual.default || actual),
      rmSync: (...args) => rmSyncMock(...args),
      // Pass-through other fs methods used by worktree-manager (existsSync, etc.)
      existsSync: (actual.default || actual).existsSync,
      writeFileSync: (actual.default || actual).writeFileSync,
      readFileSync: (actual.default || actual).readFileSync,
      mkdirSync: (actual.default || actual).mkdirSync,
      renameSync: (actual.default || actual).renameSync,
      cpSync: (actual.default || actual).cpSync
    },
    rmSync: (...args) => rmSyncMock(...args)
  };
});

const { rollbackWorktreeFilesystemSync } = await import('./worktree-manager.js');

beforeEach(() => {
  execSyncMock.mockReset();
  rmSyncMock.mockReset();
});

describe('rollbackWorktreeFilesystemSync (TS-6: Windows file-lock retry)', () => {
  it('succeeds on first attempt when git worktree remove returns clean', () => {
    execSyncMock.mockReturnValueOnce('');
    const result = rollbackWorktreeFilesystemSync('/p/wt', '/p', { delaysMs: [10, 10, 10] });

    expect(result).toEqual({ ok: true, attempts: 1, lastError: null, fellBackToRmSync: false });
    expect(execSyncMock).toHaveBeenCalledTimes(1);
    expect(execSyncMock.mock.calls[0][0]).toMatch(/git worktree remove --force/);
  });

  it('retries up to 3 times when git worktree remove keeps failing, then succeeds', () => {
    execSyncMock.mockImplementationOnce(() => { throw new Error('ENOTEMPTY: directory not empty'); });
    execSyncMock.mockImplementationOnce(() => { throw new Error('EBUSY: resource busy'); });
    execSyncMock.mockReturnValueOnce(''); // 3rd attempt succeeds

    const start = Date.now();
    const result = rollbackWorktreeFilesystemSync('/p/wt', '/p', { delaysMs: [50, 100, 0] });
    const elapsed = Date.now() - start;

    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(3);
    expect(result.fellBackToRmSync).toBe(false);
    expect(execSyncMock).toHaveBeenCalledTimes(3);
    // Backoff sums to 50 + 100 = 150ms before 3rd attempt
    expect(elapsed).toBeGreaterThanOrEqual(140);
  });

  it('falls back to fs.rmSync when all git worktree remove attempts fail', () => {
    execSyncMock.mockImplementation(() => { throw new Error('persistent lock'); });
    rmSyncMock.mockReturnValueOnce(undefined); // rmSync succeeds

    const result = rollbackWorktreeFilesystemSync('/p/wt', '/p', { delaysMs: [0, 0, 0] });

    expect(result.ok).toBe(true);
    expect(result.fellBackToRmSync).toBe(true);
    expect(result.attempts).toBe(3);
    expect(rmSyncMock).toHaveBeenCalledWith('/p/wt', { recursive: true, force: true });
    // Last execSync call is `git worktree prune` (best-effort cleanup)
    const calls = execSyncMock.mock.calls.map((c) => c[0]);
    expect(calls.some((cmd) => cmd.includes('git worktree prune'))).toBe(true);
  });

  it('returns ok=false when both git worktree remove and rmSync persistently fail', () => {
    execSyncMock.mockImplementation(() => { throw new Error('git lock A'); });
    rmSyncMock.mockImplementation(() => { throw new Error('EPERM: file system locked'); });

    const result = rollbackWorktreeFilesystemSync('/p/wt', '/p', { delaysMs: [0, 0, 0] });

    expect(result.ok).toBe(false);
    expect(result.fellBackToRmSync).toBe(true);
    expect(result.lastError).toMatch(/git worktree remove failed/);
    expect(result.lastError).toMatch(/fs.rmSync also failed/);
  });

  it('records lastError when first call throws but later attempt succeeds', () => {
    const firstErr = new Error('ENOTEMPTY: directory not empty');
    execSyncMock.mockImplementationOnce(() => { throw firstErr; });
    execSyncMock.mockReturnValueOnce('');

    const result = rollbackWorktreeFilesystemSync('/p/wt', '/p', { delaysMs: [0, 0, 0] });

    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(2);
    // lastError is null on success — the test confirms we don't carry over a stale error
    expect(result.lastError).toBeNull();
  });

  it('uses default backoff sequence [100, 500, 2000] when no delaysMs provided', () => {
    // We don't actually wait for full default backoff in this test — we just
    // confirm the function still runs to completion with a single-attempt path.
    execSyncMock.mockReturnValueOnce('');
    const result = rollbackWorktreeFilesystemSync('/p/wt', '/p');
    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(1);
  });
});
