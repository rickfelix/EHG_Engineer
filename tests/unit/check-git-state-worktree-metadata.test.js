/**
 * Regression: the handoff STEP-1 git-state check must not block on tracked-but-per-worktree
 * metadata noise.
 *
 * QF-20260529-729 (backlog a23355c1): .worktree.json + .worktree-nm-mode are deliberately
 * TRACKED per-worktree metadata that provisioning rewrites for each worktree, so inside a
 * worktree they always show as "modified" → checkGitState set passed=false → blocked every
 * LEAD-TO-PLAN handoff from a worktree. Fix excludes them from the blocking classification
 * (without untracking them).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { isPerWorktreeMetadata, PER_WORKTREE_METADATA } from '../../scripts/check-git-state.js';

const srcPath = fileURLToPath(new URL('../../scripts/check-git-state.js', import.meta.url));

describe('check-git-state ignores per-worktree metadata noise (QF-20260529-729)', () => {
  it('treats .worktree.json + .worktree-nm-mode as non-blocking metadata', () => {
    expect(isPerWorktreeMetadata('.worktree.json')).toBe(true);
    expect(isPerWorktreeMetadata('.worktree-nm-mode')).toBe(true);
    expect(PER_WORKTREE_METADATA).toEqual(
      expect.arrayContaining(['.worktree.json', '.worktree-nm-mode'])
    );
  });

  it('does NOT ignore real source files', () => {
    expect(isPerWorktreeMetadata('src/index.js')).toBe(false);
    expect(isPerWorktreeMetadata('scripts/check-git-state.js')).toBe(false);
    expect(isPerWorktreeMetadata('')).toBe(false);
    expect(isPerWorktreeMetadata(null)).toBe(false);
  });

  it('the classification loop is actually wired to skip them (QF-888 dead-code lesson)', () => {
    const src = readFileSync(srcPath, 'utf8');
    expect(src).toMatch(/if \(isPerWorktreeMetadata\(file\)\) return;/);
  });
});
