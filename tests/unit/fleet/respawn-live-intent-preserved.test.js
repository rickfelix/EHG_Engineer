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
      // SD-LEO-INFRA-SESSION-SPAWN-AND-PROMPT-LIBRARY-001-F (FR-3): this invocation was previously
      // degenerate ({ program: 'claude', args: [] }). The launch contract is now enforced at the live
      // spawn seam in reboot-respawn-runner, so a degenerate invocation is refused before spawnFn runs.
      //
      // Making it CONFORMANT is an adaptation, not a weakening: this file's assertions all target
      // OUTCOME DERIVATION (live_requested / live / respawn_unbound / respawn_unattempted), and the
      // argv was incidental to every one of them. Contrast reboot-respawn-drill-runner.test.js:260,
      // where the degenerate invocation IS load-bearing — that test runs live:false, never reaches the
      // guarded assert, and was deliberately left untouched.
      buildInvocationFn: () => ({
        program: 'wt.exe',
        args: ['-w', 'new', 'new-tab', '-d', 'R:\\repo', '--', 'claude.cmd'],
        env: {},
        persistent: true,
        sessionId: 'sess-x',
      }),
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

  // SD-LEO-INFRA-SESSION-SPAWN-AND-PROMPT-LIBRARY-001-F — TS-2. The reboot-respawn runner's
  // buildInvocationFn is caller-INJECTABLE, making it the only path by which a non-conformant
  // invocation can reach a LIVE spawn without editing the builder or manipulating env. That is the
  // highest-value of the three seams, and this is its guard.
  //
  // SPAWN SAFETY: runRebootRespawn spawns nothing itself (spawnFn defaults to null), and this test
  // injects an explicit vi.fn(). It never routes through start-cp3-drills.js or reboot-respawn.cjs —
  // a non-mocked --live once produced 12-13 real worker spawns on the chairman's machine.
  it('TS-2: a non-conformant injected invocation is REFUSED at the live seam and never reaches spawnFn', async () => {
    const spawnFn = vi.fn(() => ({ pid: 9999 }));
    const emitted = [];
    await runRebootRespawn({
      supabase: {},
      loadFn: async () => [SLOT],
      rosterFn: () => [{ callsign: 'Test-1', role: 'worker' }],
      // Degenerate on purpose: bare program, no -d, no -w new, not persistent.
      buildInvocationFn: () => ({ program: 'claude', args: [], env: {}, sessionId: 'sess-x' }),
      spawnFn,
      logFn: async (_sb, ev) => { emitted.push(ev); return { ok: true }; },
      live: true,
      now: () => '2026-07-26T00:00:00Z',
      opts: {},
    });
    // The whole point: the spawn is refused, not merely reported after the fact.
    expect(spawnFn).not.toHaveBeenCalled();
    // And the refusal is observable rather than silent — the runner logs the failure and the
    // emitted event records that nothing bound.
    const payload = emitted[0]?.payload;
    expect(payload?.live).toBe(false);
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
