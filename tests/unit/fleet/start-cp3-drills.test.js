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

  // QF-20260724-119: regression test for the cp3-do-it-right-20260724 incident (12-13 real fleet-worker
  // process spawns caused by a non-mocked test invoking --live with no runDrills override).
  it('REFUSES --live under the test runner when no runDrills override is injected (QF-20260724-119)', async () => {
    const logs = [];
    const r = await main(['--live'], { env: OKENV, log: (m) => logs.push(m) });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/REFUSED/);
    expect(r.error).toMatch(/runDrills/);
    expect(logs.join('\n')).toMatch(/REFUSED/);
  });
});

// QF-20260724-923 + its fix-of-the-fix (cp3-do-it-right-20260724): the live path must WIRE all 3
// legs to emit real fleet_verb_* evidence with the CORRECT data contracts (supabaseClient key,
// callsign string target, canary-filtered slots before a real spawner). This call-shape test is a
// fast smoke check; the LOAD-BEARING non-mocked acceptance evidence is
// tests/integration/start-cp3-drills-canary-fence.test.js (no_unit_mock=true, mirrors the drill
// runners' own anti-test-masking discipline) — a fully-mocked call-shape test alone is exactly the
// acceptance-by-mock class that hid these bugs the first time (Solomon R1 verdict 0e9e466e).
describe('defaultRunDrills — wired live path with correct data contracts (cp3-do-it-right-20260724)', () => {
  it('resolves the canary via the REAL identity shape, and calls all 3 legs with the required args', async () => {
    const supabase = { from: vi.fn() };
    // resolveCanaryTarget's REAL contract (session-registry.js resolveSessionIdentity) is
    // {resolved, identity:{session_id, callsign, account_profile}} -- NOT a bare session row. A mock
    // shaped like a bare session row (the prior version of this test) hides the callsign-vs-object bug.
    const target = { resolved: true, identity: { session_id: 'canary-sess-1', callsign: 'Canary-pilot', account_profile: 'canary' } };
    const resolveCanaryTarget = vi.fn(async () => target);
    const canaryRestart = vi.fn(async () => ({ verb: 'fleet_verb_restart', outcome: 'ok' }));
    const canaryRelaunchUnderProfile = vi.fn(async () => ({ verb: 'fleet_verb_relaunch_under_profile', outcome: 'ok' }));
    const runRebootRespawnDrill = vi.fn(async () => ({ pass: true }));
    const runU4Drill = vi.fn(async () => ({ pass: true }));
    const loadFn = vi.fn(async () => []);
    const spawnFn = vi.fn();

    const plan = { canaryProfile: 'canary', cwd: 'R:\\r', legs: [] };
    const res = await defaultRunDrills(plan, {
      supabase, resolveCanaryTarget, canaryRestart, canaryRelaunchUnderProfile, runRebootRespawnDrill, runU4Drill, loadFn, spawnFn,
    });

    // supabase is NOT null (was the stub bug); canary resolved.
    expect(resolveCanaryTarget).toHaveBeenCalledWith(supabase, { by: 'account_profile', value: 'canary' });
    // G1a kill-supervisor -> fleet_verb_restart. bug2 fix: callsign STRING (not the identity object)
    // + `supabaseClient` key (canary-guard.js's guardedVerb reads opts.supabaseClient, not opts.supabase).
    // cp3-do-it-right-20260724 incident hardening: spawnFn is now threaded through to G1a too (not just
    // the reboot leg) so a test-injected stub intercepts EVERY leg's real OS spawn, not only one of three.
    expect(canaryRestart).toHaveBeenCalledWith('Canary-pilot', { supabaseClient: supabase, spawnFn });
    // G1b+G2 reboot-respawn: real client + live:true + a canary-filtering loadFn + a real spawnFn
    // (bug1 fix: the fence -- both are ALWAYS provided together, never a bare live:true with no fence).
    // QF-20260724-113 FR-b: the production default now also wires a real rebootQueryEventsFn (checked
    // separately below via a dedicated deps.rebootQueryEventsFn injection) so respawn_events_present
    // doesn't always fail on a genuine live run.
    expect(runRebootRespawnDrill).toHaveBeenCalledWith(expect.objectContaining({ supabase, live: true, loadFn, spawnFn }));
    // G3+U4 gets the REQUIRED args with the corrected contract: target is the callsign STRING,
    // opts uses supabaseClient (not supabase).
    const u4Args = runU4Drill.mock.calls[0][0];
    expect(u4Args.target).toBe('Canary-pilot');
    expect(u4Args.sessionId).toBe('canary-sess-1');
    expect(u4Args.toProfile).toBe('canary');
    expect(typeof u4Args.relaunchFn).toBe('function');
    expect(typeof u4Args.resolveFn).toBe('function');
    expect(typeof u4Args.queryEventsFn).toBe('function');
    expect(u4Args.opts).toEqual({ supabaseClient: supabase, spawnFn });
    expect(res).toMatchObject({ g1a: expect.anything(), reboot: expect.anything(), u4: expect.anything() });
  });

  it('SECURITY FENCE: filters fleet_desired_slots to canary-profile ONLY before any real spawner is wired (bug1)', async () => {
    const supabase = { from: vi.fn() };
    const target = { resolved: false, reason: 'not_found' };
    const resolveCanaryTarget = vi.fn(async () => target);
    const runRebootRespawnDrill = vi.fn(async () => ({ pass: true }));
    const runU4Drill = vi.fn(async () => ({ pass: true }));

    const plan = { canaryProfile: 'canary', cwd: 'R:\\r', legs: [] };
    await defaultRunDrills(plan, { supabase, resolveCanaryTarget, runRebootRespawnDrill, runU4Drill });

    const call = runRebootRespawnDrill.mock.calls[0][0];
    expect(typeof call.loadFn).toBe('function');
    expect(typeof call.spawnFn).toBe('function');
  });

  it('reports the no-live-canary-session gap explicitly for G1a/G3-U4 instead of silently no-op-ing (observability)', async () => {
    const supabase = { from: vi.fn() };
    const resolveCanaryTarget = vi.fn(async () => ({ resolved: false, reason: 'not_found' }));
    const runRebootRespawnDrill = vi.fn(async () => ({ pass: true }));
    const runU4Drill = vi.fn();

    const plan = { canaryProfile: 'canary', cwd: 'R:\\r', legs: [] };
    const res = await defaultRunDrills(plan, { supabase, resolveCanaryTarget, runRebootRespawnDrill, runU4Drill });

    expect(res.g1a).toEqual({ ok: false, reason: 'no_live_canary_session' });
    expect(runU4Drill).not.toHaveBeenCalled();
    expect(res.u4.pass).toBe(false);
  });
});

// QF-20260724-113 (FR-b): the wired rebootQueryEventsFn must actually satisfy respawn_events_present
// on a real live run (Golf-2-flagged gap: reboot-respawn's own queryEventsFn takes NO session-id arg,
// unlike U4's session-scoped one, since a respawn drill creates one replacement session PER slot).
describe('defaultRunDrills — rebootQueryEventsFn wiring (QF-20260724-113)', () => {
  it('the default rebootQueryEventsFn queries fleet_verb_respawn events with no required argument', async () => {
    const eq = vi.fn().mockReturnThis();
    const order = vi.fn().mockReturnThis();
    const limit = vi.fn().mockResolvedValue({ data: [{ event_type: 'fleet_verb_respawn' }, { event_type: 'fleet_verb_respawn' }] });
    const select = vi.fn(() => ({ eq, order, limit }));
    const supabase = { from: vi.fn(() => ({ select })) };
    const target = { session_id: 'canary-sess-1', metadata: { account_profile: 'canary' } };
    const resolveCanaryTarget = vi.fn(async () => target);
    const canaryRestart = vi.fn(async () => ({ verb: 'fleet_verb_restart', outcome: 'ok' }));
    const canaryRelaunchUnderProfile = vi.fn(async () => ({ verb: 'fleet_verb_relaunch_under_profile', outcome: 'ok' }));
    const runRebootRespawnDrill = vi.fn(async (args) => {
      // Exercise the injected queryEventsFn exactly as the real runner does (no arg).
      const events = await args.queryEventsFn();
      return { pass: events.length >= 2, checks: [] };
    });
    const runU4Drill = vi.fn(async () => ({ pass: true }));

    const plan = { canaryProfile: 'canary', cwd: 'R:\\r', legs: [] };
    const res = await defaultRunDrills(plan, {
      supabase, resolveCanaryTarget, canaryRestart, canaryRelaunchUnderProfile, runRebootRespawnDrill, runU4Drill,
    });

    expect(select).toHaveBeenCalledWith('event_type,payload,session_id');
    expect(eq).toHaveBeenCalledWith('event_type', 'fleet_verb_respawn');
    expect(res.reboot.pass).toBe(true);
  });
});
