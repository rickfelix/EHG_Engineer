/**
 * QF-20260725-813 — FOURTH instance of the lost-live family (QF-20260724-499 threaded live into the
 * restart + relaunch legs and missed respawn).
 *
 * The intent was never lost at the boundary — opts.live arrives fine. It was ERASED AT THE EMITTER:
 * a live request that never reached spawnFn emitted outcome:'dry_run', byte-identical to a deliberate
 * mechanism check. spawnFn defaults to null, so any caller omitting it (start-cp3-drills.js) took that
 * path with live:true.
 *
 * Why critical rather than cosmetic: the drill's evidence guard counted 'dry_run' as a valid event, so
 * a live acceptance run that spawned nothing self-reported GREEN having proven nothing — a false ACCEPT.
 */
import { describe, it, expect } from 'vitest';
import { runRebootRespawn } from '../../../lib/fleet/reboot-respawn-runner.js';

const SLOT = { name: 'slot-1', role: 'worker', callsign: 'Test-1', resume_uuid: null };

function harness({ live, spawnFn }) {
  const emitted = [];
  return {
    emitted,
    args: {
      supabase: {},
      loadFn: async () => [SLOT],
      rosterFn: () => [{ callsign: 'Test-1', role: 'worker' }],
      buildInvocationFn: () => ({ program: 'claude', args: [], env: {}, sessionId: 'sess-x' }),
      spawnFn,
      logFn: async (_sb, ev) => { emitted.push(ev); return { ok: true }; },
      live,
      now: () => '2026-07-26T00:00:00Z',
      opts: {},
    },
  };
}

describe('QF-20260725-813 — live intent survives to the emitter', () => {
  it('LIVE requested but spawnFn omitted (the reported bug) is NOT reported as dry_run', async () => {
    const h = harness({ live: true, spawnFn: null });
    await runRebootRespawn(h.args);
    const payload = h.emitted[0].payload;
    expect(payload.outcome).toBe('respawn_unattempted');
    expect(payload.outcome).not.toBe('dry_run'); // the exact conflation that caused the false ACCEPT
  });

  it('carries live_requested:true so intent is visible even when nothing bound', async () => {
    const h = harness({ live: true, spawnFn: null });
    await runRebootRespawn(h.args);
    const payload = h.emitted[0].payload;
    expect(payload.live_requested).toBe(true);
    expect(payload.live).toBe(false); // achieved: nothing bound — ground truth, unchanged
  });

  it('a genuine dry run (live:false) STILL reports dry_run and live_requested:false', async () => {
    const h = harness({ live: false, spawnFn: null });
    await runRebootRespawn(h.args);
    const payload = h.emitted[0].payload;
    expect(payload.outcome).toBe('dry_run');
    expect(payload.live_requested).toBe(false);
    expect(payload.live).toBe(false);
  });

  it('QF-20260724-911 invariant preserved: payload.live still derives from reconciliation, not from spawnFn returning', async () => {
    // spawnFn returns a child with a pid, so `spawned` is true — but nothing reconciles to a session,
    // so live MUST stay false and the outcome MUST be respawn_unbound (not 'ok', not 'dry_run').
    const h = harness({ live: true, spawnFn: () => ({ pid: 4242 }) });
    await runRebootRespawn(h.args);
    const payload = h.emitted[0].payload;
    expect(payload.live).toBe(false);
    expect(payload.outcome).toBe('respawn_unbound');
    expect(payload.live_requested).toBe(true);
  });
});
