/**
 * SD-LEO-INFRA-WORKER-EXTERNAL-REVIVAL-001 — the spawn-execution consumer.
 * Verifies the pure decision core (resolveSpawnDecisions) and the daemon's dry-run vs live
 * behavior (runExecutor) with an injected spawner — zero blast radius, no real process spawn.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { resolveSpawnDecisions } = require('../../../lib/fleet/spawn-executor-core.cjs');
const { runExecutor, buildSpawnInvocation, resolvePerTickCap, isLiveEnabled } = require('../../../scripts/fleet/worker-spawn-executor.cjs');

const NOW = 1_000_000_000_000;
const future = () => new Date(NOW + 60 * 60 * 1000).toISOString();
const past = () => new Date(NOW - 1000).toISOString();
function req(id, callsign, over = {}) {
  return { id, requested_callsign: callsign, status: 'pending', requested_at: new Date(NOW - 1000).toISOString(), expires_at: future(), ...over };
}

describe('resolveSpawnDecisions (FR-1, pure)', () => {
  it('skips expired and non-pending requests', () => {
    const r = resolveSpawnDecisions({
      pendingRequests: [req('a', 'Echo', { expires_at: past() }), req('b', 'Bravo', { status: 'fulfilled' })],
      liveCallsigns: [], nowMs: NOW, perTickCap: 5,
    });
    expect(r.toSpawn).toHaveLength(0);
    expect(r.skipped.map(s => s.reason).sort()).toEqual(['expired', 'not_pending']);
  });

  it('skips a callsign already backed by a live session', () => {
    const r = resolveSpawnDecisions({ pendingRequests: [req('a', 'Echo')], liveCallsigns: ['Echo'], nowMs: NOW, perTickCap: 5 });
    expect(r.toSpawn).toHaveLength(0);
    expect(r.skipped[0].reason).toBe('already_live');
  });

  it('dedups multiple pending for the same callsign, keeping the oldest', () => {
    const older = req('a', 'Echo', { requested_at: new Date(NOW - 5000).toISOString() });
    const newer = req('b', 'Echo', { requested_at: new Date(NOW - 1000).toISOString() });
    const r = resolveSpawnDecisions({ pendingRequests: [newer, older], liveCallsigns: [], nowMs: NOW, perTickCap: 5 });
    expect(r.toSpawn).toHaveLength(1);
    expect(r.toSpawn[0].id).toBe('a');
    expect(r.skipped.find(s => s.request.id === 'b').reason).toBe('duplicate_callsign');
  });

  it('caps the result at perTickCap, marking overflow cap_exceeded', () => {
    const r = resolveSpawnDecisions({
      pendingRequests: [req('a', 'Echo'), req('b', 'Bravo'), req('c', 'Delta')],
      liveCallsigns: [], nowMs: NOW, perTickCap: 2,
    });
    expect(r.toSpawn).toHaveLength(2);
    expect(r.skipped.filter(s => s.reason === 'cap_exceeded')).toHaveLength(1);
  });

  it('perTickCap=0 spawns nothing', () => {
    const r = resolveSpawnDecisions({ pendingRequests: [req('a', 'Echo')], liveCallsigns: [], nowMs: NOW, perTickCap: 0 });
    expect(r.toSpawn).toHaveLength(0);
    expect(r.skipped[0].reason).toBe('cap_exceeded');
  });
});

describe('runExecutor (FR-2, dry-run vs live)', () => {
  it('DRY-RUN: never calls the spawner and never stamps fulfillment', async () => {
    const spawner = vi.fn();
    const stampFulfilled = vi.fn();
    const r = await runExecutor({
      pendingRequests: [req('a', 'Echo'), req('b', 'Bravo')],
      liveCallsigns: new Set(), nowMs: NOW, perTickCap: 5,
      live: false, spawner, stampFulfilled, prompt: 'PROMPT',
    });
    expect(spawner).not.toHaveBeenCalled();
    expect(stampFulfilled).not.toHaveBeenCalled();
    expect(r.dryRun).toBe(true);
    expect(r.spawned).toBe(0);
  });

  it('LIVE: calls the spawner and stamps fulfillment for each toSpawn', async () => {
    const spawner = vi.fn().mockResolvedValue(undefined);
    const stampFulfilled = vi.fn().mockResolvedValue(undefined);
    const r = await runExecutor({
      pendingRequests: [req('a', 'Echo'), req('b', 'Bravo')],
      liveCallsigns: new Set(), nowMs: NOW, perTickCap: 5,
      live: true, spawner, stampFulfilled, prompt: 'PROMPT',
    });
    expect(spawner).toHaveBeenCalledTimes(2);
    expect(stampFulfilled).toHaveBeenCalledTimes(2);
    expect(r.spawned).toBe(2);
    expect(r.errors).toBe(0);
  });

  it('LIVE: a spawner error leaves the row un-fulfilled (no false fulfillment)', async () => {
    const spawner = vi.fn().mockRejectedValue(new Error('spawn boom'));
    const stampFulfilled = vi.fn().mockResolvedValue(undefined);
    const r = await runExecutor({
      pendingRequests: [req('a', 'Echo')],
      liveCallsigns: new Set(), nowMs: NOW, perTickCap: 5,
      live: true, spawner, stampFulfilled, prompt: 'PROMPT',
    });
    expect(spawner).toHaveBeenCalledTimes(1);
    expect(stampFulfilled).not.toHaveBeenCalled();
    expect(r.spawned).toBe(0);
    expect(r.errors).toBe(1);
  });

  it('LIVE: respects already-live dedup (does not spawn a live callsign)', async () => {
    const spawner = vi.fn().mockResolvedValue(undefined);
    const stampFulfilled = vi.fn().mockResolvedValue(undefined);
    await runExecutor({
      pendingRequests: [req('a', 'Echo')],
      liveCallsigns: new Set(['Echo']), nowMs: NOW, perTickCap: 5,
      live: true, spawner, stampFulfilled, prompt: 'PROMPT',
    });
    expect(spawner).not.toHaveBeenCalled();
  });
});

describe('config + invocation helpers (FR-3)', () => {
  it('isLiveEnabled is false unless the flag is exactly true', () => {
    expect(isLiveEnabled({})).toBe(false);
    expect(isLiveEnabled({ WORKER_SPAWN_EXECUTOR_LIVE: 'false' })).toBe(false);
    expect(isLiveEnabled({ WORKER_SPAWN_EXECUTOR_LIVE: '1' })).toBe(false);
    expect(isLiveEnabled({ WORKER_SPAWN_EXECUTOR_LIVE: 'true' })).toBe(true);
    expect(isLiveEnabled({ WORKER_SPAWN_EXECUTOR_LIVE: 'TRUE' })).toBe(true);
  });

  it('resolvePerTickCap defaults to 2 and honors a valid override', () => {
    expect(resolvePerTickCap({})).toBe(2);
    expect(resolvePerTickCap({ WORKER_SPAWN_EXECUTOR_PER_TICK_CAP: '5' })).toBe(5);
    expect(resolvePerTickCap({ WORKER_SPAWN_EXECUTOR_PER_TICK_CAP: '0' })).toBe(0);
    expect(resolvePerTickCap({ WORKER_SPAWN_EXECUTOR_PER_TICK_CAP: 'x' })).toBe(2);
  });

  it('buildSpawnInvocation returns a structured command without executing it', () => {
    const inv = buildSpawnInvocation('Echo', 'PROMPT');
    expect(inv.program).toMatch(/claude(\.cmd)?$/); // pilot FR-1: resolved full claude.cmd on a Windows fleet host, bare 'claude' on CI/non-Windows
    expect(Array.isArray(inv.args)).toBe(true);
    expect(inv.args).toContain('PROMPT');
    expect(inv.env.FLEET_WORKER_CALLSIGN).toBe('Echo');
  });
});
