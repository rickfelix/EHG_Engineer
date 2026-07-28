/**
 * AC-3-6: the predecessor must not outlive the restart — and must never be killed on a guess.
 * SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001 (US-003).
 *
 * THE DEFECT THIS PINS. restart() retired the old DB ROW (the singleton mutex for singletons, a
 * status='released' update for workers) and never touched the old PROCESS. Two claude processes
 * then held one seat while only one had a live row — and the survivor kept heartbeating its claim,
 * kept its worktree, and was invisible to every gauge that reads the registry rather than the
 * process table.
 *
 * The dangerous fix is worse than the defect, so most of these tests are about REFUSING: pids are
 * recycled, and killing one whose identity we cannot confirm takes out an unrelated process. Every
 * kill is injected; no real process is ever signalled.
 */
import { describe, it, expect, vi } from 'vitest';
import { retirePredecessorProcess } from './spawn-control.js';

/** probe returns a fixed tri-state; kill records; verifyGone reports absence after N calls. */
function deps({ probe = 'MATCH', goneAfter = 1 } = {}) {
  const kills = [];
  let verifies = 0;
  return {
    kills,
    probeClaude: () => probe,
    kill: vi.fn(async (pid, sig) => { kills.push(`${sig}:${pid}`); }),
    verifyGone: vi.fn(async () => { verifies += 1; return verifies >= goneAfter; }),
  };
}

describe('the happy path terminates the predecessor', () => {
  it('a graceful signal alone suffices when the process exits', async () => {
    const d = deps({ goneAfter: 1 });
    const r = await retirePredecessorProcess(4321, d);
    expect(r.outcome).toBe('terminated');
    expect(d.kills).toEqual(['SIGTERM:4321']);
  });

  it('escalates to a forced kill only when the graceful one did not take', async () => {
    const d = deps({ goneAfter: 2 });
    const r = await retirePredecessorProcess(4321, d);
    expect(r.outcome).toBe('terminated');
    expect(d.kills).toEqual(['SIGTERM:4321', 'SIGKILL:4321']);
  });
});

describe('FAIL-CLOSED — a pid we cannot identify is never signalled', () => {
  it('REFUSES when the probe fails, rather than guessing', async () => {
    // The load-bearing one. Pids are recycled; a PROBE_FAILED that fell through to a kill would
    // terminate whatever now owns that number. Refusing is the only safe reading of "we do not know".
    const d = deps({ probe: 'PROBE_FAILED' });
    const r = await retirePredecessorProcess(4321, d);
    expect(r.outcome).toBe('refused');
    expect(d.kill).not.toHaveBeenCalled();
    expect(r.detail).toMatch(/cannot confirm/i);
  });

  it('treats a pid that is no longer claude as already gone, and kills nothing', async () => {
    const d = deps({ probe: 'NO_MATCH' });
    const r = await retirePredecessorProcess(4321, d);
    expect(r.outcome).toBe('already_gone');
    expect(d.kill).not.toHaveBeenCalled();
  });

  it('NEGATIVE CONTROL — a positive identification DOES kill', async () => {
    // Without this, every assertion above would also pass on an implementation that never kills
    // anything, which would leave the original defect fully intact.
    const d = deps({ probe: 'MATCH' });
    await retirePredecessorProcess(4321, d);
    expect(d.kill).toHaveBeenCalled();
  });

  it('skips a missing or malformed pid without throwing', async () => {
    for (const bad of [undefined, null, 0, -1, 'abc', NaN]) {
      const d = deps();
      const r = await retirePredecessorProcess(bad, d);
      expect(r.outcome).toBe('skipped');
      expect(d.kill).not.toHaveBeenCalled();
    }
  });
});

describe('an unverifiable outcome is REPORTED, never claimed as success', () => {
  it('reports unverified when absence cannot be confirmed after both signals', async () => {
    // Silence here is the defect: a restart that says "ok" while the predecessor may still be
    // running is exactly the false attestation this SD exists to remove.
    const d = deps({ goneAfter: 99 });
    const r = await retirePredecessorProcess(4321, d);
    expect(r.outcome).toBe('unverified');
    expect(r.detail).toMatch(/could not verify/i);
  });

  it('never throws — a failing kill degrades to a reported error', async () => {
    const r = await retirePredecessorProcess(4321, {
      probeClaude: () => 'MATCH',
      kill: async () => { throw new Error('Access is denied.'); },
      verifyGone: async () => false,
    });
    expect(r.outcome).toBe('error');
    expect(r.detail).toMatch(/Access is denied/);
  });
});
