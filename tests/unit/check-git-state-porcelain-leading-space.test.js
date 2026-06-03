/**
 * Regression (harness-bug, signalled by 9e371f17 2026-06-01): gitCommand() ran
 * `stdout.trim()`, which strips the leading space of the FIRST `git status
 * --porcelain` line. For an unstaged ' M .worktree.json' first line that shifts
 * the parse — status " M"->"M " (misread as STAGED) and file ".worktree.json"->
 * "worktree.json" (dot dropped) — so isPerWorktreeMetadata() misses the QF-729
 * skip-list and checkGitState set passed=false, blocking every worker's first
 * LEAD-TO-PLAN handoff from a freshly sd-start-provisioned worktree.
 *
 * Fix: gitCommand returns stdout.trimEnd() (preserve leading whitespace; only
 * trailing newline is noise). This test feeds a leading-space metadata line as
 * the FIRST porcelain line through the real gitCommand->parse path (exec mocked
 * via promisify.custom) and asserts it is still skipped.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const srcPath = fileURLToPath(new URL('../../scripts/check-git-state.js', import.meta.url));

function mockExecWith(porcelainStdout) {
  vi.resetModules();
  vi.doMock('child_process', async () => {
    const { promisify } = await import('util');
    const exec = function () {};
    // child_process.exec resolves to { stdout, stderr } under promisify — replicate
    // that via the custom symbol so `const execAsync = promisify(exec)` behaves.
    exec[promisify.custom] = (cmd) => {
      if (cmd.includes('--porcelain')) return Promise.resolve({ stdout: porcelainStdout, stderr: '' });
      if (cmd.includes('branch')) return Promise.resolve({ stdout: 'feat/x\n', stderr: '' });
      return Promise.resolve({ stdout: '', stderr: '' }); // unpushed-log etc.
    };
    return { exec };
  });
}

describe('check-git-state preserves porcelain leading whitespace (harness-bug 9e371f17)', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => { vi.doUnmock('child_process'); vi.resetModules(); });

  it('does NOT block when .worktree.json is the FIRST (leading-space) porcelain line', async () => {
    mockExecWith(' M .worktree.json\n');
    const { checkGitState } = await import('../../scripts/check-git-state.js');
    const r = await checkGitState();
    // With the old stdout.trim() bug this line parsed as staged "worktree.json"
    // (passed=false). With trimEnd() it stays " M .worktree.json" -> skipped.
    expect(r.details.stagedFiles).toEqual([]);
    expect(r.details.modifiedFiles).toEqual([]);
    expect(r.details.uncommittedFiles).toEqual([]);
    expect(r.passed).toBe(true);
  });

  it('still classifies a real first-line unstaged change as modified (leading space intact)', async () => {
    mockExecWith(' M src/real.js\n');
    const { checkGitState } = await import('../../scripts/check-git-state.js');
    const r = await checkGitState();
    expect(r.details.modifiedFiles).toEqual(['src/real.js']);
    expect(r.details.stagedFiles).toEqual([]);
    expect(r.passed).toBe(false);
  });

  it('source guard: gitCommand returns trimEnd() for stdout, never a bare stdout.trim()', () => {
    const src = readFileSync(srcPath, 'utf8');
    expect(src).toMatch(/stdout:\s*stdout\.trimEnd\(\)/);
    expect(src).not.toMatch(/stdout:\s*stdout\.trim\(\)/);
  });
});
