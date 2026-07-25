/**
 * SD-LEO-INFRA-LEO-COMPLETION-001-B FR-3 -- canary isolation harness (fail-closed assert-before-kill).
 */
import { readFileSync } from 'node:fs';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../lib/coordinator/coordination-events.cjs', () => ({
  logCoordinationEvent: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock('../../../lib/coordinator/singleton-refresh-sequencer.cjs', () => ({
  sequenceSingletonRefresh: vi.fn(),
}));
// QF-20260724-295: partial mock so canaryRestart's LIVE-respawn wiring can be exercised without a real
// OS spawn -- only restart() is replaced; stop()/relaunchUnderProfile() stay REAL for the existing tests.
vi.mock('../../../lib/fleet/spawn-control.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, restart: vi.fn() };
});

const { restart: spawnControlRestartMock } = await import('../../../lib/fleet/spawn-control.js');
const {
  isCanaryKillEnabled, isCanaryCallsign, resolveCanaryTarget, assertCanaryTarget,
  canaryStop, canaryRestart, canaryRelaunchUnderProfile, stampRespawnedCanary,
} = await import('../../../lib/fleet/canary-guard.js');

/** Same claude_sessions fake shape as spawn-control.test.js, extended with account_profile in metadata. */
function makeFakeSupabase({ sessions = [] } = {}) {
  const store = new Map(sessions.map((s) => [s.session_id, { ...s }]));
  return {
    _store: store,
    from(table) {
      if (table === 'claude_sessions') {
        return {
          select() {
            return {
              in: async (col, vals) => ({ data: [...store.values()].filter((s) => vals.includes(s[col])) }),
              eq: (col, val) => ({
                maybeSingle: async () => ({ data: [...store.values()].find((s) => s[col] === val) || null }),
              }),
            };
          },
          update(patch) {
            return {
              eq: (col, val) => {
                const row = [...store.values()].find((s) => s[col] === val);
                if (row) Object.assign(row, patch);
                return Promise.resolve({ error: row ? null : { message: 'not found' } });
              },
            };
          },
        };
      }
      if (table === 'session_coordination') {
        return { select: () => ({ eq: () => ({ gte: async () => ({ count: 0 }) }) }) };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

const canarySession = { session_id: 's-canary', pid: 111, status: 'active', metadata: { fleet_identity: { callsign: 'Canary-1' }, account_profile: 'canary', role: 'worker' } };
const prodSession = { session_id: 's-prod', pid: 222, status: 'active', metadata: { fleet_identity: { callsign: 'Alpha-5' }, account_profile: 'default', role: 'worker' } };
const noProfileSession = { session_id: 's-noprofile', pid: 333, status: 'active', metadata: { fleet_identity: { callsign: 'Canary-2' } } };

describe('isCanaryKillEnabled (independent from FLEET_SPAWN_CONTROL_LIVE, default OFF)', () => {
  it('is OFF by default', () => {
    expect(isCanaryKillEnabled({})).toBe(false);
  });
  it('is ON only when explicitly true', () => {
    expect(isCanaryKillEnabled({ FLEET_CANARY_KILL_ENABLED: 'true' })).toBe(true);
    expect(isCanaryKillEnabled({ FLEET_CANARY_KILL_ENABLED: 'false' })).toBe(false);
  });
  it('is a DISTINCT flag from FLEET_SPAWN_CONTROL_LIVE (setting one does not imply the other)', () => {
    expect(isCanaryKillEnabled({ FLEET_SPAWN_CONTROL_LIVE: 'true' })).toBe(false);
  });
});

describe('isCanaryCallsign', () => {
  it('matches only the canary-only namespace prefix', () => {
    expect(isCanaryCallsign('Canary-1')).toBe(true);
    expect(isCanaryCallsign('Alpha-5')).toBe(false);
    expect(isCanaryCallsign(null)).toBe(false);
  });
});

describe('resolveCanaryTarget: reads account_profile server-side from claude_sessions.metadata', () => {
  it('resolves a canary session with its account_profile intact', async () => {
    const sb = makeFakeSupabase({ sessions: [canarySession] });
    const result = await resolveCanaryTarget(sb, { by: 'callsign', value: 'Canary-1' });
    expect(result.resolved).toBe(true);
    expect(result.identity.account_profile).toBe('canary');
  });

  it('resolves a non-canary session with its real (non-canary) account_profile -- never trusts caller claims', async () => {
    const sb = makeFakeSupabase({ sessions: [prodSession] });
    const result = await resolveCanaryTarget(sb, { by: 'callsign', value: 'Alpha-5' });
    expect(result.resolved).toBe(true);
    expect(result.identity.account_profile).toBe('default');
  });
});

describe('assertCanaryTarget (FR-3 fail-closed core, TS-5/TS-5a-d)', () => {
  it('ACCEPTS a genuinely resolved canary session', () => {
    expect(assertCanaryTarget({ resolved: true, identity: { account_profile: 'canary', callsign: 'Canary-1' } })).toEqual({ ok: true });
  });

  it('TS-5: REJECTS a non-canary session', () => {
    expect(assertCanaryTarget({ resolved: true, identity: { account_profile: 'default', callsign: 'Alpha-5' } })).toEqual({ ok: false, reason: 'not_canary_profile' });
  });

  it('TS-5a: REJECTS even if the resolution object appears to carry a spoofed canary claim outside the server-resolved identity (guard reads ONLY identity.account_profile)', () => {
    // Simulates a caller trying to smuggle a canary claim anywhere other than the server-resolved field.
    const spoofed = { resolved: true, identity: { account_profile: 'default', callsign: 'Alpha-5' }, account_profile: 'canary', claimed_canary: true };
    expect(assertCanaryTarget(spoofed)).toEqual({ ok: false, reason: 'not_canary_profile' });
  });

  it('TS-5b: REJECTS on ambiguous resolution (fail-closed, not fail-open)', () => {
    expect(assertCanaryTarget({ resolved: false, reason: 'ambiguous' })).toEqual({ ok: false, reason: 'ambiguous' });
  });

  it('TS-5c: REJECTS on not_found', () => {
    expect(assertCanaryTarget({ resolved: false, reason: 'not_found' })).toEqual({ ok: false, reason: 'not_found' });
  });

  it('TS-5d: REJECTS when the resolved session has no account_profile field at all (absence != canary)', () => {
    expect(assertCanaryTarget({ resolved: true, identity: { callsign: 'Canary-2' } })).toEqual({ ok: false, reason: 'not_canary_profile' });
  });

  it('REJECTS a canary-profile session whose callsign is outside the canary namespace (defence-in-depth)', () => {
    expect(assertCanaryTarget({ resolved: true, identity: { account_profile: 'canary', callsign: 'Alpha-5' } })).toEqual({ ok: false, reason: 'not_canary_callsign' });
  });
});

describe('canaryStop / canaryRestart / canaryRelaunchUnderProfile (guarded verbs, TS-6a)', () => {
  it('TS-6a: canary-kill flag OFF -- a genuinely-resolved canary session is NOT killed (AND-composition, not OR)', async () => {
    const sb = makeFakeSupabase({ sessions: [canarySession] });
    const result = await canaryStop('Canary-1', { supabaseClient: sb, env: {} });
    expect(result).toEqual({ ok: false, reason: 'canary_kill_disabled', verb: 'stop', guarded: true });
    expect(sb._store.get('s-canary').status).toBe('active'); // underlying stop() never ran -- status unchanged
  });

  it('TS-5 (via canaryStop): flag ON but a non-canary session -- REJECTED, underlying verb never mutates the row', async () => {
    const sb = makeFakeSupabase({ sessions: [prodSession] });
    const result = await canaryStop('Alpha-5', { supabaseClient: sb, env: { FLEET_CANARY_KILL_ENABLED: 'true' } });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('not_canary_profile');
    expect(sb._store.get('s-prod').status).toBe('active'); // underlying stop() never ran -- status unchanged
  });

  it('flag ON + genuine canary session -- guard passes and delegates to the real spawn-control.js stop()', async () => {
    const sb = makeFakeSupabase({ sessions: [canarySession] });
    const result = await canaryStop('Canary-1', { supabaseClient: sb, env: { FLEET_CANARY_KILL_ENABLED: 'true' } });
    expect(result.ok).toBe(true);
    expect(sb._store.get('s-canary').status).toBe('released'); // real stop() ran
  });

  it('canaryRestart: flag ON but not a canary session -- rejected before restart()/spawn() ever runs', async () => {
    const sb = makeFakeSupabase({ sessions: [prodSession] });
    const result = await canaryRestart('Alpha-5', { supabaseClient: sb, env: { FLEET_CANARY_KILL_ENABLED: 'true' } });
    expect(result.ok).toBe(false);
    expect(result.guarded).toBe(true);
  });

  it('canaryRelaunchUnderProfile: flag ON but not a canary session -- rejected before relaunchUnderProfile() ever runs', async () => {
    const sb = makeFakeSupabase({ sessions: [prodSession] });
    const result = await canaryRelaunchUnderProfile('Alpha-5', 'someprofile', { supabaseClient: sb, env: { FLEET_CANARY_KILL_ENABLED: 'true' } });
    expect(result.ok).toBe(false);
    expect(result.guarded).toBe(true);
  });

  it('rejects a session with no account_profile metadata at all, even in canary-namespace callsign, when flag is on', async () => {
    const sb = makeFakeSupabase({ sessions: [noProfileSession] });
    const result = await canaryStop('Canary-2', { supabaseClient: sb, env: { FLEET_CANARY_KILL_ENABLED: 'true' } });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('not_canary_profile');
  });
});

// QF-20260724-295: self-stamp the respawned canary so CP3 target-scoped legs (which fail-closed require
// account_profile==='canary' + a Canary- callsign) resolve against the ACTIVE respawn rather than no-op.
describe('QF-20260724-295 stampRespawnedCanary + canaryRestart wiring', () => {
  const noSleep = () => Promise.resolve();

  it('(a) stamps account_profile=canary on the pid session, MERGING (never clobbering) existing metadata', async () => {
    // Respawn is unstamped: no account_profile, and its callsign is NOT yet in the canary namespace.
    const respawn = { session_id: 's-respawn', pid: 6980, status: 'active', metadata: { fleet_identity: { callsign: 'worker-tmp', color: 'red' }, role: 'worker' } };
    const sb = makeFakeSupabase({ sessions: [respawn] });
    const res = await stampRespawnedCanary(sb, { pid: 6980, callsign: 'Canary-1' }, { sleepFn: noSleep });
    expect(res.stamped).toBe(true);
    const md = sb._store.get('s-respawn').metadata;
    expect(md.account_profile).toBe('canary');              // stamped
    expect(md.fleet_identity.callsign).toBe('Canary-1');    // carried forward from the old canary
    expect(md.fleet_identity.color).toBe('red');            // merged, not clobbered
    expect(md.role).toBe('worker');                         // merged, not clobbered
  });

  it('VAL-CANHOST-01: stamps by the MINTED session id, not by the wt.exe launcher pid', async () => {
    // THE DISCRIMINATING FIXTURE. This was the THIRD dead correlation site and the only one FR-3 did
    // not reach, even though the PRD claimed all three were fixed — caught by PLAN_VERIFICATION.
    // Every OTHER fixture in this describe keys the row on the SAME pid the caller passes, so a pid
    // join and a session_id join are indistinguishable there and none of them could have caught it.
    // Here they DISAGREE, which is the real-world case: wt.exe exits, and claude_sessions.pid holds
    // the Claude Code pid (often null). A pid join finds nothing; the minted-id join stamps.
    const MINTED = '11111111-2222-4333-8444-555555555555';
    const respawn = { session_id: MINTED, pid: 999999, status: 'active', metadata: { role: 'worker' } };
    const sb = makeFakeSupabase({ sessions: [respawn] });
    const res = await stampRespawnedCanary(
      sb, { pid: 4242, callsign: 'Canary-1', sessionId: MINTED }, { sleepFn: noSleep, stampAttempts: 2 },
    );
    expect(res.stamped).toBe(true);
    expect(res.session_id).toBe(MINTED);
    const md = sb._store.get(MINTED).metadata;
    expect(md.account_profile).toBe('canary');
    expect(md.role).toBe('worker'); // merged, not clobbered
  });

  it('VAL-CANHOST-01: still falls back to pid when no session id was minted', async () => {
    // Back-compat: a caller that mints nothing must keep working exactly as before.
    const respawn = { session_id: 's-old', pid: 7777, status: 'active', metadata: {} };
    const sb = makeFakeSupabase({ sessions: [respawn] });
    const res = await stampRespawnedCanary(sb, { pid: 7777, callsign: 'Canary-1' }, { sleepFn: noSleep });
    expect(res.stamped).toBe(true);
    expect(res.session_id).toBe('s-old');
  });

  it('(b) is idempotent: an already-stamped canary is NOT re-written ({already:true}, no update call)', async () => {
    const respawn = { session_id: 's-c', pid: 42, status: 'active', metadata: { fleet_identity: { callsign: 'Canary-9' }, account_profile: 'canary', role: 'worker' } };
    const sb = makeFakeSupabase({ sessions: [respawn] });
    const before = sb._store.get('s-c').metadata;
    const res = await stampRespawnedCanary(sb, { pid: 42, callsign: 'Canary-9' }, { sleepFn: noSleep });
    expect(res).toEqual({ stamped: true, already: true, session_id: 's-c' });
    expect(sb._store.get('s-c').metadata).toBe(before);     // same reference => no write occurred
  });

  it('(c) fail-soft: returns {stamped:false,reason:respawn_not_registered} when the pid never registers', async () => {
    const sb = makeFakeSupabase({ sessions: [] });
    const res = await stampRespawnedCanary(sb, { pid: 999999, callsign: 'Canary-1' }, { sleepFn: noSleep, stampAttempts: 2 });
    expect(res).toEqual({ stamped: false, reason: 'respawn_not_registered' });
  });

  it('returns {stamped:false,reason:no_pid} when supabase/pid is missing (never throws)', async () => {
    expect(await stampRespawnedCanary(null, { pid: 1 })).toEqual({ stamped: false, reason: 'no_pid' });
    const sb = makeFakeSupabase({ sessions: [] });
    expect(await stampRespawnedCanary(sb, { pid: null })).toEqual({ stamped: false, reason: 'no_pid' });
  });

  it('(d) canaryRestart WIRES stampRespawnedCanary: a LIVE respawn stamps the new pid session, return value unchanged', async () => {
    const respawn = { session_id: 's-respawn', pid: 6980, status: 'active', metadata: { role: 'worker' } }; // unstamped respawn
    const sb = makeFakeSupabase({ sessions: [canarySession, respawn] });
    spawnControlRestartMock.mockResolvedValue({ ok: true, role: 'worker', spawnResult: { live: true, pid: 6980 } });
    const result = await canaryRestart('Canary-1', { supabaseClient: sb, env: { FLEET_CANARY_KILL_ENABLED: 'true' }, sleepFn: noSleep });
    expect(result).toEqual({ ok: true, role: 'worker', spawnResult: { live: true, pid: 6980 } }); // stamping is a side effect
    const md = sb._store.get('s-respawn').metadata;
    expect(md.account_profile).toBe('canary');
    expect(md.fleet_identity.callsign).toBe('Canary-1');    // carried forward from the released canary
  });

  it('(e) accepts the CP3 drill opts key: { supabase } (not { supabaseClient }) still resolves the guard + stamps the respawn', async () => {
    // start-cp3-drills.js calls the verbs with { supabase }; before QF-295 that left guardedVerb +
    // spawn-control with an undefined client so the guard could not resolve -> every leg no-op.
    const respawn = { session_id: 's-respawn2', pid: 7001, status: 'active', metadata: { role: 'worker' } };
    const sb = makeFakeSupabase({ sessions: [canarySession, respawn] });
    spawnControlRestartMock.mockResolvedValue({ ok: true, role: 'worker', spawnResult: { live: true, pid: 7001 } });
    const result = await canaryRestart('Canary-1', { supabase: sb, env: { FLEET_CANARY_KILL_ENABLED: 'true' }, sleepFn: noSleep });
    expect(result.ok).toBe(true);                            // guard resolved via opts.supabase (was undefined before)
    // spawn-control verb received the injected canonical key so it could resolve too
    expect(spawnControlRestartMock.mock.lastCall[1].supabaseClient).toBe(sb);
    const md = sb._store.get('s-respawn2').metadata;
    expect(md.account_profile).toBe('canary');               // respawn self-stamped
  });
});

// STRUCTURAL GUARD-INVOCATION PIN (TS-5e): every canary-guarded verb routes through guardedVerb --
// mirrors spawn-control.test.js's own FR-6 grep-pin / FR-9 payload-lock pattern, so a future canary
// verb added without routing through the guard fails this test, not silently ships unguarded.
describe('TS-5e structural pin: every canary verb is guarded', () => {
  it('canaryStop/canaryRestart/canaryRelaunchUnderProfile each delegate through guardedVerb()', () => {
    const src = readFileSync(new URL('../../../lib/fleet/canary-guard.js', import.meta.url), 'utf8');
    const exportedVerbBodies = src.split(/export async function canary/).slice(1);
    expect(exportedVerbBodies.length).toBe(3);
    for (const body of exportedVerbBodies) {
      expect(body).toMatch(/guardedVerb\(/);
    }
  });
});
