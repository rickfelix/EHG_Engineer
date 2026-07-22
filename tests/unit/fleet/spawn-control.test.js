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
// SD-LEO-INFRA-LEO-COMPLETION-001-C (G1a de-mask): spy on the REAL node:child_process.spawn so the
// default spawner closure in spawn-control.js:146-150 actually runs and its {detached:true,
// stdio:'ignore'} options can be asserted. The prior "live path" test injected opts.spawnFn, which
// short-circuited that closure -- its expect.any(Object) matched invocation.env, never the spawn
// options, so detached:true was never exercised (the test-masking G1a closes).
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, spawn: vi.fn() };
});

const {
  roleOf, isSingletonRole, resolveProfileDir, isLiveEnabled, buildLiveSpawnInvocation,
  spawn, attach, stop, restart, relaunchUnderProfile, drainAndRestart,
} = await import('../../../lib/fleet/spawn-control.js');
const { logCoordinationEvent } = await import('../../../lib/coordinator/coordination-events.cjs');
const { sequenceSingletonRefresh } = await import('../../../lib/coordinator/singleton-refresh-sequencer.cjs');
const { spawn: childProcessSpawnSpy } = await import('node:child_process');

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
    const helperNames = ['roleOf', 'isSingletonRole', 'resolveProfileDir', 'isLiveEnabled', 'buildLiveSpawnInvocation', 'resolveClaudeCmd', 'resolveRepoRoot'];
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

  it('live path exercises the REAL detached spawn: detached:true + stdio:ignore reach child_process.spawn and the child is unref\'d (G1a de-mask)', async () => {
    // DE-MASK: do NOT inject opts.spawnFn -- let the default spawner closure (spawn-control.js:146-150)
    // run so the real detached:true/stdio:'ignore' options reach node:child_process.spawn.
    const fakeChild = { pid: 4242, unref: vi.fn() };
    childProcessSpawnSpy.mockReset();
    childProcessSpawnSpy.mockReturnValue(fakeChild);
    const execFn = vi.fn().mockResolvedValue({ stdout: '131074' });
    const supabaseClient = makeFakeSupabase({ sessions: [] });
    const result = await spawn({ role: 'worker', callsign: 'Alpha-5' }, { live: true, execFn, sleepFn: vi.fn(), supabaseClient });
    // LOAD-BEARING: kill-survival depends on detached:true (OS re-parents the child when the
    // supervisor dies) + stdio:'ignore' (no inherited pipes tie it to the parent). Deleting
    // detached:true from spawn-control.js:147 makes THIS assertion fail (mutation-verified).
    expect(childProcessSpawnSpy).toHaveBeenCalledWith('wt.exe', expect.any(Array), expect.objectContaining({ detached: true, stdio: 'ignore' }));
    expect(fakeChild.unref).toHaveBeenCalled(); // unref'd so it outlives the parent
    expect(result.live).toBe(true);
    expect(result.handle).toBe(131074);
    expect(result.handleCaptureFailed).toBe(false);
  });

  it('ADVERSARIAL-REVIEW FIX: merges the captured handle into existing metadata, never overwrites the whole blob', async () => {
    const nowMs = 1_800_000_000_000;
    const child = { pid: 4242 };
    const spawnFn = vi.fn().mockReturnValue(child);
    const execFn = vi.fn().mockResolvedValue({ stdout: '131074' });
    const supabaseClient = makeFakeSupabase({
      sessions: [{
        session_id: 's1', pid: 4242, status: 'active',
        created_at: new Date(nowMs - 5_000).toISOString(), // freshly self-registered, well within the match window
        metadata: { fleet_identity: { callsign: 'Alpha-5' }, role: 'worker' },
      }],
    });
    await spawn({ role: 'worker', callsign: 'Beta-1' }, { live: true, spawnFn, execFn, sleepFn: vi.fn(), supabaseClient, nowMs, skipDedup: true });
    const merged = supabaseClient._store.get('s1').metadata;
    // Pre-existing keys survive the write (would be wiped by a bare full-blob overwrite).
    expect(merged.fleet_identity).toEqual({ callsign: 'Alpha-5' });
    expect(merged.role).toBe('worker');
    expect(merged.window_handle).toBe(131074);
    expect(merged.handle_capture_failed).toBe(false);
  });

  it('ADVERSARIAL-REVIEW FIX: never writes metadata for a stale/recycled pid match (created_at outside the freshness window)', async () => {
    const nowMs = 1_800_000_000_000;
    const child = { pid: 4242 };
    const spawnFn = vi.fn().mockReturnValue(child);
    const execFn = vi.fn().mockResolvedValue({ stdout: '131074' });
    const supabaseClient = makeFakeSupabase({
      sessions: [{
        session_id: 's-old', pid: 4242, status: 'active',
        created_at: new Date(nowMs - 60 * 60 * 1000).toISOString(), // an hour old -- a different, unrelated session that happens to share the recycled OS pid
        metadata: { fleet_identity: { callsign: 'Unrelated-Session' }, role: 'worker' },
      }],
    });
    await spawn({ role: 'worker', callsign: 'Beta-1' }, { live: true, spawnFn, execFn, sleepFn: vi.fn(), supabaseClient, nowMs, skipDedup: true });
    // Untouched -- the stale row's metadata must never be corrupted by a fresh spawn's recycled pid.
    expect(supabaseClient._store.get('s-old').metadata).toEqual({ fleet_identity: { callsign: 'Unrelated-Session' }, role: 'worker' });
  });

  it('FR-5: skips (never double-spawns) a callsign that already has a live session', async () => {
    const spawnFn = vi.fn();
    const supabaseClient = makeFakeSupabase({
      sessions: [{ session_id: 's1', status: 'active', metadata: { fleet_identity: { callsign: 'Alpha-5' } } }],
    });
    const result = await spawn({ role: 'worker', callsign: 'Alpha-5' }, { live: true, spawnFn, supabaseClient });
    expect(result.skipped).toBe(true);
    expect(spawnFn).not.toHaveBeenCalled();
  });

  it('FR-5: skipDedup:true (internal replacement path) bypasses the already-live check', async () => {
    const child = { pid: 4242 };
    const spawnFn = vi.fn().mockReturnValue(child);
    const execFn = vi.fn().mockResolvedValue({ stdout: '131074' });
    const supabaseClient = makeFakeSupabase({
      sessions: [{ session_id: 's1', status: 'active', metadata: { fleet_identity: { callsign: 'Alpha-5' } } }],
    });
    const result = await spawn({ role: 'worker', callsign: 'Alpha-5' }, { live: true, spawnFn, execFn, sleepFn: vi.fn(), supabaseClient, skipDedup: true });
    expect(result.skipped).toBeUndefined();
    expect(spawnFn).toHaveBeenCalled();
  });
});

describe('FR-9 SECURITY: event payload is hard-locked to {verb, outcome, at}', () => {
  it('never includes CLAUDE_CONFIG_DIR or any other field', async () => {
    logCoordinationEvent.mockClear();
    const supabaseClient = makeFakeSupabase({
      sessions: [{ session_id: 's1', status: 'active', metadata: { fleet_identity: { callsign: 'Alpha-5' } } }],
    });
    await stop('Alpha-5', { supabaseClient });
    expect(logCoordinationEvent).toHaveBeenCalled();
    const [, eventArg] = logCoordinationEvent.mock.calls.at(-1);
    expect(Object.keys(eventArg.payload).sort()).toEqual(['at', 'outcome', 'verb']);
    expect(JSON.stringify(eventArg.payload)).not.toContain('CLAUDE_CONFIG_DIR');
  });
});

describe('FR-6 grep-pin: drainAndRestart never touches the unrelated message-kind drain concept', () => {
  it('source contains no reference to drain-set-registry / role_drain_sets', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../../../lib/fleet/spawn-control.js', import.meta.url), 'utf8');
    expect(src).not.toMatch(/drain-set-registry|role_drain_sets/);
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

  it('worker path (ADVERSARIAL-REVIEW FIX): never releases the old session when the replacement did NOT actually spawn live (dry-run)', async () => {
    const supabaseClient = makeFakeSupabase({
      sessions: [{ session_id: 's1', status: 'active', metadata: { fleet_identity: { callsign: 'Alpha-5' }, role: 'worker' } }],
    });
    const result = await restart('Alpha-5', { supabaseClient, live: false });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('replacement_not_live');
    expect(result.role).toBe('worker');
    expect(sequenceSingletonRefresh).not.toHaveBeenCalled();
    // Old session must remain untouched -- releasing it here would drop a tracked worker with
    // no functioning replacement (the bug an adversarial review caught).
    expect(supabaseClient._store.get('s1').status).toBe('active');
  });

  it('worker path: releases the old session only once the replacement genuinely spawned live', async () => {
    const child = { pid: 4242 };
    const spawnFn = vi.fn().mockReturnValue(child);
    const execFn = vi.fn().mockResolvedValue({ stdout: '131074' });
    const supabaseClient = makeFakeSupabase({
      sessions: [{ session_id: 's1', status: 'active', metadata: { fleet_identity: { callsign: 'Alpha-5' }, role: 'worker' } }],
    });
    const result = await restart('Alpha-5', { supabaseClient, live: true, spawnFn, execFn, sleepFn: vi.fn() });
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

  it('isolates the account switch to the target session; sibling untouched (worker path, live spawn)', async () => {
    const child = { pid: 4343 };
    const spawnFn = vi.fn().mockReturnValue(child);
    const execFn = vi.fn().mockResolvedValue({ stdout: '131074' });
    const supabaseClient = makeFakeSupabase({
      sessions: [
        { session_id: 's1', status: 'active', metadata: { fleet_identity: { callsign: 'Alpha-5' }, role: 'worker' } },
        { session_id: 's2', status: 'active', metadata: { fleet_identity: { callsign: 'Alpha-6' }, role: 'worker' } },
      ],
    });
    const result = await relaunchUnderProfile('Alpha-5', 'account_b', { supabaseClient, baseDir: 'C:\\profiles', live: true, spawnFn, execFn, sleepFn: vi.fn() });
    expect(result.ok).toBe(true);
    expect(supabaseClient._store.get('s1').status).toBe('released');
    expect(supabaseClient._store.get('s2').status).toBe('active');
  });

  it('ADVERSARIAL-REVIEW FIX: never releases the old session when the replacement did not actually spawn live (dry-run)', async () => {
    const supabaseClient = makeFakeSupabase({
      sessions: [{ session_id: 's1', status: 'active', metadata: { fleet_identity: { callsign: 'Alpha-5' }, role: 'worker' } }],
    });
    const result = await relaunchUnderProfile('Alpha-5', 'account_b', { supabaseClient, baseDir: 'C:\\profiles', live: false });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('replacement_not_live');
    expect(supabaseClient._store.get('s1').status).toBe('active');
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
    const child = { pid: 5252 };
    const spawnFn = vi.fn().mockReturnValue(child);
    const execFn = vi.fn().mockResolvedValue({ stdout: '131074' });
    const result = await drainAndRestart('Alpha-5', { supabaseClient, nowMs, live: true, spawnFn, execFn, sleepFn: vi.fn() });
    expect(result.deferred).toBe(false);
    expect(result.verdict).toBe('PASS');
    expect(supabaseClient._store.get('s1').status).toBe('released');
  });

  it('ADVERSARIAL-REVIEW FIX: PASS verdict alone does not release the session if the replacement never actually spawned live', async () => {
    const nowMs = 1_800_000_000_000;
    const supabaseClient = makeBoundarySupabase({
      sessionRow: {
        session_id: 's1', status: 'active',
        metadata: { fleet_identity: { callsign: 'Alpha-5' }, role: 'worker' },
        claimed_at: new Date(nowMs - 60 * 1000).toISOString(),
        last_tool_at: new Date(nowMs - 30 * 1000).toISOString(),
      },
    });
    const result = await drainAndRestart('Alpha-5', { supabaseClient, nowMs, live: false });
    expect(result.verdict).toBe('PASS');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('replacement_not_live');
    expect(supabaseClient._store.get('s1').status).toBe('active');
  });
});
