/**
 * Durability guard — no worktree-removal path may run a raw recursive fs.rmSync on a worktree
 * path without a preceding WHOLE-TREE junction unlink. SD-LEO-INFRA-WORKTREE-REMOVE-CHOKEPOINT-001.
 *
 * The shared root node_modules wipe recurred because worktree-removal logic is DUPLICATED across
 * several sites, and two fallback sinks re-implemented the pre-unlink at node_modules SCOPE
 * (unlinkNodeModulesJunction / a top-level lstat check) instead of the canonical WHOLE-TREE
 * chokepoint (safeRecursiveRm → _unlinkLinksRecursive, or the inlined _unlinkNestedLinks on the
 * ENTIRE wtPath). A junction OUTSIDE node_modules was then followed by fs.rmSync into the shared
 * store. This static source guard fails CI if any future edit reintroduces a bare raw rmSync, or a
 * node_modules-scope-only pre-unlink before a whole-tree delete, in the two sink files — keeping the
 * recurrence class permanently closed.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('worktree-removal chokepoint guard (SD-LEO-INFRA-WORKTREE-REMOVE-CHOKEPOINT-001)', () => {
  it('safe-worktree-remove.mjs: orphan/fallback delete routes through safeRecursiveRm, never a raw fs.rmSync(wtPath)', () => {
    const src = read('scripts/safe-worktree-remove.mjs');
    expect(src).toMatch(/safeRecursiveRm\(\s*wtPath/);  // uses the canonical whole-tree chokepoint
    expect(src).not.toMatch(/fs\.rmSync\(\s*wtPath/);   // no raw worktree rmSync remains
  });

  it('concurrent-session-worktree.cjs: every fs.rmSync(wtPath) is immediately preceded by a WHOLE-TREE unlink (_unlinkNestedLinks(wtPath)), never the node_modules-scoped unlinkNodeModulesJunction', () => {
    const src = read('scripts/hooks/concurrent-session-worktree.cjs');
    const lines = src.split('\n');
    const rmIdx = lines
      .map((l, i) => (/fs\.rmSync\(\s*wtPath/.test(l) ? i : -1))
      .filter((i) => i >= 0);
    expect(rmIdx.length).toBeGreaterThan(0); // the fallback rmSync still exists (we guard it, not remove it)
    for (const i of rmIdx) {
      const window = lines.slice(Math.max(0, i - 4), i).join('\n');
      expect(window).toMatch(/_unlinkNestedLinks\(\s*wtPath/);          // whole-tree unlink precedes the delete
      expect(window).not.toMatch(/unlinkNodeModulesJunction\(\s*wtPath/); // NOT the node_modules-scope-only call (the bug)
    }
  });
});
