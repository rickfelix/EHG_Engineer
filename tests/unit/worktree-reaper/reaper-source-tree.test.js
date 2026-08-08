/**
 * TS-1/TS-2 — SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001 FR-1.
 *
 * THE PROPERTY UNDER TEST: the reaper's CODE comes from a dedicated self-refreshing tree, while
 * the POOL it reaps stays the shared root. Those were the same directory, and that identity is
 * what made reaping starve — the shared root goes behind within minutes of any peer merge (QFs
 * are worked on main), the currency check correctly refuses to execute possibly-stale destructive
 * code, and the refusal then persists until somebody pulls. Unbounded window.
 *
 * HOW THIS DISCRIMINATES, which is the part that matters: worktree-reaper.mjs is placed ONLY in
 * the source tree and deliberately NOT in repoRoot. Code that resolves the script from the source
 * tree finds it and proceeds; code that resolves it from repoRoot returns 'script_missing'. That
 * makes the assertion fail against the pre-fix implementation rather than merely restating it —
 * proved by mutation, not asserted.
 *
 * NOTE ON WHY THIS IS NOT A tree-currency TEST: currency semantics are already covered by
 * tests/unit/fleet/tree-currency.test.js. What was never covered is WHICH TREE the reaper asks
 * about, and that is exactly what regressed.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require_ = createRequire(import.meta.url);
const { tick } = require_('../../../scripts/fleet/worktree-reaper-tick.cjs');

let tmp, poolRoot, sourceDir;

function mk(dir) { fs.mkdirSync(dir, { recursive: true }); return dir; }

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reaper-src-'));
  poolRoot = mk(path.join(tmp, 'pool'));
  sourceDir = mk(path.join(tmp, 'reaper-source'));
  // The script exists ONLY in the source tree. This asymmetry IS the discriminator.
  mk(path.join(sourceDir, 'scripts'));
  fs.writeFileSync(path.join(sourceDir, 'scripts', 'worktree-reaper.mjs'), '// stub\n');
  mk(path.join(poolRoot, '.claude'));
});

afterEach(() => {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
});

/** Drive tick with the source tree injected; no real git, no real pool. */
function run(extra = {}) {
  const gitCalls = [];
  return {
    gitCalls,
    result: tick({
      repoRoot: poolRoot,
      force: true,
      logger: () => {},
      sourceExists: () => true,          // the source tree is already present
      sourceRunner: (args) => { gitCalls.push(args.join(' ')); }, // refresh succeeds
      currencyEnv: { ...process.env, FLEET_REAPER_SOURCE_DIR: sourceDir },
      ...extra,
    }),
  };
}

describe('FR-1: the reaper executes code from the dedicated source tree, not the pool', () => {
  it('TS-1 (LOAD-BEARING): resolves worktree-reaper.mjs from the SOURCE tree', () => {
    const { result } = run();
    // Pre-fix this returns 'script_missing' — the script is absent from repoRoot by construction.
    expect(result.result).not.toBe('script_missing');
  });

  it('TS-1b: the source tree is REFRESHED on reuse, not merely reused', () => {
    const { gitCalls } = run();
    // fetch + merge --ff-only. A tree created once and never advanced is current only until the
    // next merge, which is the defect this SD exists to close — so reuse must not be a no-op.
    expect(gitCalls.some((c) => c.includes('fetch'))).toBe(true);
    expect(gitCalls.some((c) => c.includes('merge --ff-only'))).toBe(true);
  });

  it('TS-2 (NEGATIVE ARM, DIFFERENT AXIS): source tree UNAVAILABLE falls back to the pool root', () => {
    // Varies availability, not the fix's own switch, so it cannot pass by inheriting TS-1's setup.
    // Degradation must be exactly today's behaviour — the guard intact, never silently disabled.
    fs.mkdirSync(path.join(poolRoot, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(poolRoot, 'scripts', 'worktree-reaper.mjs'), '// stub\n');
    const { result } = run({
      sourceRunner: () => { throw new Error('git unavailable'); },
      sourceExists: () => false,
    });
    // It found the script (via the repoRoot fallback) rather than dying.
    expect(result.result).not.toBe('script_missing');
  });

  it('TS-12 (TR-1 SAFETY PIN): the shared root is never self-healed', () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), 'scripts', 'fleet', 'worktree-reaper-tick.cjs'), 'utf8',
    );
    // allowSelfHeal:false is load-bearing — a `git pull --ff-only` on the shared root is an
    // uncoordinated mutation of a tree other live sessions are reading.
    expect(src).toContain('allowSelfHeal: false');
    expect(src).not.toContain('allowSelfHeal: true');
  });
});
