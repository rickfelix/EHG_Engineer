/**
 * QF-20260726-956 — a worktree that lost its .git pointer must NOT validate.
 *
 * THE DEFECT. Registration and the .git pointer live in two different places — registration
 * in .git/worktrees/<name>/, the pointer in <worktree>/.git — and they can desync. Because
 * .worktrees/ is nested INSIDE the main checkout, losing the pointer does not raise an error:
 * git walks UP and silently binds the directory to the MAIN repo. isValidWorktree's two
 * existing checks BOTH still pass in that state, so it returned true and callers went on to
 * run git verbs that targeted the shared root instead of the worktree.
 *
 * WHAT IT COST (Alpha-3, 2026-07-26): a routine `git restore --source=HEAD --worktree --staged`
 * ran against MAIN's HEAD and index and deleted two source files out of the shared checkout.
 * Recoverable only because the work had already been pushed.
 *
 * WHY THIS TEST BUILDS A REAL REPO INSTEAD OF MOCKING GIT. The whole defect IS git's real
 * upward-search behaviour. A mocked `git rev-parse` returns whatever the test author expects,
 * which is precisely the wrong repo's answer being indistinguishable from the right one — the
 * bug would survive its own test suite. So we create an actual repo + worktree in a temp dir
 * and delete the pointer for real. No DB, no network, no shared-root mutation.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isValidWorktree } from '../../../scripts/resolve-sd-workdir.js';

let root, wt;
const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
const norm = (p) => path.resolve(p).replace(/\\/g, '/');

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'qf956-'));
  git(['init', '-q', '.'], root);
  git(['config', 'user.email', 'test@example.invalid'], root);
  git(['config', 'user.name', 'qf956'], root);
  fs.writeFileSync(path.join(root, 'a.txt'), 'hi\n');
  git(['add', 'a.txt'], root);
  git(['commit', '-qm', 'init'], root);
  // Mirror production layout: worktrees nested INSIDE the main checkout. The nesting is what
  // makes the failure silent — a sibling directory would simply not be a repo at all.
  wt = path.join(root, '.worktrees', 'WT');
  git(['worktree', 'add', '-q', wt, '-b', 'feat/wt'], root);
});

afterAll(() => {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* temp dir */ }
});

describe('QF-956: isValidWorktree must reject an upward-bound worktree', () => {
  it('ALLOWS a healthy worktree (the control — proves this is not an always-false guard)', () => {
    // Without this arm, the refusal below is satisfied equally by a guard that rejects
    // everything, which would break every legitimate worktree resolution instead of fixing it.
    expect(fs.existsSync(path.join(wt, '.git'))).toBe(true);
    expect(norm(git(['rev-parse', '--show-toplevel'], wt))).toBe(norm(wt));
    expect(isValidWorktree(wt)).toBe(true);
  });

  it('REFUSES once the .git pointer is lost, even though it still looks valid', () => {
    fs.rmSync(path.join(wt, '.git'), { force: true });

    // THE TWO PRE-EXISTING CHECKS STILL PASS. This is the load-bearing part of the test: it
    // documents WHY the third conjunct was needed rather than just asserting the new result.
    expect(git(['rev-parse', '--is-inside-work-tree'], wt)).toBe('true');
    const registered = git(['worktree', 'list', '--porcelain'], wt)
      .split('\n').filter((l) => l.startsWith('worktree '))
      .map((l) => norm(l.replace('worktree ', '').trim()));
    expect(registered).toContain(norm(wt)); // still registered — desync is real

    // And the directory now answers for the PARENT repo. This is the silent misbinding.
    expect(norm(git(['rev-parse', '--show-toplevel'], wt))).toBe(norm(root));

    // The predicate must fail closed on exactly that.
    expect(isValidWorktree(wt)).toBe(false);
  });
});
