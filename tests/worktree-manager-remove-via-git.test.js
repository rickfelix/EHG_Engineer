/**
 * Tests for lib/worktree-manager.js removeWorktreeViaGit().
 *
 * QF-20260511-446 — closes feedback 68a6f715 (mid-session node_modules wipe)
 * + a8d2b446 (mid-LEAD-phase worktree wipe). Root cause: three call sites
 * invoked `git worktree remove --force <wtPath>` without first unlinking the
 * worktree's `node_modules` symlink. On Windows with MSYS bash symlinks
 * (not Windows junctions), git follows the link and deletes the target's
 * contents — i.e. wipes main repo's node_modules.
 *
 * These tests assert the helper:
 *   1. Calls fs.lstatSync on <wtPath>/node_modules
 *   2. If the entry is a symlink, calls fs.unlinkSync BEFORE execSync
 *   3. Then calls execSync with the exact git command + cwd=repoRoot
 *   4. Returns {ok:true,error:null} on success
 *   5. Returns {ok:false,error:<msg>} when allowFail and git fails
 *   6. Re-throws when allowFail is false
 *   7. Tolerates missing node_modules (lstat throws — swallowed)
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const calls = [];
function recordCall(name, args) { calls.push({ name, args }); }

vi.mock('fs', () => ({
  default: {
    lstatSync: vi.fn((p) => {
      recordCall('lstatSync', [p]);
      if (lstatBehavior.throws) throw lstatBehavior.error;
      return { isSymbolicLink: () => lstatBehavior.isSymlink };
    }),
    unlinkSync: vi.fn((p) => { recordCall('unlinkSync', [p]); }),
    rmdirSync: vi.fn((p) => { recordCall('rmdirSync', [p]); }),
    existsSync: vi.fn(() => true),
    readlinkSync: vi.fn(() => ''),
    rmSync: vi.fn(),
    cpSync: vi.fn(),
    symlinkSync: vi.fn(),
    readdirSync: vi.fn(() => []),
    mkdirSync: vi.fn(),
    statSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(() => ''),
  },
  lstatSync: vi.fn(),
  unlinkSync: vi.fn(),
  existsSync: vi.fn(() => true),
}));

vi.mock('child_process', () => ({
  execSync: vi.fn((cmd, opts) => {
    recordCall('execSync', [cmd, opts?.cwd]);
    if (execBehavior.throws) throw execBehavior.error;
    return '';
  }),
  spawnSync: vi.fn(),
}));

let lstatBehavior;
let execBehavior;

import { removeWorktreeViaGit } from '../lib/worktree-manager.js';

describe('removeWorktreeViaGit (QF-20260511-446)', () => {
  beforeEach(() => {
    calls.length = 0;
    lstatBehavior = { isSymlink: true, throws: false, error: null };
    execBehavior = { throws: false, error: null };
  });

  it('unlinks node_modules symlink BEFORE running git worktree remove', () => {
    const result = removeWorktreeViaGit('/repo/.worktrees/SD-1', '/repo');
    const unlinkIdx = calls.findIndex(c => c.name === 'unlinkSync');
    const execIdx = calls.findIndex(c => c.name === 'execSync');
    expect(unlinkIdx).toBeGreaterThanOrEqual(0);
    expect(execIdx).toBeGreaterThan(unlinkIdx);
    expect(result).toEqual({ ok: true, error: null });
  });

  it('passes correct git command and cwd=repoRoot', () => {
    removeWorktreeViaGit('/repo/.worktrees/SD-1', '/repo');
    const exec = calls.find(c => c.name === 'execSync');
    expect(exec.args[0]).toBe('git worktree remove --force "/repo/.worktrees/SD-1"');
    expect(exec.args[1]).toBe('/repo');
  });

  it('skips unlink when node_modules is NOT a symlink', () => {
    lstatBehavior.isSymlink = false;
    removeWorktreeViaGit('/repo/.worktrees/SD-1', '/repo');
    expect(calls.find(c => c.name === 'unlinkSync')).toBeUndefined();
    expect(calls.find(c => c.name === 'execSync')).toBeDefined();
  });

  it('tolerates missing node_modules (lstat throws → swallowed)', () => {
    lstatBehavior.throws = true;
    lstatBehavior.error = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    const result = removeWorktreeViaGit('/repo/.worktrees/SD-1', '/repo');
    expect(result.ok).toBe(true);
    expect(calls.find(c => c.name === 'unlinkSync')).toBeUndefined();
    expect(calls.find(c => c.name === 'execSync')).toBeDefined();
  });

  it('returns {ok:false,error} when allowFail and git fails', () => {
    execBehavior.throws = true;
    execBehavior.error = new Error('fatal: worktree busy');
    const result = removeWorktreeViaGit('/repo/.worktrees/SD-1', '/repo', { allowFail: true });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/worktree busy/);
  });

  it('re-throws when allowFail is false and git fails', () => {
    execBehavior.throws = true;
    execBehavior.error = new Error('fatal: worktree busy');
    expect(() => removeWorktreeViaGit('/repo/.worktrees/SD-1', '/repo')).toThrow(/worktree busy/);
  });
});
