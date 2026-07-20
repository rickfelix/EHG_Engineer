/**
 * SD-LEO-INFRA-FLEET-SPAWN-CONTROL-001 -- six-verb control API (TS-1..TS-10 unit-testable subset).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/coordinator/coordination-events.cjs', () => ({
  logCoordinationEvent: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock('../../../lib/coordinator/singleton-refresh-sequencer.cjs', () => ({
  sequenceSingletonRefresh: vi.fn(),
}));

const {
  roleOf, isSingletonRole, resolveProfileDir, isLiveEnabled, buildLiveSpawnInvocation,
  spawn, attach, stop, restart, relaunchUnderProfile, drainAndRestart,
} = await import('../../../lib/fleet/spawn-control.js');
const { sequenceSingletonRefresh } = await import('../../../lib/coordinator/singleton-refresh-sequencer.cjs');

/** Minimal in-memory fake covering exactly the claude_sessions/session_coordination shapes spawn-control.js touches. */
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

describe('module surface (TS-10: exactly six named verbs, no more)', () => {
  it('exports exactly {spawn, attach, stop, restart, relaunchUnderProfile, drainAndRestart} as the verb set', async () => {
    const mod = await import('../../../lib/fleet/spawn-control.js');
    const verbNames = ['spawn', 'attach', 'stop', 'restart', 'relaunchUnderProfile', 'drainAndRestart'];
    for (const name of verbNames) expect(typeof mod[name]).toBe('function');
    // Every OTHER export must be a helper, never an undocumented 7th verb.
    const helperNames = ['roleOf', 'isSingletonRole', 'resolveProfileDir', 'isLiveEnabled', 'buildLiveSpawnInvocation'];
    const unexpected = Object.keys(mod).filter((k) => !verbNames.includes(k) && !helperNames.includes(k));
    expect(unexpected).toEqual([]);
  });
});

describe('FR-10: SD-E watchdog AUTH-LOST remediation names a real spawn-control verb (TS-9)', () => {
  it('resolves to relaunchUnderProfile, not a dangling verb-name reference', async () => {
    const { classifyWatchdogState } = await import('../../../lib/fleet/session-watchdog.js');
    const nowMs = 1_800_000_000_000;
    const result = classifyWatchdogState(
      { session_id: 's1', heartbeat_at: new Date(nowMs - 60 * 60 * 1000).toISOString() },
      { nowMs, staleThresholdMs: 5 * 60 * 1000, isPidAlive: () => true },
    );
    expect(result.state).toBe('AUTH-LOST');
    expect(result.remediation).toMatch(/relaunch-under-profile/);
    expect(result.remediation).toMatch(/relaunchUnderProfile\(\)/);
    expect(typeof relaunchUnderProfile).toBe('function');
  });
});

describe('roleOf / isSingletonRole', () => {
  it('derives coordinator from is_coordinator metadata', () => {
    expect(roleOf({ metadata: { is_coordinator: 'true' } })).toBe('coordinator');
  });
  it('derives adam/solomon from metadata.role', () => {
    expect(roleOf({ metadata: { role: 'adam' } })).toBe('adam');
    expect(roleOf({ metadata: { role: 'solomon' } })).toBe('solomon');
  });
  it('defaults to worker', () => {
    expect(roleOf({ metadata: {} })).toBe('worker');
    expect(roleOf(null)).toBe('worker');
  });
  it('isSingletonRole is true only for coordinator/adam/solomon', () => {
    expect(isSingletonRole('coordinator')).toBe(true);
    expect(isSingletonRole('adam')).toBe(true);
    expect(isSingletonRole('solomon')).toBe(true);
    expect(isSingletonRole('worker')).toBe(false);
  });
});

describe('resolveProfileDir (TR-5 SECURITY: allowlist, no traversal)', () => {
  it('resolves a bare alnum/dash/underscore name under the configured base dir', () => {
    const dir = resolveProfileDir('account_b-2', { baseDir: 'C:\\profiles' });
    expect(dir).toBe('C:\\profiles\\account_b-2');
  });
  it('rejects a traversal attempt', () => {
    expect(() => resolveProfileDir('../../etc/passwd', { baseDir: 'C:\\profiles' })).toThrow(/invalid profile name/);
  });
  it('rejects an absolute path supplied as the profile name', () => {
    expect(() => resolveProfileDir('C:\\Windows\\System32', { baseDir: 'C:\\profiles' })).toThrow(/invalid profile name/);
  });
  it('throws if no base dir is configured', () => {
    expect(() => resolveProfileDir('account_b', {})).toThrow(/FLEET_ACCOUNT_PROFILES_DIR/);
  });
});

describe('isLiveEnabled (TR-4: default-off)', () => {
  it('is false by default', () => expect(isLiveEnabled({})).toBe(false));
  it('is true only for the literal string "true"', () => {
    expect(isLiveEnabled({ FLEET_SPAWN_CONTROL_LIVE: 'true' })).toBe(true);
    expect(isLiveEnabled({ FLEET_SPAWN_CONTROL_LIVE: 'TRUE' })).toBe(true);
    expect(isLiveEnabled({ FLEET_SPAWN_CONTROL_LIVE: 'yes' })).toBe(false);
  });
});

describe('buildLiveSpawnInvocation (FR-7: env isolation)', () => {
  it('injects CLAUDE_CONFIG_DIR only into the returned env object, never touching process.env', () => {
    const before = process.env.CLAUDE_CONFIG_DIR;
    const invocation = buildLiveSpawnInvocation({ role: 'worker', callsign: 'Alpha-5', profileDir: '/profiles/b' });
    expect(invocation.env.CLAUDE_CONFIG_DIR).toBe('/profiles/b');
    expect(process.env.CLAUDE_CONFIG_DIR).toBe(before);
  });
  it('omits CLAUDE_CONFIG_DIR when no profileDir is given', () => {
    const invocation = buildLiveSpawnInvocation({ role: 'worker', callsign: 'Alpha-5' });
    expect(invocation.env.CLAUDE_CONFIG_DIR).toBeUndefined();
  });
});

describe('spawn (FR-1)', () => {
  it('dry-run path (live=false) never spawns and logs the invocation', async () => {
    const spawnFn = vi.fn();
    const result = await spawn({ role: 'worker', callsign: 'Alpha-5' }, { live: false, spawnFn });
    expect(result.live).toBe(false);
    expect(spawnFn).not.toHaveBeenCalled();
  });

  it('live path spawns detached and captures the window handle', async () => {
    const child = { pid: 4242 };
    const spawnFn = vi.fn().mockReturnValue(child);
    const execFn = vi.fn().mockResolvedValue({ stdout: '131074' });
    const supabaseClient = makeFakeSupabase({ sessions: [] });
    const result = await spawn({ role: 'worker', callsign: 'Alpha-5' }, { live: true, spawnFn, execFn, sleepFn: vi.fn(), supabaseClient });
    expect(spawnFn).toHaveBeenCalledWith('wt.exe', expect.any(Array), expect.any(Object));
    expect(result.live).toBe(true);
    expect(result.handle).toBe(131074);
    expect(result.handleCaptureFailed).toBe(false);
  });
});

describe('attach (FR-3)', () => {
  it('focuses the captured window handle for a resolved session', async () => {
    const supabaseClient = makeFakeSupabase({
      sessions: [{ session_id: 's1', status: 'active', metadata: { fleet_identity: { callsign: 'Alpha-5' }, window_handle: 131074 } }],
    });
    const execFn = vi.fn().mockResolvedValue({ stdout: '' });
    const result = await attach('Alpha-5', { supabaseClient, execFn });
    expect(result.ok).toBe(true);
  });

  it('reports a clear degraded state for a session with no captured handle (FR-1 honesty preserved)', async () => {
    const supabaseClient = makeFakeSupabase({
      sessions: [{ session_id: 's1', status: 'active', metadata: { fleet_identity: { callsign: 'Alpha-5' } } }],
    });
    const result = await attach('Alpha-5', { supabaseClient });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no_captured_handle');
  });

  it('reports not_found for an unresolvable card', async () => {
    const supabaseClient = makeFakeSupabase({ sessions: [] });
    const result = await attach('Ghost-1', { supabaseClient });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('not_found');
  });
});

describe('stop', () => {
  it('marks the resolved session released', async () => {
    const supabaseClient = makeFakeSupabase({
      sessions: [{ session_id: 's1', status: 'active', metadata: { fleet_identity: { callsign: 'Alpha-5' } } }],
    });
    const result = await stop('Alpha-5', { supabaseClient });
    expect(result.ok).toBe(true);
    expect(supabaseClient._store.get('s1').status).toBe('released');
    expect(supabaseClient._store.get('s1').released_reason).toBe('manual_stop');
  });
});

describe('restart (FR-4 singleton-serial / FR-5 worker-parallel)', () => {
  beforeEach(() => { sequenceSingletonRefresh.mockReset(); });

  it('worker path: releases the old session and spawns a replacement without the singleton sequencer', async () => {
    const supabaseClient = makeFakeSupabase({
      sessions: [{ session_id: 's1', status: 'active', metadata: { fleet_identity: { callsign: 'Alpha-5' }, role: 'worker' } }],
    });
    const result = await restart('Alpha-5', { supabaseClient, live: false });
    expect(result.ok).toBe(true);
    expect(result.role).toBe('worker');
    expect(sequenceSingletonRefresh).not.toHaveBeenCalled();
    expect(supabaseClient._store.get('s1').status).toBe('released');
  });

  it('singleton path defers until a newSessionId is supplied (never a bespoke retire-first sequence)', async () => {
    const supabaseClient = makeFakeSupabase({
      sessions: [{ session_id: 's1', status: 'active', metadata: { role: 'coordinator', is_coordinator: 'true' } }],
    });
    const result = await restart('s1', { supabaseClient, live: false, by: 'session_id' });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('awaiting_new_session_registration');
    expect(sequenceSingletonRefresh).not.toHaveBeenCalled();
    // old session must NOT be retired without the health-gated sequencer
    expect(supabaseClient._store.get('s1').status).toBe('active');
  });

  it('singleton path with newSessionId calls the EXISTING register-then-retire mutex, never a bespoke one', async () => {
    sequenceSingletonRefresh.mockResolvedValue({ action: 'retire_old', retired: true });
    const supabaseClient = makeFakeSupabase({
      sessions: [{ session_id: 's1', status: 'active', metadata: { role: 'coordinator', is_coordinator: 'true' } }],
    });
    const result = await restart('s1', { supabaseClient, live: false, by: 'session_id', newSessionId: 's2' });
    expect(sequenceSingletonRefresh).toHaveBeenCalledWith(supabaseClient, { newSessionId: 's2', oldSessionId: 's1' });
    expect(result.ok).toBe(true);
  });
});

describe('relaunchUnderProfile (FR-7)', () => {
  beforeEach(() => { sequenceSingletonRefresh.mockReset(); });

  it('rejects an invalid/traversal profile BEFORE touching the database', async () => {
    const dbTouch = vi.fn();
    const supabaseClient = { from: dbTouch };
    await expect(relaunchUnderProfile('Alpha-5', '../../etc/passwd', { supabaseClient, baseDir: 'C:\\profiles' }))
      .rejects.toThrow(/invalid profile name/);
    expect(dbTouch).not.toHaveBeenCalled();
  });

  it('isolates the account switch to the target session; sibling untouched (worker path)', async () => {
    const supabaseClient = makeFakeSupabase({
      sessions: [
        { session_id: 's1', status: 'active', metadata: { fleet_identity: { callsign: 'Alpha-5' }, role: 'worker' } },
        { session_id: 's2', status: 'active', metadata: { fleet_identity: { callsign: 'Alpha-6' }, role: 'worker' } },
      ],
    });
    const result = await relaunchUnderProfile('Alpha-5', 'account_b', { supabaseClient, baseDir: 'C:\\profiles', live: false });
    expect(result.ok).toBe(true);
    expect(supabaseClient._store.get('s1').status).toBe('released');
    expect(supabaseClient._store.get('s2').status).toBe('active');
  });

  it('throws if the supervisor process.env.CLAUDE_CONFIG_DIR is mutated during the call (isolation invariant)', async () => {
    const supabaseClient = makeFakeSupabase({
      sessions: [{ session_id: 's1', status: 'active', metadata: { fleet_identity: { callsign: 'Alpha-5' }, role: 'worker' } }],
    });
    const spawnFn = vi.fn().mockImplementation(() => {
      process.env.CLAUDE_CONFIG_DIR = '/tampered'; // simulate a hypothetical regression
      return { pid: 999 };
    });
    await expect(relaunchUnderProfile('Alpha-5', 'account_b', { supabaseClient, baseDir: 'C:\\profiles', live: true, spawnFn, execFn: vi.fn().mockResolvedValue({ stdout: '0' }), sleepFn: vi.fn() }))
      .rejects.toThrow(/isolation invariant violated/);
    delete process.env.CLAUDE_CONFIG_DIR;
  });
});

describe('drainAndRestart (FR-6: never restarts mid-claim)', () => {
  function makeBoundarySupabase({ sessionRow, outboundCount = 0 }) {
    const sessions = [sessionRow];
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
              return { eq: (col, val) => { const row = [...store.values()].find((s) => s[col] === val); if (row) Object.assign(row, patch); return Promise.resolve({ error: null }); } };
            },
          };
        }
        if (table === 'session_coordination') {
          return { select: () => ({ eq: () => ({ gte: async () => ({ count: outboundCount }) }) }) };
        }
        throw new Error(`unexpected table: ${table}`);
      },
    };
  }

  it('defers (never restarts) when the boundary probe verdict is MISS (mid-claim)', async () => {
    const nowMs = 1_800_000_000_000;
    const supabaseClient = makeBoundarySupabase({
      sessionRow: {
        session_id: 's1', status: 'active',
        metadata: { fleet_identity: { callsign: 'Alpha-5' }, role: 'worker' },
        claimed_at: new Date(nowMs - 20 * 60 * 1000).toISOString(),
        // Within the boundary-grace neighborhood of the anchor (not "progressed past boundary"),
        // window already elapsed, zero outbound -> the genuine freeze signature (MISS).
        last_tool_at: new Date(nowMs - 19 * 60 * 1000).toISOString(),
      },
      outboundCount: 0,
    });
    const result = await drainAndRestart('Alpha-5', { supabaseClient, nowMs, live: false });
    expect(result.ok).toBe(false);
    expect(result.deferred).toBe(true);
    expect(result.verdict).toBe('MISS');
    expect(supabaseClient._store.get('s1').status).toBe('active');
  });

  it('proceeds to restart once the probe returns PASS (genuinely idle)', async () => {
    const nowMs = 1_800_000_000_000;
    const supabaseClient = makeBoundarySupabase({
      sessionRow: {
        session_id: 's1', status: 'active',
        metadata: { fleet_identity: { callsign: 'Alpha-5' }, role: 'worker' },
        claimed_at: new Date(nowMs - 60 * 1000).toISOString(), // within the probe window -> PASS (window_not_elapsed)
        last_tool_at: new Date(nowMs - 30 * 1000).toISOString(),
      },
    });
    const result = await drainAndRestart('Alpha-5', { supabaseClient, nowMs, live: false });
    expect(result.deferred).toBe(false);
    expect(result.verdict).toBe('PASS');
    expect(supabaseClient._store.get('s1').status).toBe('released');
  });
});
