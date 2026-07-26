// SD-LEO-INFRA-LEO-APP-LAUNCHER-001 (FR-4) — worker-startable CP3 drill starter.
import { describe, it, expect, vi } from 'vitest';
import { planDrills, main, defaultRunDrills, summarizeLegVerdicts, formatDrillReport } from '../../../scripts/fleet/start-cp3-drills.js';
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

// QF-20260725-790: the OTHER half of the false pass. main() hardcoded ok:true for every --live run and
// the CLI did main().then(r => process.exit(r.ok ? 0 : 1)), discarding the entire results object. So the
// 2026-07-26T00:15Z acceptance attempt executed almost nothing, printed nothing, and exited 0.
// Fixing only the leg CHECKS would have left the false pass intact at the exit code.
describe('QF-20260725-790: the verdict is DERIVED from the legs and is inspectable', () => {
  it('ok is FALSE when a leg fails, instead of hardcoded true', async () => {
    const runDrills = vi.fn(async () => ({
      g1a: { outcome: 'ok' },
      reboot: { pass: false, checks: [{ name: 'respawn_events_present', pass: false, detail: 'no bound respawn' }] },
      u4: { pass: true, checks: [{ name: 'u4', pass: true, detail: 'ok' }] },
    }));
    const r = await main(['--live'], { env: OKENV, log: () => {}, runDrills });
    expect(r.ok).toBe(false);
  });

  it('a leg that THREW (captured as {error}) reads as FAILURE, never as no-opinion', async () => {
    const runDrills = vi.fn(async () => ({ g1a: { outcome: 'ok' }, reboot: { error: 'boom' }, u4: { pass: true } }));
    const r = await main(['--live'], { env: OKENV, log: () => {}, runDrills });
    expect(r.ok).toBe(false);
    expect(r.legVerdicts.find((v) => v.leg === 'reboot').detail).toMatch(/ERROR: boom/);
  });

  it('a leg reporting ZERO checks does not count as a pass (it demonstrated nothing)', async () => {
    const runDrills = vi.fn(async () => ({ reboot: { pass: true, checks: [] } }));
    const r = await main(['--live'], { env: OKENV, log: () => {}, runDrills });
    expect(r.ok).toBe(false);
    expect(r.legVerdicts.some((v) => /ZERO checks/.test(v.detail || ''))).toBe(true);
  });

  it('ok is TRUE when every leg genuinely passes (not a blanket fail)', async () => {
    const runDrills = vi.fn(async () => ({
      g1a: { outcome: 'ok' },
      reboot: { pass: true, checks: [{ name: 'respawn_events_present', pass: true, detail: 'bound' }] },
      u4: { pass: true, checks: [{ name: 'u4', pass: true, detail: 'ok' }] },
    }));
    const r = await main(['--live'], { env: OKENV, log: () => {}, runDrills });
    expect(r.ok).toBe(true);
  });

  it('formatDrillReport renders every check name and verdict, so the result is not inferred from an exit code', async () => {
    const runDrills = vi.fn(async () => ({
      reboot: { pass: false, checks: [{ name: 'respawn_bind_audited', pass: false, detail: 'absence is not a pass' }] },
    }));
    const r = await main(['--live'], { env: OKENV, log: () => {}, runDrills });
    const text = formatDrillReport(r);
    expect(text).toMatch(/ok=false/);
    expect(text).toMatch(/FAIL {2}reboot\/respawn_bind_audited/);
    expect(text).toMatch(/absence is not a pass/);
  });
});

// QF-20260725-985: the wrapper-vs-identity defect and its fail-loud guard.
describe('defaultRunDrills — canary target resolution (QF-20260725-985)', () => {
  const legs = { canaryRestart: null, runRebootRespawnDrill: null, runU4Drill: null };

  it('an UNRESOLVED canary aborts loudly instead of running drills that emit nothing', async () => {
    // THE POINT OF THIS SD. Previously an unresolved canary sailed straight on: sessionId was
    // undefined, guardedVerb fail-closed with not_found, and G1a + G3+U4 emitted ZERO fleet_verb_*
    // rows — while the run still exited looking clean. An empty run that reports success is worse
    // than a red one, because it sends someone hunting a defect in the verbs that does not exist.
    const supabase = { from: vi.fn() };
    const resolveCanaryTarget = vi.fn(async () => ({ resolved: false, reason: 'not_found' }));
    const canaryRestart = vi.fn();
    const runRebootRespawnDrill = vi.fn();
    const runU4Drill = vi.fn();

    const out = await defaultRunDrills({ canaryProfile: 'canary', cwd: 'R:\\r', legs: [] }, {
      supabase, resolveCanaryTarget, canaryRestart,
      canaryRelaunchUnderProfile: vi.fn(), runRebootRespawnDrill, runU4Drill,
    });

    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/not_found/);
    // No leg may run: each would have been rejected at the guard and emitted nothing anyway.
    expect(canaryRestart).not.toHaveBeenCalled();
    expect(runRebootRespawnDrill).not.toHaveBeenCalled();
    expect(runU4Drill).not.toHaveBeenCalled();
    void legs;
  });

  it('never passes the resolution WRAPPER (or the identity object) to a verb', async () => {
    // Regression guard on the exact defect. guardedVerb compares `j[by] === value` with by='callsign',
    // so ANY object — wrapper or identity — can only ever resolve not_found. The literal remedy named
    // in the QF ("pass target.identity") would therefore NOT have fixed it; the value must be scalar.
    const supabase = { from: vi.fn() };
    const identity = { session_id: 'canary-sess-9', callsign: 'Canary-9', account_profile: 'canary' };
    const resolution = { resolved: true, identity };
    const canaryRestart = vi.fn(async () => ({ outcome: 'ok' }));

    await defaultRunDrills({ canaryProfile: 'canary', cwd: 'R:\\r', legs: [] }, {
      supabase,
      resolveCanaryTarget: vi.fn(async () => resolution),
      canaryRestart,
      canaryRelaunchUnderProfile: vi.fn(async () => ({ outcome: 'ok' })),
      runRebootRespawnDrill: vi.fn(async () => ({ pass: true })),
      runU4Drill: vi.fn(async () => ({ pass: true })),
    });

    const passed = canaryRestart.mock.calls[0][0];
    expect(typeof passed).toBe('string');
    expect(passed).toBe('Canary-9');
    expect(passed).not.toBe(resolution);
    expect(passed).not.toBe(identity);
  });
});

// QF-20260724-923: the live path must WIRE all 3 legs to emit real fleet_verb_* evidence (was a stub).
describe('defaultRunDrills — wired live path (QF-20260724-923)', () => {
  it('uses a real supabase client, resolves the canary, and calls all 3 legs with the required args', async () => {
    const supabase = { from: vi.fn() };
    // QF-20260725-985: the REAL resolveCanaryTarget returns a WRAPPER {resolved, identity} — never a
    // bare session row. The old fixture invented {session_id, metadata}, a shape production never
    // produces, so these tests certified a caller that could not work and the defect shipped green.
    const identity = { session_id: 'canary-sess-1', callsign: 'Canary-1', account_profile: 'canary' };
    const target = { resolved: true, identity };
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
    // QF-20260725-985: the verb must receive the CALLSIGN, not the wrapper and not the identity
    // object. guardedVerb re-resolves via resolveSessionIdentity, whose match is `j[by] === value`
    // with by defaulting to 'callsign' — a strict SCALAR comparison, so any object fails not_found
    // and the leg emits nothing while the guard looks like it behaved correctly (it did).
    expect(canaryRestart).toHaveBeenCalledWith('Canary-1', { supabase, sdKey: 'CHECKPOINT-3', live: true });
    // G1b+G2 reboot-respawn gets a REAL client + live:true (was supabase=null) + a queryEventsFn
    // (QF-20260724-113 FR-b: without one, respawn_events_present always fails on a live run).
    const rebootArgs = runRebootRespawnDrill.mock.calls[0][0];
    expect(rebootArgs.supabase).toBe(supabase);
    expect(rebootArgs.live).toBe(true);
    expect(typeof rebootArgs.queryEventsFn).toBe('function');
    // G3+U4 gets the REQUIRED args (was only {opts:{}} -> no-op): target, sessionId, relaunchFn, resolveFn, queryEventsFn.
    const u4Args = runU4Drill.mock.calls[0][0];
    expect(u4Args.target).toBe('Canary-1');
    // The sessionId that used to be undefined — the field that made two legs emit zero rows.
    expect(u4Args.sessionId).toBe('canary-sess-1');
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
    const gte = vi.fn().mockReturnThis();
    const order = vi.fn().mockReturnThis();
    const limit = vi.fn().mockResolvedValue({ data: [{ event_type: 'fleet_verb_respawn' }, { event_type: 'fleet_verb_respawn' }] });
    const select = vi.fn(() => ({ eq, gte, order, limit }));
    const supabase = { from: vi.fn(() => ({ select })) };
    // QF-20260725-985: the REAL resolveCanaryTarget returns a WRAPPER {resolved, identity} — never a
    // bare session row. The old fixture invented {session_id, metadata}, a shape production never
    // produces, so these tests certified a caller that could not work and the defect shipped green.
    const identity = { session_id: 'canary-sess-1', callsign: 'Canary-1', account_profile: 'canary' };
    const target = { resolved: true, identity };
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
    const gte = vi.fn().mockReturnThis();
    const order = vi.fn().mockReturnThis();
    const limit = vi.fn().mockResolvedValue({ data: [{ event_type: 'RESPAWN_BIND_VERIFIED', session_id: 's-1' }] });
    const select = vi.fn(() => ({ eq, gte, order, limit }));
    const supabase = { from: vi.fn(() => ({ select })) };
    // QF-20260725-985: the REAL resolveCanaryTarget returns a WRAPPER {resolved, identity} — never a
    // bare session row. The old fixture invented {session_id, metadata}, a shape production never
    // produces, so these tests certified a caller that could not work and the defect shipped green.
    const identity = { session_id: 'canary-sess-1', callsign: 'Canary-1', account_profile: 'canary' };
    const target = { resolved: true, identity };
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

// QF-20260725-139: check 5 (respawn_bind_audited) was ARITHMETICALLY CLOSED, not merely failing.
// boundSessionIds came from a TRAILING-50 window holding 4 historical bound respawns (2026-07-25T00:16
// -00:17Z) while RESPAWN_BIND_VERIFIED was 0 all-time => 0 === 4, and a flawless run only reached
// 1 === 5. No drill outcome could pass. These tests pin the POPULATION, not the assertion.
//
// Deliberately a filtering fake rather than `expect(gte).toHaveBeenCalled()`: asserting the call is a
// proxy: it would stay green if the bound value were wrong, or if a later edit passed a value that
// excluded nothing (exactly the sd_key='CHECKPOINT-3' no-op that was already tried and rejected).
// Filtering real fixture rows measures the thing that actually matters -- what survives the query.
describe('defaultRunDrills — reboot audit queries are scoped to THIS run (QF-20260725-139)', () => {
  const RUN_STARTED_AT = '2026-07-25T23:40:00.000Z';
  // The 4 real historical rows that closed the check, plus one respawn from this run.
  const HISTORICAL = [
    { event_type: 'fleet_verb_respawn', session_id: '283ca94a', created_at: '2026-07-25T00:17:17.527Z', payload: { outcome: 'ok' } },
    { event_type: 'fleet_verb_respawn', session_id: '283ca94a', created_at: '2026-07-25T00:17:17.459Z', payload: { outcome: 'ok' } },
    { event_type: 'fleet_verb_respawn', session_id: '8dc4f150', created_at: '2026-07-25T00:16:58.028Z', payload: { outcome: 'ok' } },
    { event_type: 'fleet_verb_respawn', session_id: '8dc4f150', created_at: '2026-07-25T00:16:57.964Z', payload: { outcome: 'ok' } },
  ];
  const THIS_RUN = { event_type: 'fleet_verb_respawn', session_id: 'new-sess', created_at: '2026-07-25T23:40:05.000Z', payload: { outcome: 'ok' } };

  /** Minimal PostgREST-ish fake that HONOURS eq/gte instead of ignoring them. */
  function filteringSupabase(tables) {
    const make = (table) => {
      let rows = (tables[table] || []).slice();
      const api = {
        select: () => api,
        eq: (col, val) => { rows = rows.filter((r) => r[col] === val); return api; },
        gte: (col, val) => { rows = rows.filter((r) => r[col] >= val); return api; },
        like: () => api,
        order: () => api,
        limit: () => Promise.resolve({ data: rows }),
        then: (res) => res({ data: rows }),
      };
      return api;
    };
    return { from: vi.fn((t) => make(t)) };
  }

  function harness(tables) {
    // QF-20260725-985: the REAL resolveCanaryTarget returns a WRAPPER {resolved, identity} — never a
    // bare session row. The old fixture invented {session_id, metadata}, a shape production never
    // produces, so these tests certified a caller that could not work and the defect shipped green.
    const identity = { session_id: 'canary-sess-1', callsign: 'Canary-1', account_profile: 'canary' };
    const target = { resolved: true, identity };
    return {
      supabase: filteringSupabase(tables),
      runStartedAt: RUN_STARTED_AT,
      resolveCanaryTarget: vi.fn(async () => target),
      canaryRestart: vi.fn(async () => ({ verb: 'fleet_verb_restart', outcome: 'ok' })),
      canaryRelaunchUnderProfile: vi.fn(async () => ({ verb: 'fleet_verb_relaunch_under_profile', outcome: 'ok' })),
      runU4Drill: vi.fn(async () => ({ pass: true })),
    };
  }
  const PLAN = { canaryProfile: 'canary', cwd: 'R:\\r', legs: [] };

  it('REGRESSION: the 4 historical bound respawns are EXCLUDED — only this run\'s respawn survives', async () => {
    let seen = null;
    const deps = {
      ...harness({ coordination_events: [...HISTORICAL, THIS_RUN] }),
      runRebootRespawnDrill: vi.fn(async (args) => { seen = await args.queryEventsFn(); return { pass: true, checks: [] }; }),
    };
    await defaultRunDrills(PLAN, deps);
    // Pre-fix this returned all 5 and check 5 evaluated 1 === 5. Never passable.
    expect(seen).toHaveLength(1);
    expect(seen[0].session_id).toBe('new-sess');
  });

  it('REGRESSION: an audit row from an EARLIER run cannot satisfy a bind performed by this one', async () => {
    let seen = null;
    const deps = {
      ...harness({
        session_lifecycle_events: [
          { event_type: 'RESPAWN_BIND_VERIFIED', session_id: 'stale', created_at: '2026-07-25T00:17:00.000Z' },
          { event_type: 'RESPAWN_BIND_VERIFIED', session_id: 'new-sess', created_at: '2026-07-25T23:40:06.000Z' },
        ],
      }),
      runRebootRespawnDrill: vi.fn(async (args) => { seen = await args.queryLifecycleEventsFn(); return { pass: true, checks: [] }; }),
    };
    await defaultRunDrills(PLAN, deps);
    expect(seen).toHaveLength(1);
    expect(seen[0].session_id).toBe('new-sess');
  });

  it('the scoped population still lets check 5 GO RED — scoping is not weakening', async () => {
    // This run binds a session but its audit row never lands: 0 === 1 => RED, and that red is
    // informative because it reflects THIS run. If scoping had weakened the check, this would pass.
    const deps = {
      ...harness({ coordination_events: [...HISTORICAL, THIS_RUN], session_lifecycle_events: [] }),
      runRebootRespawnDrill: vi.fn(async (args) => {
        const { runRebootRespawnDrill: real } = await import('../../../lib/fleet/reboot-respawn-drill-runner.js');
        return real({ ...args, live: false });
      }),
    };
    const res = await defaultRunDrills(PLAN, deps);
    const check5 = (res.reboot.checks || []).find((c) => c.name === 'respawn_bind_audited');
    expect(check5.pass).toBe(false);
    expect(check5.detail).toContain('0/1');
  });
});

// QF-20260724-335: an explicit, intentional run-correlator must be stamped on all 3 leg events of one
// --live invocation (timing/session-proximity alone is insufficient -- a stray batch can collide with
// a real run; Solomon S7 acceptance requires unique intentional binding of the 3 legs to one CP3 run).
describe('defaultRunDrills — run-correlator stamped on all 3 legs (QF-20260724-335)', () => {
  it('passes the SAME sdKey to canaryRestart, runRebootRespawnDrill, and runU4Drill', async () => {
    const supabase = { from: vi.fn() };
    // QF-20260725-985: the REAL resolveCanaryTarget returns a WRAPPER {resolved, identity} — never a
    // bare session row. The old fixture invented {session_id, metadata}, a shape production never
    // produces, so these tests certified a caller that could not work and the defect shipped green.
    const identity = { session_id: 'canary-sess-1', callsign: 'Canary-1', account_profile: 'canary' };
    const target = { resolved: true, identity };
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
    // QF-20260725-985: the REAL resolveCanaryTarget returns a WRAPPER {resolved, identity} — never a
    // bare session row. The old fixture invented {session_id, metadata}, a shape production never
    // produces, so these tests certified a caller that could not work and the defect shipped green.
    const identity = { session_id: 'canary-sess-1', callsign: 'Canary-1', account_profile: 'canary' };
    const target = { resolved: true, identity };
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
