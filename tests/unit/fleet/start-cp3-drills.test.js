// SD-LEO-INFRA-LEO-APP-LAUNCHER-001 (FR-4) — worker-startable CP3 drill starter.
import { describe, it, expect, vi } from 'vitest';
import { planDrills, main, defaultRunDrills } from '../../../scripts/fleet/start-cp3-drills.js';
import { LaunchResolveError } from '../../../lib/fleet/build-session-launch.cjs';

const OKENV = { FLEET_ACCOUNT_PROFILES_DIR: 'C:\\fleet\\profiles' };

describe('planDrills — fail-loud precondition + leg plan', () => {
  it('lists the 3 S4-S6 legs with their fleet_verb_* targets when the canary resolves', () => {
    const plan = planDrills({ live: false }, { env: OKENV });
    expect(plan.legs).toHaveLength(3);
    expect(plan.legs.map((l) => l.verb)).toEqual(['fleet_verb_restart', 'fleet_verb_respawn', 'fleet_verb_relaunch_under_profile']);
    expect(plan.canaryProfileDir).toBe('C:\\fleet\\profiles\\canary');
  });
  it('FAILS LOUD when the canary profile cannot resolve (no FLEET_ACCOUNT_PROFILES_DIR)', () => {
    expect(() => planDrills({}, { env: {} })).toThrow(LaunchResolveError);
  });
});

describe('main — worker-startable, dry-run default', () => {
  it('--dry-run (default) lists the legs and spawns/kills NOTHING', async () => {
    const logs = [];
    const r = await main([], { env: OKENV, log: (m) => logs.push(m), runDrills: () => { throw new Error('must not run live in dry-run'); } });
    expect(r.ok).toBe(true);
    expect(r.live).toBe(false);
    expect(r.legs).toHaveLength(3);
    expect(logs.join('\n')).toMatch(/DRY-RUN/);
  });
  it('returns ok:false (fail-loud) when the canary precondition is unmet', async () => {
    const r = await main([], { env: {}, log: () => {} });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/FLEET_ACCOUNT_PROFILES_DIR/);
  });
  it('--live delegates to the (injected) drill runners without the unit spawning', async () => {
    const runDrills = vi.fn(async () => ({ reboot: { ok: true }, u4: { ok: true } }));
    const r = await main(['--live'], { env: OKENV, log: () => {}, runDrills });
    expect(r.ok).toBe(true);
    expect(r.live).toBe(true);
    expect(runDrills).toHaveBeenCalledTimes(1);
  });
});

// QF-20260724-923: the live path must WIRE all 3 legs to emit real fleet_verb_* evidence (was a stub).
describe('defaultRunDrills — wired live path (QF-20260724-923)', () => {
  it('uses a real supabase client, resolves the canary, and calls all 3 legs with the required args', async () => {
    const supabase = { from: vi.fn() };
    const target = { session_id: 'canary-sess-1', metadata: { account_profile: 'canary' } };
    const resolveCanaryTarget = vi.fn(async () => target);
    const canaryRestart = vi.fn(async () => ({ verb: 'fleet_verb_restart', outcome: 'ok' }));
    const canaryRelaunchUnderProfile = vi.fn(async () => ({ verb: 'fleet_verb_relaunch_under_profile', outcome: 'ok' }));
    const runRebootRespawnDrill = vi.fn(async () => ({ pass: true }));
    const runU4Drill = vi.fn(async () => ({ pass: true }));

    const plan = { canaryProfile: 'canary', cwd: 'R:\\r', legs: [] };
    const res = await defaultRunDrills(plan, {
      supabase, resolveCanaryTarget, canaryRestart, canaryRelaunchUnderProfile, runRebootRespawnDrill, runU4Drill,
    });

    // supabase is NOT null (was the stub bug); canary resolved.
    expect(resolveCanaryTarget).toHaveBeenCalledWith(supabase, { by: 'account_profile', value: 'canary' });
    // G1a kill-supervisor -> fleet_verb_restart.
    expect(canaryRestart).toHaveBeenCalledWith(target, { supabase });
    // G1b+G2 reboot-respawn gets a REAL client + live:true (was supabase=null).
    expect(runRebootRespawnDrill).toHaveBeenCalledWith({ supabase, live: true });
    // G3+U4 gets the REQUIRED args (was only {opts:{}} -> no-op): target, sessionId, relaunchFn, resolveFn, queryEventsFn.
    const u4Args = runU4Drill.mock.calls[0][0];
    expect(u4Args.target).toBe(target);
    expect(u4Args.sessionId).toBe('canary-sess-1');
    expect(u4Args.toProfile).toBe('canary');
    expect(typeof u4Args.relaunchFn).toBe('function');
    expect(typeof u4Args.resolveFn).toBe('function');
    expect(typeof u4Args.queryEventsFn).toBe('function');
    expect(res).toMatchObject({ g1a: expect.anything(), reboot: expect.anything(), u4: expect.anything() });
  });
});
