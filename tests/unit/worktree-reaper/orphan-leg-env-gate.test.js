/**
 * SD-LEO-INFRA-ORPHAN-SWEEP-HARD-001 (FR-1b) — the orphan leg must be gateable by BOTH invokers.
 *
 * THE DEFECT: `--no-orphan-sweep` is a real, documented opt-out on the reaper CLI that NEITHER
 * automated caller can pass.
 *   1. scripts/fleet/worktree-reaper-tick.cjs buildReaperArgs emits only --execute,
 *      --stage2 --yes, --all-pools. The string 'no-orphan-sweep' appears ZERO times in that file.
 *   2. .github/workflows/worktree-reaper-cadence.yml runs `npm run worktree:reap:execute` daily,
 *      invoking scripts/worktree-reaper.mjs DIRECTLY — no tick, no arg builder, so no flag is
 *      passable under any wiring.
 * An opt-out nothing can invoke is not an opt-out.
 *
 * WHY THESE TESTS ASSERT AT worktree-reaper.mjs AND NOT AT buildReaperArgs: a gate threaded
 * through the arg builder would satisfy invoker 1 and leave invoker 2 — the one that runs with
 * --execute on a schedule, unattended — completely ungated. Asserting at the arg builder would
 * therefore be a green test for a fix that does not cover the dangerous path.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { resolveOrphanSweepDisabled } from '../../../scripts/worktree-reaper.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

afterEach(() => { vi.restoreAllMocks(); });

describe('the env gate is readable where BOTH invokers pass through', () => {
  it('unset leaves the leg ENABLED — existing behaviour is byte-identical', () => {
    expect(resolveOrphanSweepDisabled({}).disabled).toBe(false);
    expect(resolveOrphanSweepDisabled({ WORKTREE_ORPHAN_SWEEP: '' }).disabled).toBe(false);
  });

  it('recognised off-values DISABLE the leg', () => {
    for (const v of ['off', 'OFF', 'false', '0', 'no', 'disabled', ' Off ']) {
      const r = resolveOrphanSweepDisabled({ WORKTREE_ORPHAN_SWEEP: v });
      expect(r.disabled, `value ${JSON.stringify(v)}`).toBe(true);
      expect(r.reason).toBe('explicit_off');
    }
  });

  it('recognised on-values keep it ENABLED', () => {
    for (const v of ['on', 'true', '1', 'yes', 'enabled']) {
      expect(resolveOrphanSweepDisabled({ WORKTREE_ORPHAN_SWEEP: v }).disabled, v).toBe(false);
    }
  });
});

describe('FAIL DIRECTION — a corrupted setting must not leave a deleting job armed', () => {
  it('an unrecognised value DISABLES rather than re-arming', () => {
    // This is the inverse of the mistake in resolveMinAgeMs, where every corruption mode falls
    // back to the 30-minute default and thereby RE-ARMS the destructive path. Measured 2026-08-03:
    // a value typo, a key typo, empty and negative all resolve to 30 minutes there, and an
    // explicit 0 disables that guard entirely.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const v of ['offf', 'no-orphan-sweep', 'TRUE!', '2', 'null', 'undefined']) {
      const r = resolveOrphanSweepDisabled({ WORKTREE_ORPHAN_SWEEP: v });
      expect(r.disabled, `value ${JSON.stringify(v)}`).toBe(true);
      expect(r.reason).toBe('unrecognised_value');
    }
  });

  it('and it WARNS — failing safe silently is its own defect', () => {
    // mockClear() is load-bearing: vi.spyOn on an already-spied method returns the SAME mock, so
    // without it this assertion counts the previous test's calls too and measures accumulated
    // state rather than this test's behaviour. It failed 7-vs-1 on first run, which is how I know.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warn.mockClear();
    resolveOrphanSweepDisabled({ WORKTREE_ORPHAN_SWEEP: 'offf' });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/unrecognised value/i);
  });

  it('a RECOGNISED value never warns — the warning must stay meaningful', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warn.mockClear();
    resolveOrphanSweepDisabled({ WORKTREE_ORPHAN_SWEEP: 'off' });
    resolveOrphanSweepDisabled({ WORKTREE_ORPHAN_SWEEP: 'on' });
    resolveOrphanSweepDisabled({});
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('the gate is wired at the seam both invokers reach', () => {
  const SRC = readFileSync(resolve(REPO_ROOT, 'scripts/worktree-reaper.mjs'), 'utf8');
  const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('noOrphanSweep consults the env gate, not only the CLI flag', () => {
    expect(CODE).toMatch(/noOrphanSweep:[^\n]*resolveOrphanSweepDisabled\(\)/);
  });

  it('the orphan leg call site still honours opts.noOrphanSweep', () => {
    expect(CODE).toMatch(/if \(!opts\.noOrphanSweep\)/);
  });

  it('CONTROL: the stripper did not empty the source', () => {
    expect(CODE).toMatch(/function parseArgs/);
    expect(CODE.length).toBeGreaterThan(5000);
  });
});

describe('the tick cannot pass the flag — which is WHY the env gate exists', () => {
  const TICK = readFileSync(resolve(REPO_ROOT, 'scripts/fleet/worktree-reaper-tick.cjs'), 'utf8');

  it('buildReaperArgs still emits no orphan-sweep flag', () => {
    // Pins the premise. If someone later adds the flag here, this test failing is the signal to
    // re-read FR-1b rather than assume the env gate became redundant — the cron path still
    // cannot pass a flag, so the env gate remains load-bearing either way.
    expect(TICK).not.toMatch(/no-orphan-sweep/);
  });

  it('the cron workflow invokes the reaper directly, with no tick in between', () => {
    const wf = readFileSync(resolve(REPO_ROOT, '.github/workflows/worktree-reaper-cadence.yml'), 'utf8');
    expect(wf).toMatch(/schedule:/);
    expect(wf).toMatch(/worktree:reap/);
    expect(wf).not.toMatch(/worktree-reaper-tick/);
  });
});
