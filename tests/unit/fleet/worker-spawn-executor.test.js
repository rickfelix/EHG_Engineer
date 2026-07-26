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
const { assertLaunchContract } = require('../../../lib/fleet/build-session-launch.cjs');

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

  // SD-LEO-INFRA-SESSION-SPAWN-AND-PROMPT-LIBRARY-001-F — TS-3, the LOAD-BEARING guard for FR-2.
  //
  // The launch contract is now asserted at the execution seam in runExecutor. FR-2 requires that the
  // seam checks STRUCTURAL clauses only, with expectProfile/expectResume FALSE. This path legitimately
  // builds without a profile or resume token, so if a future edit hardcoded those expectations true,
  // EVERY worker revival would stop spawning. This test is the tripwire for that.
  //
  // WHY THE SEAM MOVED: an earlier draft placed the assertion inside main()'s inline spawner closure,
  // which is require.main-guarded and not exported — every test here injects its own spawner, so an
  // assertion there would run in ZERO tests and this guard would be green against a correct AND a
  // broken implementation. Verified RED against a hardcoded expectProfile/expectResume:true build
  // (spawner not called, errors=1); GREEN as written.
  it('TS-3: a no-profile / no-resume revival still spawns — the launch assert is structural-only', async () => {
    const spawner = vi.fn().mockResolvedValue(undefined);
    const stampFulfilled = vi.fn().mockResolvedValue(undefined);
    const r = await runExecutor({
      pendingRequests: [req('a', 'Echo')],
      liveCallsigns: new Set(), nowMs: NOW, perTickCap: 5,
      live: true, spawner, stampFulfilled, prompt: 'PROMPT',
    });
    // buildSpawnInvocation supplies neither CLAUDE_CONFIG_DIR nor a resume token — that is the
    // legitimate shape this fleet revives workers with, and it must remain spawnable.
    expect(spawner).toHaveBeenCalledTimes(1);
    expect(r.spawned).toBe(1);
    expect(r.errors).toBe(0);
    const [invocation] = spawner.mock.calls[0];
    expect(invocation.env?.CLAUDE_CONFIG_DIR).toBeUndefined();
    expect(invocation.args).not.toContain('--resume');
  });

  // MUTATION-KILLING seam test (EXEC-phase adversarial review, condition C2).
  //
  // TS-3 above proves the seam does not FALSELY reject. It does NOT prove the seam exists: reverting
  // the assertion entirely leaves TS-3 green, because with no assert the spawner is simply called.
  // The review demonstrated that this seam and the spawn-control one could BOTH be deleted outright
  // with the whole suite still passing — which is precisely the shipped-but-inert shape this SD was
  // written to eliminate, reproduced in the SD's own delivery. This test kills that mutation.
  //
  // Precedent: tests/unit/fleet/tree-currency.test.js added an equivalent mutation-killing block for
  // the same function after the identical finding.
  //
  // FLEET_CLAUDE_CMD is used because it is the ONE operator-reachable clause today —
  // resolveClaudeCmd returns it verbatim and the token regex rejects a non-claude basename.
  it('C2: the seam REFUSES a contract-violating invocation — deleting the assert makes this fail', async () => {
    const prior = process.env.FLEET_CLAUDE_CMD;
    process.env.FLEET_CLAUDE_CMD = 'C:\\tools\\node.exe'; // not a claude launcher token
    try {
      const spawner = vi.fn().mockResolvedValue(undefined);
      const stampFulfilled = vi.fn().mockResolvedValue(undefined);
      const r = await runExecutor({
        pendingRequests: [req('a', 'Echo')],
        liveCallsigns: new Set(), nowMs: NOW, perTickCap: 5,
        live: true, spawner, stampFulfilled, prompt: 'PROMPT',
      });
      expect(spawner).not.toHaveBeenCalled();
      expect(r.spawned).toBe(0);
      expect(r.errors).toBe(1);
      // The row must stay pending — a refused spawn must never be recorded as fulfilled.
      expect(stampFulfilled).not.toHaveBeenCalled();
    } finally {
      if (prior === undefined) delete process.env.FLEET_CLAUDE_CMD;
      else process.env.FLEET_CLAUDE_CMD = prior;
    }
  });

  it('C2 control: the SAME call with no override spawns normally (the refusal is not incidental)', async () => {
    const spawner = vi.fn().mockResolvedValue(undefined);
    const r = await runExecutor({
      pendingRequests: [req('a', 'Echo')],
      liveCallsigns: new Set(), nowMs: NOW, perTickCap: 5,
      live: true, spawner, stampFulfilled: vi.fn().mockResolvedValue(undefined), prompt: 'PROMPT',
    });
    expect(spawner).toHaveBeenCalledTimes(1);
    expect(r.errors).toBe(0);
  });

  it('TS-1: the invocation reaching the spawner is contract-conformant (argv unchanged by the assert)', async () => {
    const spawner = vi.fn().mockResolvedValue(undefined);
    await runExecutor({
      pendingRequests: [req('a', 'Echo')],
      liveCallsigns: new Set(), nowMs: NOW, perTickCap: 5,
      live: true, spawner, stampFulfilled: vi.fn().mockResolvedValue(undefined), prompt: 'PROMPT',
    });
    const [invocation] = spawner.mock.calls[0];
    // assertLaunchContract reads and returns {ok, violations}; it mutates nothing. Pin that the
    // spawner still receives the same structural shape it did before enforcement was added.
    expect(assertLaunchContract(invocation).ok).toBe(true);
    expect(invocation.program).toBe('wt.exe');
    expect(invocation.args).not.toContain('-p');
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

  it('buildSpawnInvocation returns a PERSISTENT wt.exe launch (canonical buildSessionLaunch, FR-2) — not headless claude -p', () => {
    const inv = buildSpawnInvocation('Echo', 'PROMPT');
    expect(inv.program).toBe('wt.exe'); // persistent session that registers in claude_sessions, not headless -p
    expect(Array.isArray(inv.args)).toBe(true);
    expect(inv.args).not.toContain('-p'); // never headless
    expect(inv.persistent).toBe(true);
    // FR-2: was `toBe('PROMPT')`, described as "carried in env for the SessionStart hook to seed".
    // No such hook exists and nothing reads the variable, so this asserted a write that no consumer
    // ever observed. The carrier is deleted; the prompt has no delivery path until FR-1.
    expect(inv.env.FLEET_WORKER_STARTUP_PROMPT).toBeUndefined();
    expect(inv.env.FLEET_WORKER_CALLSIGN).toBe('Echo');
  });
});
