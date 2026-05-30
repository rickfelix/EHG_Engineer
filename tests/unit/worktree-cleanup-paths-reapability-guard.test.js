/**
 * SD-LEO-INFRA-WORKTREE-CONTENTION-CLEANUP-001 — FR-3 static guards.
 *
 * Pins that the two secondary defect paths apply a reapability guard before
 * removing a worktree, so a regression that drops the guard fails CI:
 *   - scripts/hooks/concurrent-session-worktree.cjs: skips on unpushed commits
 *     (origin/main..HEAD), complementing its existing live-owner + dirty guards.
 *   - scripts/cleanup-pending-sweep.mjs: re-checks the shared isReapable()
 *     predicate immediately before safeRecursiveRmWithRetry.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(join(repoRoot, rel), 'utf8');

describe('FR-3 — concurrent-session-worktree.cjs unpushed guard', () => {
  const src = read('scripts/hooks/concurrent-session-worktree.cjs');

  it('checks origin/main..HEAD before removing an SD-* worktree', () => {
    expect(src).toMatch(/rev-list --count origin\/main\.\.HEAD/);
  });

  it('skips with an unpushed reason and continues (does not remove)', () => {
    expect(src).toMatch(/cleanup_skipped_unpushed/);
    expect(src).toContain('unpushed_commits');
  });

  it('the unpushed check precedes the destructive worktree remove', () => {
    const guardIdx = src.indexOf('rev-list --count origin/main..HEAD');
    // lastIndexOf: earlier matches are doc-comment mentions; the destructive
    // gitViaPowerShell remove is the final occurrence.
    const removeIdx = src.lastIndexOf('worktree remove --force');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(removeIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(removeIdx);
  });
});

describe('FR-3 — cleanup-pending-sweep.mjs isReapable guard', () => {
  const src = read('scripts/cleanup-pending-sweep.mjs');

  it('imports the shared isReapable predicate', () => {
    expect(src).toMatch(/import \{ isReapable \} from ['"]\.\.\/lib\/worktree-reapability\.js['"]/);
  });

  it('re-checks isReapable before safeRecursiveRmWithRetry', () => {
    const guardIdx = src.indexOf('isReapable(row.worktree_path)');
    const rmIdx = src.indexOf('safeRecursiveRmWithRetry(row.worktree_path)');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(rmIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(rmIdx);
  });

  it('skips unsafe worktrees with a logged reason', () => {
    expect(src).toContain('SKIPPED_UNSAFE');
  });
});
