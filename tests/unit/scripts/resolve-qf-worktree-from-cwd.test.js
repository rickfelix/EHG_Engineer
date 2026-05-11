/**
 * QF-20260511-123 — resolveQFWorktreeFromCwd
 *
 * Validates the CWD→worktree resolver added to complete-quick-fix git-operations.
 * Closes feedback 0930f169 (Windows shell-cwd vs node process.cwd() asymmetry that
 * caused Test Dir to fall back to the parent repo, picking up parallel-session
 * dirty state and tripping the failing-tests gate).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { resolveQFWorktreeFromCwd } from '../../../scripts/modules/complete-quick-fix/git-operations.js';

describe('resolveQFWorktreeFromCwd', () => {
  let scratchRoot;
  let worktreeDir;

  beforeAll(() => {
    scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qf-cwd-resolver-'));
    const fakeRepo = path.join(scratchRoot, 'repo');
    fs.mkdirSync(fakeRepo, { recursive: true });
    execSync('git init -q', { cwd: fakeRepo });
    execSync('git config user.email test@example.com', { cwd: fakeRepo });
    execSync('git config user.name test', { cwd: fakeRepo });
    fs.writeFileSync(path.join(fakeRepo, 'a.txt'), 'a');
    execSync('git add a.txt && git commit -q -m seed', { cwd: fakeRepo });
    worktreeDir = path.join(fakeRepo, '.worktrees', 'qf', 'QF-20260101-001');
    execSync(`git worktree add -q -b qf/QF-20260101-001 "${worktreeDir}"`, { cwd: fakeRepo });
  });

  afterAll(() => {
    try { fs.rmSync(scratchRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
  });

  it('returns the worktree path when cwd is the worktree root', () => {
    const resolved = resolveQFWorktreeFromCwd('QF-20260101-001', worktreeDir);
    expect(resolved && path.resolve(resolved)).toBe(path.resolve(worktreeDir));
  });

  it('returns the worktree path when cwd is a nested subdir inside the worktree', () => {
    const nested = path.join(worktreeDir, 'src', 'deep');
    fs.mkdirSync(nested, { recursive: true });
    const resolved = resolveQFWorktreeFromCwd('QF-20260101-001', nested);
    expect(resolved && path.resolve(resolved)).toBe(path.resolve(worktreeDir));
  });

  it('returns null when qfId does not match the worktree path', () => {
    expect(resolveQFWorktreeFromCwd('QF-20260101-999', worktreeDir)).toBe(null);
  });

  it('returns null when cwd is outside any worktree', () => {
    expect(resolveQFWorktreeFromCwd('QF-20260101-001', os.tmpdir())).toBe(null);
  });

  it('returns null on missing or non-string qfId', () => {
    expect(resolveQFWorktreeFromCwd(null, worktreeDir)).toBe(null);
    expect(resolveQFWorktreeFromCwd('', worktreeDir)).toBe(null);
    expect(resolveQFWorktreeFromCwd(undefined, worktreeDir)).toBe(null);
  });

  it('handles legacy non-namespaced .worktrees/QF-xxx layout', () => {
    const legacyRepo = path.join(scratchRoot, 'legacy');
    fs.mkdirSync(legacyRepo, { recursive: true });
    execSync('git init -q', { cwd: legacyRepo });
    execSync('git config user.email t@e.com && git config user.name t', { cwd: legacyRepo });
    fs.writeFileSync(path.join(legacyRepo, 'a.txt'), 'a');
    execSync('git add a.txt && git commit -q -m seed', { cwd: legacyRepo });
    const legacyWt = path.join(legacyRepo, '.worktrees', 'QF-20260101-002');
    execSync(`git worktree add -q -b QF-20260101-002 "${legacyWt}"`, { cwd: legacyRepo });
    expect(resolveQFWorktreeFromCwd('QF-20260101-002', legacyWt)).toBe(path.resolve(legacyWt));
  });

  it('normalizes Windows backslash separators in cwd', () => {
    const winStyle = worktreeDir.replace(/\//g, '\\');
    const resolved = resolveQFWorktreeFromCwd('QF-20260101-001', winStyle);
    expect(resolved && path.resolve(resolved)).toBe(path.resolve(worktreeDir));
  });
});
