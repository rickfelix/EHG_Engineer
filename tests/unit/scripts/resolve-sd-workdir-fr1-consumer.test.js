// SD-FDBK-ENH-SCOPE-REPLACE-WORKTREE-001 FR-1 — CONSUMER pin.
//
// WHY THIS FILE EXISTS, stated plainly because it is the gap this SD keeps finding in other
// people's work and had left open in its own: isNodeModulesUnprovisioned was already pinned, and
// those pins are good. They prove the RULE is right. They do not prove the rule RUNS.
// ensureWorktreeEssentials is the only real caller, it was unexported, and nothing tested it — so
// FR-1 could have been reverted at the call site (back to `!fs.existsSync(targetModules)`) with
// every predicate test still green. A guard nothing invokes is a guard that does not exist.
//
// Verified at the consumer, not at the merge.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Mock the provisioner: this test asks ONE question — does the hollow-node_modules rule actually
// reach provisioning? — so real installs are neither needed nor wanted.
vi.mock('../../../lib/worktree-provision.js', () => ({
  provisionWorktreeNodeModules: vi.fn(),
  getIsolationMode: () => 'never',
  getFreeDiskBytes: () => 999e9,
  countActiveFreshSessions: async () => 1
}));

const { provisionWorktreeNodeModules } = await import('../../../lib/worktree-provision.js');
const { ensureWorktreeEssentials } = await import('../../../scripts/resolve-sd-workdir.js');

/** A repo root whose node_modules is POPULATED — the source side must exist or the guard short-circuits. */
function makeRepoRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr1-repo-'));
  fs.mkdirSync(path.join(root, 'node_modules', 'vitest'), { recursive: true });
  return root;
}

function makeWorktree() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fr1-wt-'));
}

beforeEach(() => {
  provisionWorktreeNodeModules.mockClear();
});

describe('ensureWorktreeEssentials — FR-1 is WIRED, not merely correct', () => {
  it('provisions when node_modules is HOLLOW (the .vite-cache-only shape measured on this fleet)', () => {
    const repoRoot = makeRepoRoot();
    const wt = makeWorktree();
    fs.mkdirSync(path.join(wt, 'node_modules', '.vite'), { recursive: true });

    ensureWorktreeEssentials(wt, repoRoot, { activeSessionCount: 1 });

    // THE PIN. Under the pre-FR-1 existsSync guard this call count is 0: the hollow directory
    // exists, so provisioning was suppressed permanently and every downstream tool failed
    // module-not-found while the worktree reported healthy.
    expect(provisionWorktreeNodeModules).toHaveBeenCalledTimes(1);
  });

  it('provisions when node_modules is entirely ABSENT', () => {
    const repoRoot = makeRepoRoot();
    const wt = makeWorktree();

    ensureWorktreeEssentials(wt, repoRoot, { activeSessionCount: 1 });

    expect(provisionWorktreeNodeModules).toHaveBeenCalledTimes(1);
  });

  it('does NOT re-provision a POPULATED node_modules', () => {
    // The negative half. Without this, a guard that always provisions passes the two tests above
    // while re-installing on every resolve — correct-looking and ruinous under fleet concurrency.
    const repoRoot = makeRepoRoot();
    const wt = makeWorktree();
    fs.mkdirSync(path.join(wt, 'node_modules', 'vitest'), { recursive: true });

    ensureWorktreeEssentials(wt, repoRoot, { activeSessionCount: 1 });

    expect(provisionWorktreeNodeModules).not.toHaveBeenCalled();
  });

  it('does NOT re-provision a JUNCTIONED node_modules (PR #3488 finding 1)', (ctx) => {
    // A junction is PROVISIONED and must not be read through: its target is transiently absent
    // during a concurrent .staging swap at the main repo, so a read-through check would tear down
    // a healthy worktree exactly when the store is busiest.
    const repoRoot = makeRepoRoot();
    const wt = makeWorktree();
    const target = fs.mkdtempSync(path.join(os.tmpdir(), 'fr1-store-'));
    try {
      fs.symlinkSync(target, path.join(wt, 'node_modules'), 'junction');
    } catch {
      // ctx.skip(), NOT a bare return — vitest reports an early return as PASSED, which would turn
      // this into a silent green on the exact regression it guards.
      ctx.skip();
    }

    ensureWorktreeEssentials(wt, repoRoot, { activeSessionCount: 1 });

    expect(provisionWorktreeNodeModules).not.toHaveBeenCalled();
  });

  it('does NOT provision when the SOURCE node_modules is missing — nothing to provision from', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fr1-repo-bare-'));
    const wt = makeWorktree();

    ensureWorktreeEssentials(wt, repoRoot, { activeSessionCount: 1 });

    expect(provisionWorktreeNodeModules).not.toHaveBeenCalled();
  });
});
