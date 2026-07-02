import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { relaunchOntoFreshCheckout } from './singleton-relaunch.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout.trim();
}

describe('relaunchOntoFreshCheckout (FR-3, TS-4/TS-5)', () => {
  let bareRepo;
  let localRepo;

  beforeEach(() => {
    // A throwaway bare "remote" + a local clone (git clone wires up `origin` automatically),
    // sidestepping any real-repo worktree quota (TESTING guidance: precedent in
    // tests/worktree-self-heal-empty-stale-dir.test.js).
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'singleton-relaunch-'));
    bareRepo = path.join(root, 'remote.git');
    localRepo = path.join(root, 'local');
    fs.mkdirSync(bareRepo, { recursive: true });
    git(bareRepo, 'init', '-q', '--bare', '-b', 'main');

    const seedDir = path.join(root, 'seed');
    fs.mkdirSync(seedDir, { recursive: true });
    git(seedDir, 'init', '-q', '-b', 'main');
    git(seedDir, 'config', 'user.email', 'test@example.com');
    git(seedDir, 'config', 'user.name', 'test');
    fs.writeFileSync(path.join(seedDir, 'seed.txt'), 'seed');
    git(seedDir, 'add', '.');
    git(seedDir, 'commit', '-q', '-m', 'seed');
    git(seedDir, 'remote', 'add', 'origin', bareRepo);
    git(seedDir, 'push', '-q', 'origin', 'main');

    git(root, 'clone', '-q', bareRepo, localRepo);
    git(localRepo, 'config', 'user.email', 'test@example.com');
    git(localRepo, 'config', 'user.name', 'test');
  });

  afterEach(() => {
    try { fs.rmSync(path.dirname(bareRepo), { recursive: true, force: true }); } catch {}
  });

  it('creates a genuinely new worktree checked out from origin/main, never an in-place pull (TS-4)', () => {
    const headBefore = git(localRepo, 'rev-parse', 'HEAD');
    const branchBefore = git(localRepo, 'branch', '--show-current');
    const r = relaunchOntoFreshCheckout({ role: 'test-role', workKey: 'smoke-' + Date.now(), repoRoot: localRepo });

    expect(fs.existsSync(r.worktreePath)).toBe(true);
    const newHead = git(r.worktreePath, 'log', '-1', '--format=%H');
    const originMain = git(localRepo, 'rev-parse', 'origin/main');
    expect(newHead).toBe(originMain);
    expect(r.freshness.verdict).toBe('FRESH');

    // Caller's own checkout (HEAD + branch) is untouched — no git pull/reset ran against
    // localRepo itself; the new worktree is a SEPARATE checkout, not a mutation of this one.
    expect(git(localRepo, 'rev-parse', 'HEAD')).toBe(headBefore);
    expect(git(localRepo, 'branch', '--show-current')).toBe(branchBefore);
  });

  it('throws on STALE-CRITICAL rather than silently returning a drifted checkout', () => {
    const deps = {
      createWorkTypeWorktree: () => ({ mode: 'worktree', path: localRepo, branch: 'main', created: true, reused: false }),
      checkoutFreshness: () => ({ verdict: 'STALE-CRITICAL', reason: 'CLAUDE.md drifted' }),
      VERDICT: { FRESH: 'FRESH', STALE: 'STALE', STALE_CRITICAL: 'STALE-CRITICAL' },
    };
    expect(() => relaunchOntoFreshCheckout({ role: 'test-role', workKey: 'stale', repoRoot: localRepo, deps }))
      .toThrow(/STALE-CRITICAL/);
  });

  it('throws when the worktree factory falls back to main-fallback instead of a fresh checkout', () => {
    const deps = {
      createWorkTypeWorktree: () => ({ mode: 'main-fallback', path: localRepo, branch: 'main', reason: 'fetch failed' }),
    };
    expect(() => relaunchOntoFreshCheckout({ role: 'test-role', workKey: 'fallback', repoRoot: localRepo, deps }))
      .toThrow(/did not get a fresh worktree/);
  });

  it('requires role and workKey', () => {
    expect(() => relaunchOntoFreshCheckout({ workKey: 'x', repoRoot: localRepo })).toThrow(/role is required/);
    expect(() => relaunchOntoFreshCheckout({ role: 'x', repoRoot: localRepo })).toThrow(/workKey is required/);
  });
});

describe('relaunchOntoFreshCheckout scope boundary (TS-5: never touches registration/removal)', () => {
  it('the module has no import/require statement referencing registration or worktree-removal functions', () => {
    const src = fs.readFileSync(path.join(__dirname, 'singleton-relaunch.js'), 'utf8');
    // Only check actual import/require statements (not JSDoc prose explaining the boundary).
    const importLines = src.split('\n').filter((l) => /^\s*import\s|require\(/.test(l));
    const importedText = importLines.join('\n');
    expect(importedText).not.toMatch(/adam-register|registerAdam|solomon-register|registerSolomon/);
    expect(importedText).not.toMatch(/removeWorktree|cleanupWorktree/);
    // Sanity: the file DOES import what it's supposed to (proves the filter isn't vacuous).
    expect(importedText).toMatch(/worktree-manager\.js/);
  });
});
