// QF-20260721-742: guard that refuses a raw `git worktree remove` / `rm -rf` /
// `Remove-Item -Recurse` / `rmdir /s` when it would follow a node_modules junction
// into the SHARED store and brick every parallel session — the 4th recurrence of the
// shared-store wipe, distinct from lib/npm-ci-junction-guard.cjs (which guards `npm ci`).
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { worktreeRemoveWouldWipeSharedStore } = require('../worktree-remove-junction-guard.cjs');

function fakeFs(spec) {
  const norm = (p) => p.replace(/\\/g, '/');
  const get = (p) => {
    const key = Object.keys(spec).find((k) => norm(p).endsWith(k));
    return key ? spec[key] : null;
  };
  return {
    lstatSync(p) {
      const kind = get(p);
      if (!kind) {
        const e = new Error('ENOENT');
        e.code = 'ENOENT';
        throw e;
      }
      return { isSymbolicLink: () => kind === 'symlink', isFile: () => kind === 'file', isDirectory: () => kind === 'dir' };
    },
  };
}

describe('worktreeRemoveWouldWipeSharedStore', () => {
  it('BLOCKS `git worktree remove` on a worktree whose node_modules is a junction', () => {
    const fs = fakeFs({ '.worktrees/QF-1/node_modules': 'symlink' });
    const r = worktreeRemoveWouldWipeSharedStore({
      command: 'git worktree remove --force .worktrees/QF-1',
      cwd: '/repo',
      fs,
    });
    expect(r.wipes).toBe(true);
    expect(r.reason).toBe('node_modules_is_junction');
  });

  it('BLOCKS a raw `rm -rf` on a junctioned worktree path', () => {
    const fs = fakeFs({ '.worktrees/QF-1/node_modules': 'symlink' });
    const r = worktreeRemoveWouldWipeSharedStore({ command: 'rm -rf .worktrees/QF-1', cwd: '/repo', fs });
    expect(r.wipes).toBe(true);
    expect(r.reason).toBe('node_modules_is_junction');
  });

  it('BLOCKS PowerShell `Remove-Item -Recurse -Force` on a junctioned worktree path', () => {
    const fs = fakeFs({ '.worktrees/QF-1/node_modules': 'symlink' });
    const r = worktreeRemoveWouldWipeSharedStore({
      command: 'Remove-Item -Recurse -Force .worktrees/QF-1',
      cwd: '/repo',
      fs,
    });
    expect(r.wipes).toBe(true);
  });

  it('ALLOWS `git worktree remove` when node_modules is a real directory (isolated install)', () => {
    const fs = fakeFs({ '.worktrees/QF-1/node_modules': 'dir' });
    const r = worktreeRemoveWouldWipeSharedStore({
      command: 'git worktree remove --force .worktrees/QF-1',
      cwd: '/repo',
      fs,
    });
    expect(r.wipes).toBe(false);
    expect(r.reason).toBe('node_modules_not_a_junction');
  });

  it('ALLOWS `git worktree remove` when node_modules is absent (nothing to follow)', () => {
    const fs = fakeFs({});
    const r = worktreeRemoveWouldWipeSharedStore({
      command: 'git worktree remove --force .worktrees/QF-1',
      cwd: '/repo',
      fs,
    });
    expect(r.wipes).toBe(false);
    expect(r.reason).toBe('node_modules_not_a_junction');
  });

  it('IGNORES removals of paths NOT under .worktrees/ or .trees/', () => {
    const fs = fakeFs({ 'some/other/dir/node_modules': 'symlink' });
    const r = worktreeRemoveWouldWipeSharedStore({ command: 'rm -rf some/other/dir', cwd: '/repo', fs });
    expect(r.wipes).toBe(false);
    expect(r.reason).toBe('not_under_worktrees_dir');
  });

  it('IGNORES an unrelated command', () => {
    const fs = fakeFs({ '.worktrees/QF-1/node_modules': 'symlink' });
    const r = worktreeRemoveWouldWipeSharedStore({ command: 'npm test', cwd: '/repo', fs });
    expect(r.wipes).toBe(false);
    expect(r.reason).toBe('not_a_worktree_removal');
  });

  it('does NOT false-positive on a mention inside a quoted string / commit message', () => {
    const fs = fakeFs({ '.worktrees/QF-1/node_modules': 'symlink' });
    const r = worktreeRemoveWouldWipeSharedStore({
      command: 'git commit -m "fixes: guard against git worktree remove wiping node_modules"',
      cwd: '/repo',
      fs,
    });
    expect(r.wipes).toBe(false);
    expect(r.reason).toBe('not_a_worktree_removal');
  });
});
