/**
 * SD-LEO-INFRA-LEO-COMPLETION-001-D FR-5 — reboot-respawn runner.
 * Exercises the REAL runner logic (real buildLiveSpawnInvocation argv, real event payloads) via
 * injected loadFn/spawnFn/logFn seams — NOT mocking away the assertion. The load-bearing LIVE drill
 * (no_unit_mock=true) is separate (FR-7 / runbook); these lock the deterministic mechanism.
 */
import { describe, it, expect, vi } from 'vitest';
import { runRebootRespawn } from '../../../lib/fleet/reboot-respawn-runner.js';

const SLOTS = [
  { name: 'Worker-1', role: 'worker', account_profile: null, resume_uuid: 'u-1' },
  { name: 'Worker-2', role: 'worker', account_profile: null, resume_uuid: null }, // no token -> back-compat path
];

describe('runRebootRespawn dry-run (FR-5) — default INERT', () => {
  it('spawns NOTHING, logs per-slot resume invocations, and emits one fleet_verb_respawn event per slot', async () => {
    const events = [];
    const logFn = vi.fn(async (_s, ev) => { events.push(ev); return { ok: true }; });
    const spawnFn = vi.fn();
    const res = await runRebootRespawn({
      supabase: {}, loadFn: async () => SLOTS, spawnFn, logFn, live: false, now: () => '2026-07-20T00:00:00.000Z',
    });

    expect(spawnFn).not.toHaveBeenCalled(); // default-OFF: no OS process
    expect(res.live).toBe(false);
    expect(res.slotCount).toBe(2);
    // One event per slot (recorded in dry-run too so the in-session drill can observe the run).
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.event_type === 'fleet_verb_respawn')).toBe(true);
    expect(events[0].payload).toMatchObject({ verb: 'respawn', callsign: 'Worker-1', resume_uuid: 'u-1', live: false });

    // The per-slot invocation carries the correct --resume token (slot 1) / no token (slot 2).
    expect(res.results[0].invocation.args).toEqual(['new-tab', '--', 'claude', '--resume', 'u-1']);
    expect(res.results[1].invocation.args).toEqual(['new-tab', '--', 'claude']);
  });

  it('builds a supervisor-shaped roster from the slots', async () => {
    const res = await runRebootRespawn({ supabase: {}, loadFn: async () => SLOTS, logFn: async () => ({ ok: true }), live: false });
    expect(res.roster).toEqual([
      { role: 'worker', callsign: 'Worker-1', accountProfile: null, resume_uuid: 'u-1' },
      { role: 'worker', callsign: 'Worker-2', accountProfile: null, resume_uuid: null },
    ]);
  });
});

describe('runRebootRespawn live (FR-5)', () => {
  it('invokes spawnFn per slot with the real --resume argv when live', async () => {
    const spawnCalls = [];
    const spawnFn = vi.fn((program, args) => { spawnCalls.push({ program, args }); return { pid: 111 }; });
    const res = await runRebootRespawn({
      supabase: {}, loadFn: async () => SLOTS, spawnFn, logFn: async () => ({ ok: true }), live: true, now: () => 'iso',
    });
    expect(res.live).toBe(true);
    expect(spawnFn).toHaveBeenCalledTimes(2);
    expect(spawnCalls[0]).toEqual({ program: 'wt.exe', args: ['new-tab', '--', 'claude', '--resume', 'u-1'] });
    expect(spawnCalls[1].args).toEqual(['new-tab', '--', 'claude']); // slot 2 had no token
    expect(res.results.map((r) => r.spawned)).toEqual([true, true]);
  });

  it('resolves account_profile into CLAUDE_CONFIG_DIR via the injected resolver, and is fail-soft if it throws', async () => {
    const okResolver = (name) => `C:\\profiles\\${name}`;
    const spawnCalls = [];
    const spawnFn = (program, args, env) => { spawnCalls.push(env); return { pid: 1 }; };
    const res = await runRebootRespawn({
      supabase: {}, loadFn: async () => [{ name: 'Canary-1', role: 'worker', account_profile: 'canary', resume_uuid: 'u-c' }],
      spawnFn, logFn: async () => ({ ok: true }), live: true, resolveProfileDirFn: okResolver,
    });
    expect(spawnCalls[0].CLAUDE_CONFIG_DIR).toBe('C:\\profiles\\canary');
    expect(res.results[0].spawned).toBe(true);

    // Throwing resolver -> profileDir null, slot still respawns (fail-soft), no CLAUDE_CONFIG_DIR.
    const spawnCalls2 = [];
    const res2 = await runRebootRespawn({
      supabase: {}, loadFn: async () => [{ name: 'Canary-1', role: 'worker', account_profile: 'bad', resume_uuid: 'u-c' }],
      spawnFn: (p, a, e) => { spawnCalls2.push(e); return { pid: 1 }; },
      logFn: async () => ({ ok: true }), live: true, resolveProfileDirFn: () => { throw new Error('bad profile'); },
    });
    expect(spawnCalls2[0]).not.toHaveProperty('CLAUDE_CONFIG_DIR');
    expect(res2.results[0].spawned).toBe(true);
  });
});
