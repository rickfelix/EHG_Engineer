/**
 * SD-FDBK-INFRA-WORKTREE-AUTO-REMOVED-001 (FR-1, FR-3) — planHandoffReexec unit tests.
 *
 * The planner is pure with injected deps, so no module mocking is needed:
 * assertCwdValid / getRepoRoot / existsSync are passed as stubs.
 *
 * Covers the prospective test matrix:
 *   TS-1 positive re-exec, TS-2 broken-main-root negative, TS-3 loop-guard,
 *   TS-4 valid-main-root passthrough, TS-5 live-worktree passthrough,
 *   plus: non-STALE_CWD error re-thrown, getRepoRoot-throws, mainRoot===cwd guard.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planHandoffReexec } from '../../lib/handoff-reexec.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const handoffSrc = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'handoff.js'), 'utf8');

const MAIN = path.resolve('/repo/EHG_Engineer');
const WT = path.resolve('/repo/EHG_Engineer/.worktrees/SD-X');

const staleErr = () => Object.assign(new Error('cwd orphaned'), { code: 'STALE_CWD' });
const isStaleCwd = (err) => !!err && err.code === 'STALE_CWD';

// Base deps for the "orphaned worktree, recoverable" happy path.
function deps(overrides = {}) {
  return {
    sentinelSet: false,
    assertCwdValid: () => { throw staleErr(); },
    isStaleCwd,
    getRepoRoot: () => MAIN,
    cwd: WT,
    existsSync: (p) => p === path.join(MAIN, '.git'),
    ...overrides,
  };
}

describe('planHandoffReexec (FR-1 re-exec recovery)', () => {
  it('TS-1: orphaned worktree + valid main root → reexec with main repo handoff.js', () => {
    const plan = planHandoffReexec(deps());
    expect(plan.reexec).toBe(true);
    expect(plan.reason).toBe('orphaned_worktree');
    expect(plan.mainRoot).toBe(MAIN);
    // Must target the MAIN repo's handoff.js, not the worktree's copy.
    expect(plan.mainScript).toBe(path.join(MAIN, 'scripts', 'handoff.js'));
    expect(plan.mainScript.includes('.worktrees')).toBe(false);
  });

  it('TS-2: orphaned but main root has no .git → no recovery, loud failure preserved', () => {
    const plan = planHandoffReexec(deps({ existsSync: () => false }));
    expect(plan.reexec).toBe(false);
    expect(plan.reason).toBe('no_valid_main_root');
  });

  it('TS-3: loop-guard — sentinel set → never re-exec (and assertCwdValid not consulted)', () => {
    let called = false;
    const plan = planHandoffReexec(deps({
      sentinelSet: true,
      assertCwdValid: () => { called = true; throw staleErr(); },
    }));
    expect(plan.reexec).toBe(false);
    expect(plan.reason).toBe('sentinel_set');
    expect(called).toBe(false); // short-circuits before touching cwd
  });

  it('TS-4: valid main-root cwd (assertCwdValid passes) → passthrough, no re-exec', () => {
    const plan = planHandoffReexec(deps({
      assertCwdValid: () => { /* valid: no throw */ },
      cwd: MAIN,
    }));
    expect(plan.reexec).toBe(false);
    expect(plan.reason).toBe('cwd_valid');
  });

  it('TS-5: valid live worktree (in `git worktree list`, assertCwdValid passes) → passthrough', () => {
    const plan = planHandoffReexec(deps({
      assertCwdValid: () => { /* live worktree: no throw */ },
    }));
    expect(plan.reexec).toBe(false);
    expect(plan.reason).toBe('cwd_valid');
  });

  it('re-throws a non-STALE_CWD error (never silently swallowed)', () => {
    const boom = new Error('unexpected');
    expect(() => planHandoffReexec(deps({
      assertCwdValid: () => { throw boom; },
    }))).toThrow('unexpected');
  });

  it('getRepoRoot throwing → treated as no valid main root (no recovery)', () => {
    const plan = planHandoffReexec(deps({
      getRepoRoot: () => { throw new Error('cannot resolve'); },
    }));
    expect(plan.reexec).toBe(false);
    expect(plan.reason).toBe('no_valid_main_root');
  });

  it('guards against re-exec into the same dir (mainRoot === cwd)', () => {
    const plan = planHandoffReexec(deps({
      getRepoRoot: () => WT, // resolver returns the broken cwd itself
      cwd: WT,
      existsSync: (p) => p === path.join(WT, '.git'),
    }));
    expect(plan.reexec).toBe(false);
    expect(plan.reason).toBe('no_valid_main_root');
  });
});

// Static-source pins for the handoff.js GLUE — the crux of FR-1. The planner
// logic is fully tested above, but a regression that re-statically-imports the
// heavy (node_modules-backed) graph BEFORE the preflight would silently defeat
// re-exec recovery at module-RESOLUTION time and pass every behavioural test.
// These pins guard exactly that failure mode.
describe('handoff.js FR-1 glue (static-source pins)', () => {
  it('imports the pure planner from lib/handoff-reexec.mjs', () => {
    expect(handoffSrc).toMatch(/import\s*\{\s*planHandoffReexec\s*\}\s*from\s*['"]\.\.\/lib\/handoff-reexec\.mjs['"]/);
  });

  it('imports the heavy CLI graph DYNAMICALLY, never as a top-level static import', () => {
    // A static `import { main } from './modules/handoff/cli/index.js'` resolves
    // node_modules before the preflight runs → defeats FR-1 in an orphaned worktree.
    expect(handoffSrc).not.toMatch(/^\s*import\s+\{\s*main\s*\}\s+from\s+['"]\.\/modules\/handoff\/cli\/index\.js['"]/m);
    expect(handoffSrc).toMatch(/await import\(\s*['"]\.\/modules\/handoff\/cli\/index\.js['"]\s*\)/);
  });

  it('defers claimGuard + startHeartbeat to dynamic imports too (whole heavy graph deferred)', () => {
    expect(handoffSrc).not.toMatch(/^\s*import\s+\{\s*claimGuard\s*\}\s+from/m);
    expect(handoffSrc).not.toMatch(/^\s*import\s+\{\s*startHeartbeat\s*\}\s+from/m);
    expect(handoffSrc).toMatch(/await import\(\s*['"]\.\.\/lib\/claim-guard\.mjs['"]\s*\)/);
  });

  it('calls the planner and spawns the child with the LEO_HANDOFF_REEXEC loop-guard sentinel', () => {
    expect(handoffSrc).toMatch(/planHandoffReexec\(/);
    expect(handoffSrc).toMatch(/spawnSync\(/);
    expect(handoffSrc).toMatch(/LEO_HANDOFF_REEXEC/);
  });
});
