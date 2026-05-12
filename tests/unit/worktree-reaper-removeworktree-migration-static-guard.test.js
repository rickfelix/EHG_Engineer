/**
 * Static guard test for QF-20260512-347.
 *
 * Pins that scripts/worktree-reaper.mjs:removeWorktree() routes the primary
 * git-worktree-remove call through removeWorktreeViaGit (which pre-unlinks the
 * node_modules symlink) and NOT bare `git worktree remove --force` — which on
 * Windows follows MSYS bash / junction symlinks and wipes the main repo's
 * node_modules (witness 2026-05-11T23:33Z, feedback 7caaaed4).
 *
 * Closes feedback 7caaaed4-3754-492f-8363-2b9c810ddfa3.
 * Sibling fix to QF-20260511-446 (PR #3724) which shipped removeWorktreeViaGit
 * across 3 shipping sites but missed the reaper as the 4th site.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { sliceFunctionBody } from '../helpers/static-pin.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const REAPER_PATH = 'scripts/worktree-reaper.mjs';

describe('QF-20260512-347 — reaper removeWorktree migrated to removeWorktreeViaGit', () => {
  const source = readFileSync(join(repoRoot, REAPER_PATH), 'utf8');

  it('imports removeWorktreeViaGit from lib/worktree-manager.js', () => {
    expect(source).toMatch(
      /import\s*\{[^}]*\bremoveWorktreeViaGit\b[^}]*\}\s*from\s*['"]\.\.\/lib\/worktree-manager\.js['"]/
    );
  });

  it('removeWorktree() primary path calls removeWorktreeViaGit (not bare runGit worktree remove)', () => {
    const body = sliceFunctionBody(source, 'removeWorktree');
    expect(body, 'sliceFunctionBody could not locate removeWorktree').not.toBeNull();
    expect(body).toMatch(/removeWorktreeViaGit\s*\(/);
  });

  it('removeWorktree() does NOT call bare runGit([..."remove", "--force"...]) on the primary path', () => {
    const body = sliceFunctionBody(source, 'removeWorktree');
    expect(body).not.toBeNull();
    // bare runGit primary call would look like: runGit(['worktree', 'remove', '--force', ...
    // Allow no occurrences — the migrated form uses removeWorktreeViaGit instead.
    expect(body).not.toMatch(/runGit\s*\(\s*\[\s*['"]worktree['"]\s*,\s*['"]remove['"]\s*,\s*['"]--force['"]/);
  });

  it('removeWorktree() retains fs-rm+prune fallback path', () => {
    const body = sliceFunctionBody(source, 'removeWorktree');
    expect(body).not.toBeNull();
    // Fallback must still run safeRecursiveRm + worktree prune so we recover when
    // the helper itself can't complete (dir partly gone, etc.).
    expect(body).toMatch(/safeRecursiveRm\s*\(/);
    expect(body).toMatch(/runGit\s*\(\s*\[\s*['"]worktree['"]\s*,\s*['"]prune['"]/);
    expect(body).toMatch(/method:\s*['"]fs-rm\+prune['"]/);
  });
});
