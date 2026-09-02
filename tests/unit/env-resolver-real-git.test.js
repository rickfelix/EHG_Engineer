/**
 * SD-FDBK-INFRA-WORKTREES-CARRY-SNAPSHOT-001 (TS-6, TS-9)
 *
 * Integration-level test using REAL git operations against a tmpdir fixture (a main
 * repo + a linked worktree) -- never mutates this repo's own .env. Proves the full
 * rotate-then-read replay end to end: a linked worktree resolves the MAIN repo's LIVE
 * .env, not its own copy, even after the worktree's own copy goes stale.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'child_process';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { resolveEnvPath, _clearMemoForTests } from '../../lib/env-resolver.cjs';

let tmpRoot;
let mainRepo;
let linkedWorktree;

describe('resolveEnvPath against a real git main + linked worktree (TS-6)', () => {
  beforeAll(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'env-resolver-real-git-'));
    mainRepo = path.join(tmpRoot, 'main');
    fs.mkdirSync(mainRepo);
    execFileSync('git', ['init', '-q'], { cwd: mainRepo });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: mainRepo });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: mainRepo });
    fs.writeFileSync(path.join(mainRepo, 'README.md'), 'placeholder\n');
    execFileSync('git', ['add', '.'], { cwd: mainRepo });
    execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: mainRepo });

    fs.writeFileSync(path.join(mainRepo, '.env'), 'SECRET=original-value\n');

    linkedWorktree = path.join(tmpRoot, 'linked-worktree');
    execFileSync('git', ['worktree', 'add', linkedWorktree, '-b', 'feature-x'], { cwd: mainRepo });
    // Simulate propagateEnvFile's snapshot copy at worktree creation time.
    fs.writeFileSync(path.join(linkedWorktree, '.env'), 'SECRET=stale-snapshot-copy\n');
  });

  afterAll(() => {
    try {
      execFileSync('git', ['worktree', 'remove', '--force', linkedWorktree], { cwd: mainRepo });
    } catch { /* best-effort cleanup */ }
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('resolves to the MAIN repo\'s .env from within the linked worktree, not the worktree\'s own stale copy', () => {
    _clearMemoForTests();
    const result = resolveEnvPath(linkedWorktree);
    expect(result.source).toBe('main-worktree');
    expect(result.gitResolved).toBe(true);
    expect(fs.readFileSync(result.path, 'utf8')).toContain('original-value');
  });

  it('TS-6 replay: rotating the MAIN .env is visible immediately from the linked worktree, with no re-copy step', () => {
    fs.writeFileSync(path.join(mainRepo, '.env'), 'SECRET=rotated-value\n');
    _clearMemoForTests(); // a real process would not persist the memo across invocations either
    const result = resolveEnvPath(linkedWorktree);
    expect(fs.readFileSync(result.path, 'utf8')).toContain('rotated-value');
    // The worktree's own stale copy is untouched -- proving the fix reads main, not the copy.
    expect(fs.readFileSync(path.join(linkedWorktree, '.env'), 'utf8')).toContain('stale-snapshot-copy');
  });

  it('resolves from the MAIN repo itself the same way (git-common-dir of the main repo is its own .git)', () => {
    _clearMemoForTests();
    const result = resolveEnvPath(mainRepo);
    expect(result.source).toBe('main-worktree');
    expect(result.path).toBe(path.join(mainRepo, '.env'));
  });
});
