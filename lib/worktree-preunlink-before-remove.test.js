/**
 * QF-20260523-697 regression: worktree teardown must unlink the node_modules
 * symlink/junction BEFORE `git worktree remove --force` runs, so git cannot
 * follow the link and delete the shared main-repo node_modules (recurrence of
 * feedback 95022758 / 9d091303). Exercises the rollbackWorktreeFilesystemSync
 * site, which shares the preUnlinkWorktreeNodeModules helper with the primary
 * removal path and cleanupOrphans.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const order = [];
const execSyncMock = vi.fn((cmd) => { order.push(`git:${cmd}`); return ''; });

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, execSync: (...a) => execSyncMock(...a) };
});

// Make a worktree node_modules look like a symlink so the pre-unlink path fires,
// and record unlink vs git-remove ordering.
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal();
  const base = actual.default || actual;
  const mocked = {
    ...base,
    lstatSync: (p) => String(p).replace(/\\/g, '/').endsWith('/node_modules')
      ? { isSymbolicLink: () => true }
      : base.lstatSync(p),
    unlinkSync: (p) => { order.push(`unlink:${p}`); },
    existsSync: () => true,
    rmSync: () => {},
  };
  return { ...mocked, default: mocked };
});

const { rollbackWorktreeFilesystemSync } = await import('./worktree-manager.js');

describe('QF-20260523-697: pre-unlink node_modules before git worktree remove', () => {
  beforeEach(() => { order.length = 0; execSyncMock.mockClear(); });

  it('unlinks the node_modules junction BEFORE git worktree remove (no shared-store wipe)', () => {
    const result = rollbackWorktreeFilesystemSync('/p/wt', '/p', { delaysMs: [0, 0, 0] });
    expect(result.ok).toBe(true);

    const unlinkIdx = order.findIndex(e => e.startsWith('unlink:') && e.includes('node_modules'));
    const gitIdx = order.findIndex(e => e.startsWith('git:') && e.includes('git worktree remove'));

    expect(unlinkIdx).toBeGreaterThanOrEqual(0); // node_modules link was unlinked
    expect(gitIdx).toBeGreaterThanOrEqual(0);     // git worktree remove ran
    expect(unlinkIdx).toBeLessThan(gitIdx);       // unlink happened FIRST, so git can't follow it
  });
});
