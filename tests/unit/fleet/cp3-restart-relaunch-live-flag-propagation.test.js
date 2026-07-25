/**
 * QF-20260724-499 -- discriminating, non-mockable acceptance test for the restart/relaunch live-flag
 * propagation fix. Uses the REAL canaryRestart/canaryRelaunchUnderProfile (lib/fleet/canary-guard.js)
 * and the REAL restart()/relaunchUnderProfile()/spawn() (lib/fleet/spawn-control.js) -- only the OS-level
 * spawn (node:child_process) and DB (in-memory fake, same shape as spawn-control.test.js) are stubbed.
 *
 * Root cause (Solomon-confirmed): scripts/fleet/start-cp3-drills.js's defaultRunDrills() passed
 * live:true explicitly to the reboot leg but NOT to the restart/relaunch legs, which fall through to
 * spawn-control.js's isLiveEnabled() (FLEET_SPAWN_CONTROL_LIVE env read) -- OFF in the drill process
 * even during a genuine --live run, forcing spawnReplacement() into dry-run and an unconditional
 * replacement_not_live outcome. The fix threads opts.live:true explicitly, mirroring the reboot leg.
 *
 * A test that stubs canaryRestart/canaryRelaunchUnderProfile/restart/relaunchUnderProfile would pass
 * even with the bug in place (it never exercises the real isLiveEnabled() fallback) -- this suite
 * deliberately keeps every layer real so the flag-propagation gap is genuinely exercised.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../lib/coordinator/coordination-events.cjs', () => ({
  logCoordinationEvent: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock('../../../lib/coordinator/singleton-refresh-sequencer.cjs', () => ({
  sequenceSingletonRefresh: vi.fn(),
}));

const { canaryRestart, canaryRelaunchUnderProfile } = await import('../../../lib/fleet/canary-guard.js');

/** Same in-memory fake shape as spawn-control.test.js / canary-guard.test.js. */
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

const canaryWorker = {
  session_id: 's-canary-worker', status: 'active',
  metadata: { fleet_identity: { callsign: 'Canary-Alpha-1' }, account_profile: 'canary', role: 'worker' },
};

// Guard flag ON (canary-kill enabled) but FLEET_SPAWN_CONTROL_LIVE deliberately absent from `env` --
// this reproduces the exact real-world condition (drill process without the env var exported).
const GUARD_ENV = { FLEET_CANARY_KILL_ENABLED: 'true' };

describe('QF-20260724-499: restart/relaunch honor an explicit opts.live even when FLEET_SPAWN_CONTROL_LIVE is unset', () => {
  it('canaryRestart: opts.live:true (the fix) makes a REAL replacement spawn live, even with the env flag off', async () => {
    const child = { pid: 7001 };
    const spawnFn = vi.fn().mockReturnValue(child);
    const execFn = vi.fn().mockResolvedValue({ stdout: '131074' });
    const supabase = makeFakeSupabase({ sessions: [canaryWorker] });

    const result = await canaryRestart('Canary-Alpha-1', {
      supabase, by: 'callsign', env: GUARD_ENV, live: true, spawnFn, execFn, sleepFn: vi.fn(),
    });

    expect(result.ok).toBe(true);
    expect(result.spawnResult.live).toBe(true);
    expect(spawnFn).toHaveBeenCalled();
    expect(supabase._store.get('s-canary-worker').status).toBe('released');
  });

  it('canaryRestart: WITHOUT opts.live (pre-fix call shape), the same real chain honestly reports replacement_not_live -- reproduces the exact production bug', async () => {
    const spawnFn = vi.fn().mockReturnValue({ pid: 7002 });
    const execFn = vi.fn().mockResolvedValue({ stdout: '0' });
    const supabase = makeFakeSupabase({ sessions: [{ ...canaryWorker, session_id: 's-canary-worker-2' }] });

    const result = await canaryRestart('Canary-Alpha-1', {
      supabase, by: 'callsign', env: GUARD_ENV, spawnFn, execFn, sleepFn: vi.fn(),
    });

    expect(spawnFn).not.toHaveBeenCalled(); // dry-run: opts.live undefined -> isLiveEnabled() (env unset) -> false
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('replacement_not_live');
    expect(supabase._store.get('s-canary-worker-2').status).toBe('active'); // never released without a live replacement
  });

  it('canaryRelaunchUnderProfile: opts.live:true (the fix) makes a REAL replacement spawn live, even with the env flag off', async () => {
    const child = { pid: 7003 };
    const spawnFn = vi.fn().mockReturnValue(child);
    const execFn = vi.fn().mockResolvedValue({ stdout: '131074' });
    const supabase = makeFakeSupabase({ sessions: [{ ...canaryWorker, session_id: 's-canary-worker-3' }] });

    const result = await canaryRelaunchUnderProfile('Canary-Alpha-1', 'canary', {
      supabase, by: 'callsign', env: GUARD_ENV, baseDir: 'C:\\profiles', live: true, spawnFn, execFn, sleepFn: vi.fn(),
    });

    expect(result.ok).toBe(true);
    expect(result.spawnResult.live).toBe(true);
    expect(supabase._store.get('s-canary-worker-3').status).toBe('released');
  });

  it('canaryRelaunchUnderProfile: WITHOUT opts.live (pre-fix call shape), honestly reports replacement_not_live', async () => {
    const spawnFn = vi.fn().mockReturnValue({ pid: 7004 });
    const execFn = vi.fn().mockResolvedValue({ stdout: '0' });
    const supabase = makeFakeSupabase({ sessions: [{ ...canaryWorker, session_id: 's-canary-worker-4' }] });

    const result = await canaryRelaunchUnderProfile('Canary-Alpha-1', 'canary', {
      supabase, by: 'callsign', env: GUARD_ENV, baseDir: 'C:\\profiles', spawnFn, execFn, sleepFn: vi.fn(),
    });

    expect(spawnFn).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('replacement_not_live');
    expect(supabase._store.get('s-canary-worker-4').status).toBe('active');
  });

  it('canary-guard fail-closed gate is NOT weakened by the fix: a non-canary target is still rejected even with opts.live:true', async () => {
    const spawnFn = vi.fn();
    const supabase = makeFakeSupabase({
      sessions: [{ session_id: 's-prod', status: 'active', metadata: { fleet_identity: { callsign: 'Alpha-5' }, account_profile: 'default', role: 'worker' } }],
    });

    const result = await canaryRestart('Alpha-5', { supabase, by: 'callsign', env: GUARD_ENV, live: true, spawnFn });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('not_canary_profile');
    expect(spawnFn).not.toHaveBeenCalled();
  });
});
