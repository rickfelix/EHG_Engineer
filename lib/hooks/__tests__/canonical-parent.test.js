import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const { isInWorktree, findCanonicalParent } = require_('../canonical-parent.cjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve the canonical (main) repo top-level — the parent worktree.
function gitRevParse(arg, cwd) {
  return execFileSync('git', ['rev-parse', arg], { cwd, encoding: 'utf8' }).trim();
}
const PARENT_TOPLEVEL = (() => {
  const commonDir = path.resolve(__dirname, gitRevParse('--git-common-dir', __dirname));
  return path.dirname(commonDir);
})();

describe('canonical-parent.cjs', () => {
  it('isInWorktree() returns false for the parent worktree', () => {
    expect(isInWorktree(PARENT_TOPLEVEL)).toBe(false);
  });

  it('findCanonicalParent() returns null for the parent worktree', () => {
    expect(findCanonicalParent(PARENT_TOPLEVEL)).toBeNull();
  });

  // Pick the first real worktree under .worktrees/* (one with a .git file).
  // Skipped if no real worktrees exist (CI checkout, fresh clone).
  function findFirstRealWorktree() {
    const fs = require_('fs');
    const wtRoot = path.join(PARENT_TOPLEVEL, '.worktrees');
    if (!fs.existsSync(wtRoot)) return null;
    const entries = fs.readdirSync(wtRoot).filter(e => {
      const p = path.join(wtRoot, e);
      return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, '.git'));
    });
    return entries.length > 0 ? path.join(wtRoot, entries[0]) : null;
  }

  it('isInWorktree() returns true for a .worktrees/* path', () => {
    const wtPath = findFirstRealWorktree();
    if (!wtPath) return; // graceful: no worktrees in CI checkout
    expect(isInWorktree(wtPath)).toBe(true);
  });

  it('findCanonicalParent() returns the parent path from inside a worktree', () => {
    const wtPath = findFirstRealWorktree();
    if (!wtPath) return;
    const result = findCanonicalParent(wtPath);
    expect(result).not.toBeNull();
    expect(path.resolve(result)).toBe(path.resolve(PARENT_TOPLEVEL));
  });

  it('isInWorktree() returns false for a non-git directory', () => {
    expect(isInWorktree(require_('os').tmpdir())).toBe(false);
  });

  it('findCanonicalParent() returns null for a non-git directory', () => {
    expect(findCanonicalParent(require_('os').tmpdir())).toBeNull();
  });
});
