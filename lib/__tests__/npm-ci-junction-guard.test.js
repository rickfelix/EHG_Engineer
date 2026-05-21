// harness 95022758 / QF-20260521-389: guard that refuses `npm ci` when it would
// rm -rf the SHARED node_modules store and brick parallel sessions.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { npmCiWouldWipeSharedStore, NPM_CI_RE } = require('../npm-ci-junction-guard.cjs');

// Build an injectable fake fs from a {relPath: kind} spec. kind ∈
// 'symlink' | 'file' | 'dir'. Absent paths throw ENOENT (like real fs).
function fakeFs(spec) {
  const norm = p => p.replace(/\\/g, '/');
  const get = p => {
    const key = Object.keys(spec).find(k => norm(p).endsWith(k));
    return key ? spec[key] : null;
  };
  return {
    lstatSync(p) {
      const kind = get(p);
      if (!kind) { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; }
      return {
        isSymbolicLink: () => kind === 'symlink',
        isFile: () => kind === 'file',
        isDirectory: () => kind === 'dir',
      };
    },
    existsSync(p) { return get(p) != null; },
    readdirSync(p) { return get(p) === 'dir' ? ['qf'] : []; },
  };
}

describe('NPM_CI_RE', () => {
  it('matches real npm ci invocations', () => {
    expect(NPM_CI_RE.test('npm ci')).toBe(true);
    expect(NPM_CI_RE.test('npm ci --no-audit')).toBe(true);
    expect(NPM_CI_RE.test('cd /tmp && npm ci')).toBe(true);
  });
  it('does NOT match npm install / npm i / lookalikes', () => {
    expect(NPM_CI_RE.test('npm install')).toBe(false);
    expect(NPM_CI_RE.test('npm i')).toBe(false);
    expect(NPM_CI_RE.test('npm cite something')).toBe(false);
    expect(NPM_CI_RE.test('npmci')).toBe(false);
  });
});

describe('npmCiWouldWipeSharedStore', () => {
  it('BLOCKS npm ci when node_modules is a junction (rm -rf follows it)', () => {
    const fs = fakeFs({ '/wt/node_modules': 'symlink' });
    const r = npmCiWouldWipeSharedStore({ command: 'npm ci', cwd: '/wt', fs });
    expect(r.wipes).toBe(true);
    expect(r.reason).toBe('node_modules_is_junction');
  });

  it('ALLOWS npm ci in an isolated worktree (real node_modules, .git is a file)', () => {
    const fs = fakeFs({ '/wt/node_modules': 'dir', '/wt/.git': 'file' });
    const r = npmCiWouldWipeSharedStore({ command: 'npm ci', cwd: '/wt', fs });
    expect(r.wipes).toBe(false);
    expect(r.reason).toBe('isolated_worktree');
  });

  it('BLOCKS npm ci in the main repo root when worktrees are active', () => {
    const fs = fakeFs({ '/repo/node_modules': 'dir', '/repo/.git': 'dir', '/repo/.worktrees': 'dir' });
    const r = npmCiWouldWipeSharedStore({ command: 'npm ci', cwd: '/repo', fs });
    expect(r.wipes).toBe(true);
    expect(r.reason).toBe('main_root_with_active_worktrees');
  });

  it('ALLOWS npm ci in the main repo root with no worktrees', () => {
    const fs = fakeFs({ '/repo/node_modules': 'dir', '/repo/.git': 'dir' });
    const r = npmCiWouldWipeSharedStore({ command: 'npm ci', cwd: '/repo', fs });
    expect(r.wipes).toBe(false);
    expect(r.reason).toBe('no_shared_sharers');
  });

  it('IGNORES npm install (additive — never wipes)', () => {
    const fs = fakeFs({ '/wt/node_modules': 'symlink' });
    const r = npmCiWouldWipeSharedStore({ command: 'npm install --ignore-scripts', cwd: '/wt', fs });
    expect(r.wipes).toBe(false);
    expect(r.reason).toBe('not_npm_ci');
  });
});
