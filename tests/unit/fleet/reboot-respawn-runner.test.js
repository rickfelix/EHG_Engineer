/**
 * SD-LEO-INFRA-LEO-COMPLETION-001-D FR-5 — reboot-respawn runner.
 * Exercises the REAL runner logic (real buildLiveSpawnInvocation argv, real event payloads) via
 * injected loadFn/spawnFn/logFn seams — NOT mocking away the assertion. The load-bearing LIVE drill
 * (no_unit_mock=true) is separate (FR-7 / runbook); these lock the deterministic mechanism.
 */
import { describe, it, expect, vi } from 'vitest';
import { runRebootRespawn } from '../../../lib/fleet/reboot-respawn-runner.js';
import { resolveClaudeCmd, resolveRepoRoot } from '../../../lib/fleet/build-session-launch.cjs';

const SLOTS = [
  { name: 'Worker-1', role: 'worker', account_profile: null, resume_uuid: 'u-1' },
  { name: 'Worker-2', role: 'worker', account_profile: null, resume_uuid: null }, // no token -> back-compat path
];

/**
 * FR-3: with no resume token the spawner mints a session id and passes `claude --session-id <uuid>`,
 * so the child registers under a value the spawner already holds -- replacing the wt.exe-pid join that
 * could never match. Injected via uuidFn so argv assertions stay EXACT rather than being loosened.
 */
const MINTED = '11111111-2222-4333-8444-555555555555';

describe('runRebootRespawn dry-run (FR-5) — default INERT', () => {
  it('spawns NOTHING, logs per-slot resume invocations, and emits one fleet_verb_respawn event per slot', async () => {
    const events = [];
    const logFn = vi.fn(async (_s, ev) => { events.push(ev); return { ok: true }; });
    const spawnFn = vi.fn();
    const res = await runRebootRespawn({
      supabase: {}, loadFn: async () => SLOTS, spawnFn, logFn, live: false, now: () => '2026-07-20T00:00:00.000Z', uuidFn: () => MINTED,
    });

    expect(spawnFn).not.toHaveBeenCalled(); // default-OFF: no OS process
    expect(res.live).toBe(false);
    expect(res.slotCount).toBe(2);
    // One event per slot (recorded in dry-run too so the in-session drill can observe the run).
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.event_type === 'fleet_verb_respawn')).toBe(true);
    expect(events[0].payload).toMatchObject({ verb: 'respawn', callsign: 'Worker-1', resume_uuid: 'u-1', live: false });

    // The per-slot invocation carries the correct --resume token (slot 1) / no token (slot 2).
    expect(res.results[0].invocation.args).toEqual(['new-tab', '-d', resolveRepoRoot(), '--', resolveClaudeCmd(), '--resume', 'u-1']);
    // FR-3: a slot with no resume token gets a MINTED --session-id instead, so the spawner knows in
    // advance the id the child will register under. Injected via uuidFn for determinism.
    expect(res.results[1].invocation.args).toEqual(['new-tab', '-d', resolveRepoRoot(), '--', resolveClaudeCmd(), '--session-id', MINTED]);
  });

  // QF-20260724-335: opts.sdKey stamps every fleet_verb_respawn event with an explicit run-correlator
  // (e.g. 'CHECKPOINT-3') so the G1b/G2 leg's events are attributable to the same intentional CP3 run
  // as the other 2 legs (Solomon S7 acceptance).
  it('threads opts.sdKey onto every per-slot fleet_verb_respawn event (QF-20260724-335)', async () => {
    const events = [];
    const logFn = vi.fn(async (_s, ev) => { events.push(ev); return { ok: true }; });
    await runRebootRespawn({
      supabase: {}, loadFn: async () => SLOTS, spawnFn: vi.fn(), logFn, live: false, sdKey: 'CHECKPOINT-3',
    });
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.sd_key === 'CHECKPOINT-3')).toBe(true);
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
      supabase: {}, loadFn: async () => SLOTS, spawnFn, logFn: async () => ({ ok: true }), live: true, now: () => 'iso', sleepFn: vi.fn(), uuidFn: () => MINTED,
    });
    expect(res.live).toBe(true);
    expect(spawnFn).toHaveBeenCalledTimes(2);
    expect(spawnCalls[0]).toEqual({ program: 'wt.exe', args: ['new-tab', '-d', resolveRepoRoot(), '--', resolveClaudeCmd(), '--resume', 'u-1'] });
    expect(spawnCalls[1].args).toEqual(['new-tab', '-d', resolveRepoRoot(), '--', resolveClaudeCmd(), '--session-id', MINTED]); // slot 2 had no resume token -> minted id
    expect(res.results.map((r) => r.spawned)).toEqual([true, true]);
  });

  it('resolves account_profile into CLAUDE_CONFIG_DIR via the injected resolver, and is fail-soft if it throws', async () => {
    const okResolver = (name) => `C:\\profiles\\${name}`;
    const spawnCalls = [];
    const spawnFn = (program, args, env) => { spawnCalls.push(env); return { pid: 1 }; };
    const res = await runRebootRespawn({
      supabase: {}, loadFn: async () => [{ name: 'Canary-1', role: 'worker', account_profile: 'canary', resume_uuid: 'u-c' }],
      spawnFn, logFn: async () => ({ ok: true }), live: true, resolveProfileDirFn: okResolver, sleepFn: vi.fn(),
    });
    expect(spawnCalls[0].CLAUDE_CONFIG_DIR).toBe('C:\\profiles\\canary');
    expect(res.results[0].spawned).toBe(true);

    // Throwing resolver -> profileDir null, slot still respawns (fail-soft), no CLAUDE_CONFIG_DIR.
    const spawnCalls2 = [];
    const res2 = await runRebootRespawn({
      supabase: {}, loadFn: async () => [{ name: 'Canary-1', role: 'worker', account_profile: 'bad', resume_uuid: 'u-c' }],
      spawnFn: (p, a, e) => { spawnCalls2.push(e); return { pid: 1 }; },
      logFn: async () => ({ ok: true }), live: true, resolveProfileDirFn: () => { throw new Error('bad profile'); }, sleepFn: vi.fn(),
    });
    expect(spawnCalls2[0]).not.toHaveProperty('CLAUDE_CONFIG_DIR');
    expect(res2.results[0].spawned).toBe(true);
  });
});

describe('runRebootRespawn (QF-20260724-911): payload.live is ground-truth-reconciled, not spawnFn()-returned', () => {
  /** Minimal fake supporting exactly the claude_sessions.select().eq('pid',...).maybeSingle() shape used. */
  function makeFakeSupabase(sessionsByPid) {
    return {
      from: (table) => {
        if (table !== 'claude_sessions') throw new Error(`unexpected table: ${table}`);
        return { select: () => ({ eq: (_col, pid) => ({ maybeSingle: async () => ({ data: sessionsByPid[pid] || null }) }) }) };
      },
    };
  }

  it('binds session_id + live:true + outcome:ok when the spawned pid reconciles to a fresh, heartbeating session', async () => {
    const nowMs = 1_800_000_000_000;
    const supabase = makeFakeSupabase({ 111: { session_id: 's-new', heartbeat_at: new Date(nowMs - 1000).toISOString(), loop_state: 'active' } });
    const spawnFn = vi.fn(() => ({ pid: 111 }));
    const events = [];
    const logFn = vi.fn(async (_s, ev) => { events.push(ev); return { ok: true }; });
    const res = await runRebootRespawn({
      supabase, loadFn: async () => [SLOTS[0]], spawnFn, logFn, live: true, now: () => 'iso', sleepFn: vi.fn(), nowMs,
    });
    expect(res.results[0]).toMatchObject({ spawned: true, live: true, session_id: 's-new' });
    expect(events[0].session_id).toBe('s-new');
    expect(events[0].payload).toMatchObject({ live: true, outcome: 'ok' });
  });

  it('reports live:false + outcome:respawn_unbound + session_id:null (NOT true) when spawnFn returns without throwing but no session ever reconciles -- the exact forgeable case this fix closes (discriminating rule: a code path emitting live=true with session_id=null must fail a test like this one)', async () => {
    const spawnFn = vi.fn(() => ({ pid: 999 })); // "succeeds" per the old fire-and-forget check
    const supabase = makeFakeSupabase({}); // pid 999 never appears in claude_sessions -- child killed/failed before registering
    const events = [];
    const logFn = vi.fn(async (_s, ev) => { events.push(ev); return { ok: true }; });
    const res = await runRebootRespawn({
      supabase, loadFn: async () => [SLOTS[0]], spawnFn, logFn, live: true, now: () => 'iso', sleepFn: vi.fn(), reconcileMaxAttempts: 2,
    });
    expect(spawnFn).toHaveBeenCalled(); // the OS-level spawn call itself did succeed...
    expect(res.results[0]).toMatchObject({ spawned: true, live: false, session_id: null }); // ...but it never bound
    expect(events[0].session_id).toBeNull();
    expect(events[0].payload).toMatchObject({ live: false, outcome: 'respawn_unbound' });
  });

  it('retries the reconcile lookup (bounded) when the session row has not landed yet on the first attempt', async () => {
    const nowMs = 1_800_000_000_000;
    let lookups = 0;
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              lookups++;
              if (lookups < 2) return { data: null };
              return { data: { session_id: 's-late', heartbeat_at: new Date(nowMs - 1000).toISOString(), loop_state: 'active' } };
            },
          }),
        }),
      }),
    };
    const spawnFn = vi.fn(() => ({ pid: 111 }));
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const res = await runRebootRespawn({
      supabase, loadFn: async () => [SLOTS[0]], spawnFn, logFn: async () => ({ ok: true }), live: true, sleepFn, nowMs,
    });
    expect(lookups).toBe(2);
    expect(sleepFn).toHaveBeenCalledTimes(1);
    expect(res.results[0].session_id).toBe('s-late');
  });

  it('dry-run (live:false at the runner level) never attempts reconciliation: outcome:dry_run, session_id:null', async () => {
    const events = [];
    const logFn = vi.fn(async (_s, ev) => { events.push(ev); return { ok: true }; });
    const res = await runRebootRespawn({
      supabase: {}, loadFn: async () => [SLOTS[0]], spawnFn: vi.fn(), logFn, live: false, now: () => 'iso',
    });
    expect(res.results[0]).toMatchObject({ spawned: false, live: false, session_id: null });
    expect(events[0].payload).toMatchObject({ live: false, outcome: 'dry_run' });
  });
});

describe('runRebootRespawn (QF-20260724-070): durable bind-time audit row', () => {
  function makeFakeSupabase(sessionsByPid) {
    return {
      from: (table) => {
        if (table !== 'claude_sessions') throw new Error(`unexpected table: ${table}`);
        return { select: () => ({ eq: (_col, pid) => ({ maybeSingle: async () => ({ data: sessionsByPid[pid] || null }) }) }) };
      },
    };
  }

  it('writes an immutable RESPAWN_BIND_VERIFIED session_lifecycle_events row the instant the bind is confirmed healthy', async () => {
    const nowMs = 1_800_000_000_000;
    const supabase = makeFakeSupabase({ 111: { session_id: 's-new', heartbeat_at: new Date(nowMs - 1000).toISOString(), loop_state: 'active' } });
    const spawnFn = vi.fn(() => ({ pid: 111 }));
    const auditEvents = [];
    const writeLifecycleEventFn = vi.fn(async (_s, ev) => { auditEvents.push(ev); return true; });
    await runRebootRespawn({
      supabase, loadFn: async () => [SLOTS[0]], spawnFn, logFn: async () => ({ ok: true }), live: true,
      sleepFn: vi.fn(), nowMs, writeLifecycleEventFn, sdKey: 'CHECKPOINT-3', now: () => 'iso-checked-at',
    });
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]).toMatchObject({
      event_type: 'RESPAWN_BIND_VERIFIED', session_id: 's-new', pid: 111,
      metadata: { heartbeat_at: expect.any(String), loop_state: 'active', sd_key: 'CHECKPOINT-3', checked_at: 'iso-checked-at' },
    });
  });

  it('never writes an audit row when the session never binds (respawn_unbound)', async () => {
    const supabase = makeFakeSupabase({});
    const writeLifecycleEventFn = vi.fn(async () => true);
    const res = await runRebootRespawn({
      supabase, loadFn: async () => [SLOTS[0]], spawnFn: vi.fn(() => ({ pid: 999 })), logFn: async () => ({ ok: true }),
      live: true, sleepFn: vi.fn(), reconcileMaxAttempts: 2, writeLifecycleEventFn,
    });
    expect(res.results[0].session_id).toBeNull();
    expect(writeLifecycleEventFn).not.toHaveBeenCalled();
  });
});

/**
 * QF-20260724-290 — the keepalive prompt must survive BOTH hops (runner -> buildLiveSpawnInvocation
 * -> buildSessionLaunch) and land in the spawned child's env. Asserted on the env the REAL spawnFn
 * seam receives, not on an intermediate call arg: a prompt that is passed but silently discarded one
 * hop later is exactly the ghost this fixes, and an arg-level assertion would not have caught it.
 */
describe('runRebootRespawn keepalive prompt plumbing (QF-20260724-290)', () => {
  it('forwards the canonical FLEET_WORKER_STARTUP_PROMPT into the respawned child env', async () => {
    const { FLEET_WORKER_STARTUP_PROMPT } = await import('../../../lib/coordinator/coordination-events.cjs');
    let childEnv = null;
    await runRebootRespawn({
      supabase: null, loadFn: async () => [SLOTS[0]], logFn: async () => ({ ok: true }), live: true,
      spawnFn: (_p, _a, env) => { childEnv = env; return { pid: 0 }; },
    });
    expect(childEnv.FLEET_WORKER_STARTUP_PROMPT).toBe(FLEET_WORKER_STARTUP_PROMPT);
    expect(childEnv.FLEET_WORKER_STARTUP_PROMPT.length).toBeGreaterThan(0);
  });

  it('honors an explicit startupPrompt:null opt-out (env var left unset)', async () => {
    let childEnv = null;
    await runRebootRespawn({
      supabase: null, loadFn: async () => [SLOTS[0]], logFn: async () => ({ ok: true }), live: true,
      startupPrompt: null, spawnFn: (_p, _a, env) => { childEnv = env; return { pid: 0 }; },
    });
    expect(childEnv.FLEET_WORKER_STARTUP_PROMPT).toBeUndefined();
  });
});
