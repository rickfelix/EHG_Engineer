import { describe, it, expect } from 'vitest';
import path from 'path';
import { worktreeAddIsSibling, extractTargetPath, isSeparatorAnchoredUnder } from '../worktree-add-sibling-guard.cjs';

const REPO_ROOT = 'C:\\repo';
// Minimal stand-in for the reused scripts/resolve-sd-workdir.js validateWorktreePath —
// same containment logic (bare startsWith, on purpose, to prove the wrapper's separator-anchor
// check is what closes the bypass, not this stub).
function fakeValidateWorktreePath(resolved, repoRoot) {
  const resolvedRoot = path.resolve(repoRoot);
  const worktreesDir = path.join(resolvedRoot, '.worktrees');
  if (!resolved.startsWith(worktreesDir)) return false;
  if (resolved === '/' || resolved === 'C:\\' || resolved === resolvedRoot) return false;
  return true;
}

describe('extractTargetPath', () => {
  it('extracts the target from a plain `git worktree add <path> -b <branch>`', () => {
    expect(extractTargetPath('git worktree add .worktrees/qf/QF-1 -b qf/QF-1')).toBe('.worktrees/qf/QF-1');
  });
  it('extracts the target when flags precede it', () => {
    expect(extractTargetPath('git worktree add --force .worktrees/qf/QF-1 -b qf/QF-1')).toBe('.worktrees/qf/QF-1');
  });
  it('returns null for an unrelated command', () => {
    expect(extractTargetPath('git status')).toBeNull();
  });
  it('returns null for `git worktree remove` (different subcommand)', () => {
    expect(extractTargetPath('git worktree remove .worktrees/qf/QF-1')).toBeNull();
  });

  // SECURITY sub-agent finding S-2 (evidence c15134e8): `-b`/`-B` take a VALUE (the branch
  // name), not a boolean. The prior extractor grabbed that branch name AS the target, both
  // mis-resolving the guard's decision and refusing this exact sanctioned, idiomatic form
  // (used elsewhere in this repo: source-tree-refresh.js, shared-tree-contention-guard.test.js).
  it('extracts the target correctly when `-b <branch>` (a value-taking flag) precedes it', () => {
    expect(extractTargetPath('git worktree add -b feat/x .worktrees/qf/117')).toBe('.worktrees/qf/117');
  });
  it('extracts the target correctly when `-B <branch>` precedes it', () => {
    expect(extractTargetPath('git worktree add -B reaper-source .worktrees/adhoc/reaper origin/main')).toBe('.worktrees/adhoc/reaper');
  });
  it('extracts the target correctly with a mix of boolean and value-taking flags', () => {
    expect(extractTargetPath('git worktree add -f -b feat/x .worktrees/qf/117')).toBe('.worktrees/qf/117');
  });
});

describe('isSeparatorAnchoredUnder (F5 — separator-anchor bypass)', () => {
  const worktreesDir = path.join(REPO_ROOT, '.worktrees');
  it('true for the dir itself', () => {
    expect(isSeparatorAnchoredUnder(worktreesDir, worktreesDir)).toBe(true);
  });
  it('true for a genuine child path', () => {
    expect(isSeparatorAnchoredUnder(path.join(worktreesDir, 'qf', 'QF-1'), worktreesDir)).toBe(true);
  });
  it('false for a sibling that merely shares the prefix (`.worktrees-evil`)', () => {
    const evil = path.join(REPO_ROOT, '.worktrees-evil', 'x');
    expect(isSeparatorAnchoredUnder(evil, worktreesDir)).toBe(false);
  });
  it('false for a sibling that merely shares the prefix (`.worktreesX`)', () => {
    const evil = path.join(REPO_ROOT, '.worktreesX', 'y');
    expect(isSeparatorAnchoredUnder(evil, worktreesDir)).toBe(false);
  });
});

describe('worktreeAddIsSibling', () => {
  it('REFUSES a relative sibling path (`../EHG_Engineer-sibling`)', () => {
    const v = worktreeAddIsSibling({
      command: 'git worktree add ../EHG_Engineer-sibling -b test',
      cwd: REPO_ROOT,
      repoRoot: REPO_ROOT,
      validateWorktreePath: fakeValidateWorktreePath,
    });
    expect(v.isSibling).toBe(true);
  });
  it('ALLOWS a relative in-tree path (`.worktrees/qf/<id>`)', () => {
    const v = worktreeAddIsSibling({
      command: 'git worktree add .worktrees/qf/QF-TEST-001 -b qf/QF-TEST-001',
      cwd: REPO_ROOT,
      repoRoot: REPO_ROOT,
      validateWorktreePath: fakeValidateWorktreePath,
    });
    expect(v.isSibling).toBe(false);
  });
  it('ALLOWS an absolute in-tree path (`<repo>/.worktrees/sd/<key>`)', () => {
    const v = worktreeAddIsSibling({
      command: `git worktree add ${path.join(REPO_ROOT, '.worktrees', 'sd', 'SD-X').replace(/\\/g, '/')} -b feat/SD-X`,
      cwd: REPO_ROOT,
      repoRoot: REPO_ROOT,
      validateWorktreePath: fakeValidateWorktreePath,
    });
    expect(v.isSibling).toBe(false);
  });
  it('REFUSES the separator-anchor bypass (`.worktrees-evil/x`) — F5', () => {
    const v = worktreeAddIsSibling({
      command: 'git worktree add ../EHG_Engineer.worktrees-evil/x -b y',
      cwd: REPO_ROOT,
      repoRoot: REPO_ROOT,
      validateWorktreePath: fakeValidateWorktreePath,
    });
    expect(v.isSibling).toBe(true);
    expect(v.reason).toBe('outside_worktrees_dir_separator_anchor');
  });
  it('REFUSES the separator-anchor bypass (`.worktreesX/y`) — F5', () => {
    const v = worktreeAddIsSibling({
      command: 'git worktree add ../EHG_Engineer.worktreesX/y -b z',
      cwd: REPO_ROOT,
      repoRoot: REPO_ROOT,
      validateWorktreePath: fakeValidateWorktreePath,
    });
    expect(v.isSibling).toBe(true);
    expect(v.reason).toBe('outside_worktrees_dir_separator_anchor');
  });
  it('IGNORES `git worktree move` and `git worktree remove` (different subcommands)', () => {
    const move = worktreeAddIsSibling({ command: 'git worktree move .worktrees/qf/QF-1 ../elsewhere', cwd: REPO_ROOT, repoRoot: REPO_ROOT, validateWorktreePath: fakeValidateWorktreePath });
    expect(move.isSibling).toBe(false);
    expect(move.reason).toBe('not_a_worktree_add');
    const remove = worktreeAddIsSibling({ command: 'git worktree remove .worktrees/qf/QF-1', cwd: REPO_ROOT, repoRoot: REPO_ROOT, validateWorktreePath: fakeValidateWorktreePath });
    expect(remove.isSibling).toBe(false);
    expect(remove.reason).toBe('not_a_worktree_add');
  });
  it('IGNORES an unrelated command', () => {
    const v = worktreeAddIsSibling({ command: 'git status', cwd: REPO_ROOT, repoRoot: REPO_ROOT, validateWorktreePath: fakeValidateWorktreePath });
    expect(v.isSibling).toBe(false);
    expect(v.reason).toBe('not_a_worktree_add');
  });
});
