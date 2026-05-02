/**
 * ENFORCEMENT 13 — Worktree Hygiene Guard (SD-LEO-INFRA-PRE-TOOL-WORKTREE-GUARD-001)
 *
 * Spawns pre-tool-enforce.cjs as a subprocess against a synthetic temp git
 * repo to exercise: HARD BLOCK on main/master, WARN-ONCE on inherited dirt
 * with non-feature branch, allow on feature branches, off-switch behavior,
 * and fail-open paths (no git repo, transient git errors).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const hookPath = path.resolve('scripts/hooks/pre-tool-enforce.cjs');

function runHook(toolName, toolInput, env = {}) {
  const mergedEnv = {
    ...process.env,
    CLAUDE_TOOL_NAME: toolName,
    CLAUDE_TOOL_INPUT: JSON.stringify(toolInput),
    // Disable other rules that might interfere
    LEO_NPM_INSTALL_GUARD: 'off',
    LEO_NPM_INSTALL_GUARD_PS: 'off',
    LEO_RCA_ENFORCEMENT: 'off',
    // Disable audit-log fetch so the hook process exits promptly on
    // non-blocking paths (warn falls through; pending fetch would otherwise
    // hold the event loop until network timeout).
    SUPABASE_URL: '',
    SUPABASE_SERVICE_ROLE_KEY: '',
    CLAUDE_SESSION_ID: 'test-session-' + Math.random().toString(36).slice(2, 10),
    ...env,
  };
  try {
    const stdout = execSync(`node "${hookPath}"`, {
      env: mergedEnv,
      timeout: 15000,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { exitCode: 0, stdout, stderr: '' };
  } catch (err) {
    return { exitCode: err.status, stdout: err.stdout || '', stderr: err.stderr || '' };
  }
}

function initRepo(dir, branch, dirtyFiles = 0) {
  fs.mkdirSync(dir, { recursive: true });
  const opts = { cwd: dir, stdio: ['ignore', 'ignore', 'ignore'] };
  execSync('git init -q', opts);
  execSync('git config user.email "test@example.com"', opts);
  execSync('git config user.name "test"', opts);
  // Initialize on the requested branch from the start to avoid any
  // default-branch-name surprises (init.defaultBranch differs by host).
  execSync(`git checkout -q -b ${branch}`, opts);
  fs.writeFileSync(path.join(dir, 'README.md'), 'init\n');
  execSync('git add README.md', opts);
  execSync('git commit -q -m "init"', opts);
  for (let i = 0; i < dirtyFiles; i++) {
    fs.writeFileSync(path.join(dir, `dirty-${i}.txt`), `untracked ${i}\n`);
  }
}

describe('pre-tool-enforce — ENFORCEMENT 13 (worktree hygiene guard)', () => {
  let tmpDir;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wtree-hyg-'));
  });
  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  it('HARD BLOCKS Edit on main', () => {
    initRepo(tmpDir, 'main');
    const target = path.join(tmpDir, 'foo.js');
    const r = runHook('Edit', { file_path: target, old_string: 'a', new_string: 'b' });
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain('WORKTREE HYGIENE GUARD');
    expect(r.stderr).toContain("'main'");
    expect(r.stderr).toContain('npm run session:worktree');
  });

  it('HARD BLOCKS Write on master', () => {
    initRepo(tmpDir, 'master');
    const target = path.join(tmpDir, 'foo.js');
    const r = runHook('Write', { file_path: target, content: 'x' });
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain('WORKTREE HYGIENE GUARD');
    expect(r.stderr).toContain("'master'");
  });

  it('allows Edit on feature branch (feat/SD-...)', () => {
    initRepo(tmpDir, 'feat/SD-LEO-INFRA-PRE-TOOL-WORKTREE-GUARD-001');
    const target = path.join(tmpDir, 'foo.js');
    const r = runHook('Edit', { file_path: target, old_string: 'a', new_string: 'b' });
    expect(r.exitCode).toBe(0);
    expect(r.stderr).not.toContain('WORKTREE HYGIENE');
  });

  it('allows Edit on QF branch (qf/QF-...)', () => {
    initRepo(tmpDir, 'qf/QF-20260502-001');
    const target = path.join(tmpDir, 'foo.js');
    const r = runHook('Edit', { file_path: target, old_string: 'a', new_string: 'b' });
    expect(r.exitCode).toBe(0);
  });

  it('warns once on non-feature branch with >25 inherited modifications', () => {
    initRepo(tmpDir, 'wip-experiment', 30);
    const target = path.join(tmpDir, 'foo.js');
    const r = runHook('Edit', { file_path: target, old_string: 'a', new_string: 'b' });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('[worktree-hygiene] WARNING');
    expect(r.stdout).toContain('30 inherited modifications');
    expect(r.stdout).toContain('non-feature branch');
  });

  it('does NOT warn on non-feature branch when dirty count is below threshold', () => {
    initRepo(tmpDir, 'wip-experiment', 5);
    const target = path.join(tmpDir, 'foo.js');
    const r = runHook('Edit', { file_path: target, old_string: 'a', new_string: 'b' });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).not.toContain('[worktree-hygiene]');
  });

  it('warn-once: only one warning across consecutive Edit calls in same session', () => {
    initRepo(tmpDir, 'wip-experiment', 30);
    const target = path.join(tmpDir, 'foo.js');
    const sessionId = 'fixed-session-id-for-warn-once-test';
    const env = { CLAUDE_SESSION_ID: sessionId };
    const r1 = runHook('Edit', { file_path: target, old_string: 'a', new_string: 'b' }, env);
    const r2 = runHook('Edit', { file_path: target, old_string: 'a', new_string: 'b' }, env);
    expect(r1.stdout).toContain('[worktree-hygiene] WARNING');
    expect(r2.stdout).not.toContain('[worktree-hygiene] WARNING');
  });

  it('off-switch LEO_WORKTREE_GUARD=off allows Edit on main', () => {
    initRepo(tmpDir, 'main');
    const target = path.join(tmpDir, 'foo.js');
    const r = runHook(
      'Edit',
      { file_path: target, old_string: 'a', new_string: 'b' },
      { LEO_WORKTREE_GUARD: 'off' }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stderr).not.toContain('WORKTREE HYGIENE');
  });

  it('fails open when target path is outside any git repo', () => {
    // /tmp/outside-repo is not a git repo
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-git-'));
    const target = path.join(outsideDir, 'foo.js');
    const r = runHook('Edit', { file_path: target, old_string: 'a', new_string: 'b' });
    expect(r.exitCode).toBe(0);
    expect(r.stderr).not.toContain('WORKTREE HYGIENE');
    try { fs.rmSync(outsideDir, { recursive: true, force: true }); } catch {}
  });

  it('does not apply to other tool names (e.g. Bash)', () => {
    initRepo(tmpDir, 'main');
    const r = runHook('Bash', { command: 'echo ok', cwd: tmpDir });
    expect(r.exitCode).toBe(0);
    expect(r.stderr).not.toContain('WORKTREE HYGIENE');
  });
});
