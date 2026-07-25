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
    // G1a kill-supervisor -> fleet_verb_restart. QF-20260724-499: live:true explicit (was missing,
    // causing restart to fall through to spawn-control's isLiveEnabled() and dry-run).
    expect(canaryRestart).toHaveBeenCalledWith(target, { supabase, sdKey: 'CHECKPOINT-3', live: true });
    // G1b+G2 reboot-respawn gets a REAL client + live:true (was supabase=null) + a queryEventsFn
    // (QF-20260724-113 FR-b: without one, respawn_events_present always fails on a live run).
    const rebootArgs = runRebootRespawnDrill.mock.calls[0][0];
    expect(rebootArgs.supabase).toBe(supabase);
    expect(rebootArgs.live).toBe(true);
    expect(typeof rebootArgs.queryEventsFn).toBe('function');
    // G3+U4 gets the REQUIRED args (was only {opts:{}} -> no-op): target, sessionId, relaunchFn, resolveFn, queryEventsFn.
    const u4Args = runU4Drill.mock.calls[0][0];
    expect(u4Args.target).toBe(target);
    expect(u4Args.sessionId).toBe('canary-sess-1');
    expect(u4Args.toProfile).toBe('canary');
    expect(typeof u4Args.relaunchFn).toBe('function');
    expect(typeof u4Args.resolveFn).toBe('function');
    expect(typeof u4Args.queryEventsFn).toBe('function');
    // QF-20260724-499: relaunch's opts also carry live:true (mirrors the reboot leg's own explicit flag).
    expect(u4Args.opts.live).toBe(true);
    expect(res).toMatchObject({ g1a: expect.anything(), reboot: expect.anything(), u4: expect.anything() });
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

// QF-20260724-070: the live drill must be wired with a queryLifecycleEventsFn so the new
// respawn_bind_audited check has real session_lifecycle_events evidence to read on a genuine bind.
describe('defaultRunDrills — rebootQueryLifecycleEventsFn wiring (QF-20260724-070)', () => {
  it('threads a default queryLifecycleEventsFn into runRebootRespawnDrill that reads RESPAWN_BIND_VERIFIED rows', async () => {
    const eq = vi.fn().mockReturnThis();
    const order = vi.fn().mockReturnThis();
    const limit = vi.fn().mockResolvedValue({ data: [{ event_type: 'RESPAWN_BIND_VERIFIED', session_id: 's-1' }] });
    const select = vi.fn(() => ({ eq, order, limit }));
    const supabase = { from: vi.fn(() => ({ select })) };
    const target = { session_id: 'canary-sess-1', metadata: { account_profile: 'canary' } };
    const resolveCanaryTarget = vi.fn(async () => target);
    const canaryRestart = vi.fn(async () => ({ verb: 'fleet_verb_restart', outcome: 'ok' }));
    const canaryRelaunchUnderProfile = vi.fn(async () => ({ verb: 'fleet_verb_relaunch_under_profile', outcome: 'ok' }));
    const runRebootRespawnDrill = vi.fn(async (args) => {
      const rows = await args.queryLifecycleEventsFn();
      return { pass: rows.length >= 1, checks: [] };
    });
    const runU4Drill = vi.fn(async () => ({ pass: true }));

    const plan = { canaryProfile: 'canary', cwd: 'R:\\r', legs: [] };
    const res = await defaultRunDrills(plan, {
      supabase, resolveCanaryTarget, canaryRestart, canaryRelaunchUnderProfile, runRebootRespawnDrill, runU4Drill,
    });

    expect(select).toHaveBeenCalledWith('event_type,session_id');
    expect(eq).toHaveBeenCalledWith('event_type', 'RESPAWN_BIND_VERIFIED');
    expect(res.reboot.pass).toBe(true);
  });
});

// QF-20260724-335: an explicit, intentional run-correlator must be stamped on all 3 leg events of one
// --live invocation (timing/session-proximity alone is insufficient -- a stray batch can collide with
// a real run; Solomon S7 acceptance requires unique intentional binding of the 3 legs to one CP3 run).
describe('defaultRunDrills — run-correlator stamped on all 3 legs (QF-20260724-335)', () => {
  it('passes the SAME sdKey to canaryRestart, runRebootRespawnDrill, and runU4Drill', async () => {
    const supabase = { from: vi.fn() };
    const target = { session_id: 'canary-sess-1', metadata: { account_profile: 'canary' } };
    const resolveCanaryTarget = vi.fn(async () => target);
    const canaryRestart = vi.fn(async () => ({ verb: 'fleet_verb_restart', outcome: 'ok' }));
    const canaryRelaunchUnderProfile = vi.fn(async () => ({ verb: 'fleet_verb_relaunch_under_profile', outcome: 'ok' }));
    const runRebootRespawnDrill = vi.fn(async () => ({ pass: true }));
    const runU4Drill = vi.fn(async () => ({ pass: true }));

    const plan = { canaryProfile: 'canary', cwd: 'R:\\r', legs: [] };
    await defaultRunDrills(plan, {
      supabase, resolveCanaryTarget, canaryRestart, canaryRelaunchUnderProfile, runRebootRespawnDrill, runU4Drill,
    });

    // Default run-correlator is the SD-scoped literal 'CHECKPOINT-3'.
    expect(canaryRestart.mock.calls[0][1].sdKey).toBe('CHECKPOINT-3');
    expect(runRebootRespawnDrill.mock.calls[0][0].opts.sdKey).toBe('CHECKPOINT-3');
    expect(runU4Drill.mock.calls[0][0].opts.sdKey).toBe('CHECKPOINT-3');
  });

  it('honors an injected deps.sdKey override (e.g. a per-invocation run_id) for all 3 legs', async () => {
    const supabase = { from: vi.fn() };
    const target = { session_id: 'canary-sess-1', metadata: { account_profile: 'canary' } };
    const resolveCanaryTarget = vi.fn(async () => target);
    const canaryRestart = vi.fn(async () => ({ verb: 'fleet_verb_restart', outcome: 'ok' }));
    const canaryRelaunchUnderProfile = vi.fn(async () => ({ verb: 'fleet_verb_relaunch_under_profile', outcome: 'ok' }));
    const runRebootRespawnDrill = vi.fn(async () => ({ pass: true }));
    const runU4Drill = vi.fn(async () => ({ pass: true }));

    const plan = { canaryProfile: 'canary', cwd: 'R:\\r', legs: [] };
    await defaultRunDrills(plan, {
      supabase, resolveCanaryTarget, canaryRestart, canaryRelaunchUnderProfile, runRebootRespawnDrill, runU4Drill,
      sdKey: 'run-2026-07-24T22-00-00Z',
    });

    expect(canaryRestart.mock.calls[0][1].sdKey).toBe('run-2026-07-24T22-00-00Z');
    expect(runRebootRespawnDrill.mock.calls[0][0].opts.sdKey).toBe('run-2026-07-24T22-00-00Z');
    expect(runU4Drill.mock.calls[0][0].opts.sdKey).toBe('run-2026-07-24T22-00-00Z');
  });
});
