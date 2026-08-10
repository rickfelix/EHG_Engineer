/**
 * SD-LEO-INFRA-REAP-COMPLETED-WORKTREE-001 — closing the husk path.
 *
 * A husk is a worktree deregistered from git whose DIRECTORY survived. It was already DETECTED
 * (worktree-manager.js:1824) and then left in place with a "delete it manually" warning, which
 * is why 43 directories stood against 22 registered worktrees.
 *
 * Two-sided: the removal arm and the refusal arms are both proven, and the outcome is always
 * the OBSERVED state on disk rather than the remover's return value — reporting a
 * deregistration as a removal is exactly what created the husk.
 */
import { describe, it, expect, vi } from 'vitest';
import { closeHusk, HUSK_OUTCOME } from '../../../lib/worktree-reaper/close-husk.js';

const HUSK = '/repo/.worktrees/SD-X-001';
/** existsSync that flips to absent once the remover has run — a real deletion's observable effect. */
const fsAfter = (removed) => (p) => (p === HUSK ? !removed.value : false);

describe('closeHusk — removes the directory the old code left behind', () => {
  it('REMOVES a husk and reports it, asserted on the observed end state', () => {
    const removed = { value: false };
    const rm = vi.fn(() => { removed.value = true; return { ok: true }; });
    const res = closeHusk({
      huskPath: HUSK,
      deps: { existsSync: fsAfter(removed), cwdResidencyBlocks: () => ({ blocked: false }), safeRecursiveRmWithRetry: rm },
    });
    expect(res.outcome).toBe(HUSK_OUTCOME.REMOVED);
    expect(rm).toHaveBeenCalledWith(HUSK);
  });

  it('reports FAILED when the directory SURVIVES, even though the remover returned ok:true', () => {
    // The defect this SD exists to stop: a removal that reports success while the husk remains.
    const res = closeHusk({
      huskPath: HUSK,
      deps: { existsSync: () => true, cwdResidencyBlocks: () => ({ blocked: false }), safeRecursiveRmWithRetry: () => ({ ok: true }) },
    });
    expect(res.outcome).toBe(HUSK_OUTCOME.FAILED);
    expect(res.reason).toBe('directory_still_present');
  });
});

describe('closeHusk — self-reap is the hazard this path walks into by definition', () => {
  it('REFUSES when the residency guard says the process is standing in the tree', () => {
    const rm = vi.fn();
    const res = closeHusk({
      huskPath: HUSK,
      deps: { existsSync: () => true, cwdResidencyBlocks: () => ({ blocked: true, reason: 'reap_blocked_resident' }), safeRecursiveRmWithRetry: rm },
    });
    expect(res.outcome).toBe(HUSK_OUTCOME.BLOCKED_RESIDENT);
    expect(res.reason).toBe('reap_blocked_resident');
    // The refusal must happen BEFORE any deletion is attempted, not be reported after one.
    expect(rm).not.toHaveBeenCalled();
  });

  it('consults the residency guard for every removal — there is no unguarded path', () => {
    const guard = vi.fn(() => ({ blocked: false }));
    const removed = { value: false };
    closeHusk({
      huskPath: HUSK,
      deps: { existsSync: fsAfter(removed), cwdResidencyBlocks: guard, safeRecursiveRmWithRetry: () => { removed.value = true; return { ok: true }; } },
    });
    expect(guard).toHaveBeenCalledWith(HUSK);
  });
});

describe('closeHusk — containment', () => {
  it('is idempotent: an already-gone husk is ALREADY_ABSENT and nothing is deleted', () => {
    const rm = vi.fn();
    const res = closeHusk({ huskPath: HUSK, deps: { existsSync: () => false, safeRecursiveRmWithRetry: rm } });
    expect(res.outcome).toBe(HUSK_OUTCOME.ALREADY_ABSENT);
    expect(rm).not.toHaveBeenCalled();
  });

  it('NEVER THROWS when the remover throws — cleanup must not fail a complete SD', () => {
    const res = closeHusk({
      huskPath: HUSK,
      deps: { existsSync: () => true, cwdResidencyBlocks: () => ({ blocked: false }), safeRecursiveRmWithRetry: () => { throw new Error('EPERM'); } },
    });
    expect(res.outcome).toBe(HUSK_OUTCOME.FAILED);
    expect(res.reason).toContain('EPERM');
  });

  it('refuses a missing or non-string path rather than deleting something unintended', () => {
    const rm = vi.fn();
    for (const huskPath of [undefined, null, '', 42]) {
      const res = closeHusk({ huskPath, deps: { safeRecursiveRmWithRetry: rm } });
      expect(res.outcome).toBe(HUSK_OUTCOME.FAILED);
    }
    expect(rm).not.toHaveBeenCalled();
  });
});

describe('WIRING — the completion tail actually calls this, and no longer just warns', () => {
  // HONEST LABEL: this is a STRUCTURAL PIN, not a behavioural test. The executor cannot be
  // imported standalone (it fails at module load with a pre-existing, env-dependent
  // "path argument must be of type string" — verified by stashing this SD's change and
  // observing the identical failure on the baseline), so invoking the real branch is not
  // available here. A mutation reverting the wiring reddened NOTHING until this existed —
  // the module was fully tested while the thing that calls it was not.
  it('the husk branch invokes closeHusk and does not merely warn', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const url = await import('url');
    const raw = fs.readFileSync(
      path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '../../../scripts/modules/handoff/executors/lead-final-approval/index.js'),
      'utf8'
    );
    // COMMENTS STRIPPED FIRST. Written without this, the negative assertion below matched the
    // comment in the new branch that QUOTES the old warning — the test was red at baseline, and
    // a red-at-baseline test makes every mutation look "caught" while proving nothing.
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(src).toMatch(/import\s*\{[^}]*closeHusk[^}]*\}\s*from\s*['"][^'"]*close-husk\.js['"]/);
    expect(src).toMatch(/closeHusk\s*\(\s*\{\s*huskPath:/);
    // The defect was a branch that DETECTED the husk and then stopped at advice.
    expect(src).not.toMatch(/safe to delete manually/);
    // Control: a stripper that blanked the file would satisfy the negative assertion above.
    expect(src.length).toBeGreaterThan(5000);
  });
});

describe('FR-4 — removal is by REUSE; this module owns no removal primitive', () => {
  it('contains no direct rm/exec call of its own', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const url = await import('url');
    const src = fs.readFileSync(
      path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '../../../lib/worktree-reaper/close-husk.js'),
      'utf8'
    ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // CALL-shaped, not word-shaped: an earlier version of this assertion on a sibling module
    // matched the words "worktree removed" inside a log string and failed on its own prose.
    expect(src).not.toMatch(/\brmSync\s*\(|\brmdirSync\s*\(|\bunlinkSync\s*\(|\bexecSync\s*\(|\bexecFileSync\s*\(|\bspawnSync\s*\(/);
    // Controls: a stripper that blanked the file would pass the negative assertion above.
    expect(src).toMatch(/safeRecursiveRmWithRetry/);
    expect(src.length).toBeGreaterThan(500);
  });
});
