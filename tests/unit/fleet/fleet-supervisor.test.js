/**
 * SD-LEO-INFRA-LEO-COMPLETION-001-C — fleet supervisor core (G1a).
 * Deterministic unit coverage of the supervisor logic via injected seams (spawnControl, probeChild,
 * clock). The OS-level kill -9 survival property is unmockable and is proven by the operator LIVE
 * DRILL (docs/protocol/fleet-supervisor-live-drill.md), not here — these tests lock the surrounding
 * logic: default-OFF inertness, NON-CASCADING graceful teardown, and watch-loop detect→remediate.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createSupervisor, armUnrefInterval } = require('../../../scripts/fleet/fleet-supervisor.cjs');

function makeFakeSpawnControl({ live = false } = {}) {
  return {
    isLiveEnabled: () => live,
    spawn: vi.fn(async (target, opts) => ({ live: opts.live, callsign: target.callsign, pid: 1234 })),
    restart: vi.fn(async (callsign) => ({ ok: true, callsign })),
    stop: vi.fn(async (callsign) => ({ ok: true, callsign })),
  };
}
const BIG = 1e9; // never fires during a test; we drive tick() manually

describe('createSupervisor: guards', () => {
  it('requires a spawnControl with spawn()', () => {
    expect(() => createSupervisor({})).toThrow(/spawnControl/);
  });
  it('exports armUnrefInterval helper (Windows exit-143-safe resident timer)', () => {
    const t = armUnrefInterval(() => {}, BIG);
    expect(t).toBeDefined();
    clearInterval(t);
  });
});

describe('createSupervisor: default-OFF inertness (FR-5)', () => {
  it('dry-run start spawns via spawn-control with live:false and NEVER restarts a lost child', async () => {
    const sc = makeFakeSpawnControl({ live: false });
    const probeChild = vi.fn().mockResolvedValue(false); // child appears lost
    const sup = createSupervisor({ roster: [{ role: 'worker', callsign: 'C-1' }], spawnControl: sc, probeChild, live: false, intervalMs: BIG });
    await sup.start();
    expect(sc.spawn).toHaveBeenCalledTimes(1);
    expect(sc.spawn.mock.calls[0][1].live).toBe(false);
    const outcomes = await sup.tick();
    expect(sc.restart).not.toHaveBeenCalled();          // dry-run remediates NOTHING
    expect(outcomes[0].action).toBe('would_restart');
    await sup.stopWatch();
  });
});

describe('createSupervisor: NON-CASCADING graceful teardown (kill-survival parity, TESTING gap #1)', () => {
  it('stopWatch() (default) does NOT stop/kill tracked children; cascade:true does', async () => {
    const sc = makeFakeSpawnControl({ live: true });
    const sup = createSupervisor({ roster: [{ role: 'worker', callsign: 'C-1' }], spawnControl: sc, probeChild: vi.fn().mockResolvedValue(true), live: true, intervalMs: BIG });
    await sup.start();
    expect(sup.isWatching()).toBe(true);
    const r = await sup.stopWatch();                    // graceful SIGINT/SIGTERM path
    expect(r.cascade).toBe(false);
    expect(sc.stop).not.toHaveBeenCalled();             // fleet must survive a graceful supervisor exit
    expect(sup.isWatching()).toBe(false);
    await sup.stopWatch({ cascade: true });             // explicit intentional teardown
    expect(sc.stop).toHaveBeenCalledWith('C-1', expect.any(Object));
  });
});

describe('createSupervisor: watch-loop detect→remediate (TESTING gap #4)', () => {
  it('live tick restarts ONLY the lost child and leaves the alive one', async () => {
    const sc = makeFakeSpawnControl({ live: true });
    const probeChild = vi.fn()
      .mockResolvedValueOnce(true)    // C-1 alive
      .mockResolvedValueOnce(false);  // C-2 lost
    const sup = createSupervisor({ roster: [{ role: 'worker', callsign: 'C-1' }, { role: 'worker', callsign: 'C-2' }], spawnControl: sc, probeChild, live: true, intervalMs: BIG });
    await sup.start();
    const outcomes = await sup.tick();
    expect(sc.restart).toHaveBeenCalledTimes(1);
    expect(sc.restart).toHaveBeenCalledWith('C-2', expect.any(Object));
    expect(outcomes.find((o) => o.callsign === 'C-1').action).toBe('alive');
    expect(outcomes.find((o) => o.callsign === 'C-2').action).toBe('restarted');
    await sup.stopWatch();
  });
});
