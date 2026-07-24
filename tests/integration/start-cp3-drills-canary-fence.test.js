/**
 * cp3-do-it-right-20260724 (chairman-approved fix-of-QF-20260724-923): non-mocked acceptance test
 * replacing the fully-mocked call-shape assertions at start-cp3-drills.test.js:62,64 that hid three
 * real bugs (missing spawnFn wiring, opts.supabase vs opts.supabaseClient key mismatch, and the
 * Canary- callsign-prefix requirement). Per the drill runners' own anti-test-masking discipline
 * (reboot-respawn-drill-runner.js, u4-drill-runner.js headers: "a mocked-seam UNIT test does NOT
 * satisfy acceptance"), this test exercises the REAL canary-guard resolution + REAL DB reads/writes
 * + REAL defaultRunDrills() wiring against disposable fixture rows -- the ONLY thing stubbed is the
 * literal OS process launch (child_process.spawn), the same sanctioned seam every other test in this
 * codebase uses (reboot-respawn-runner.test.js, spawn-control tests) to avoid actually opening a
 * Windows Terminal window during CI.
 */
import { createSupabaseServiceClient } from '../../lib/supabase-client.cjs';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import { defaultRunDrills } from '../../scripts/fleet/start-cp3-drills.js';

dotenv.config();

const supabase = createSupabaseServiceClient();

const HAS_REAL_DB = process.env.SUPABASE_URL
  && !process.env.SUPABASE_URL.includes('test.invalid.local')
  && process.env.SUPABASE_SERVICE_ROLE_KEY
  && !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('test-service-role-key-not-real');

const ts = Date.now();
const canaryCallsign = `Canary-test${ts}`;
const canarySlotName = `Canary-slot-test${ts}`;
const nonCanarySlotName = `production-slot-test${ts}`;
let canarySessionId;
const cleanup = { sessionIds: [], slotNames: [] };

describe.skipIf(!HAS_REAL_DB)('start-cp3-drills defaultRunDrills — non-mocked canary-fence acceptance', () => {
  const originalCanaryKillEnabled = process.env.FLEET_CANARY_KILL_ENABLED;
  const originalSpawnControlLive = process.env.FLEET_SPAWN_CONTROL_LIVE;

  beforeAll(async () => {
    // TEST-ISOLATION INCIDENT (cp3-do-it-right-20260724, post-mortem): the prior version of this file
    // claimed "FLEET_SPAWN_CONTROL_LIVE is intentionally unset" without actually unsetting it -- it
    // silently inherited whatever this worktree's .env happened to have (which was 'true', left over
    // from the earlier sanctioned live-drill run). defaultRunDrills does NOT thread a spawnFn override
    // through G1a (canaryRestart)/G3-U4 (canaryRelaunchUnderProfile) by design -- a real CLI run SHOULD
    // use spawn-control.js's own isLiveEnabled() env fallback there. That means ANY test exercising
    // these real (non-mocked) functions MUST explicitly force the flag rather than assume its value --
    // assuming it was unset caused 12 real claude.exe processes to spawn on the chairman's machine
    // during test development, requiring manual cleanup. FORCE it off here, unconditionally, regardless
    // of what .env contains, and restore the original value in afterAll. The reboot leg (G1b/G2) is
    // UNAFFECTED by this: defaultRunDrills passes it a literal live:true plus an ALWAYS-injectable
    // spawnFn seam, never the env fallback, so it stays safely testable via the injected stub below.
    process.env.FLEET_SPAWN_CONTROL_LIVE = 'false';

    // A REAL live-shaped canary session: status active, metadata.account_profile='canary',
    // metadata.fleet_identity.callsign starting with 'Canary-' (session-registry-adapter.js's
    // callsign authority + canary-guard.js's isCanaryCallsign requirement).
    canarySessionId = randomUUID();
    await supabase.from('claude_sessions').insert({
      session_id: canarySessionId,
      status: 'active',
      heartbeat_at: new Date().toISOString(),
      metadata: { account_profile: 'canary', fleet_identity: { callsign: canaryCallsign, role: 'worker' } },
    });
    cleanup.sessionIds.push(canarySessionId);

    // A REAL canary-profile desired slot + a REAL non-canary slot, to prove the fence excludes the
    // latter from ever reaching the runner (not merely dry-running it -- filtered out entirely).
    await supabase.from('fleet_desired_slots').insert([
      { name: canarySlotName, role: 'worker', account_profile: 'canary', enabled: true },
      { name: nonCanarySlotName, role: 'worker', account_profile: 'production', enabled: true },
    ]);
    cleanup.slotNames.push(canarySlotName, nonCanarySlotName);

    // FLEET_CANARY_KILL_ENABLED gates canary-guard.js's guardedVerb -- enable it so G1a/G3-U4 can
    // resolve past the guard for this test (proving bug2/bug3 are fixed), while
    // FLEET_SPAWN_CONTROL_LIVE=false (forced above) keeps the underlying spawn-control.js verb calls
    // safely dry-run regardless of the guard outcome.
    process.env.FLEET_CANARY_KILL_ENABLED = 'true';
  });

  afterAll(async () => {
    process.env.FLEET_CANARY_KILL_ENABLED = originalCanaryKillEnabled;
    process.env.FLEET_SPAWN_CONTROL_LIVE = originalSpawnControlLive;
    for (const name of cleanup.slotNames) {
      await supabase.from('fleet_desired_slots').delete().eq('name', name);
    }
    for (const sid of cleanup.sessionIds) {
      await supabase.from('claude_sessions').delete().eq('session_id', sid);
    }
    // fleet_verb_respawn rows carry session_id=null by design (mirrors production drill runs) -- clean
    // up by the disposable slot's callsign instead.
    const { data: ourEvents } = await supabase
      .from('coordination_events')
      .select('id, payload')
      .eq('event_type', 'fleet_verb_respawn');
    const ids = (ourEvents || []).filter((e) => e.payload && e.payload.callsign === canarySlotName).map((e) => e.id);
    if (ids.length) await supabase.from('coordination_events').delete().in('id', ids);
  });

  it('reboot leg (G1b/G2): real canary-filtered slot load + real event write, payload.live=true, non-canary slot excluded entirely', async () => {
    // TRIPWIRE (see the second test's comment for the incident this guards against). This leg's
    // live-ness is independently controlled by an explicit live:true + the injected spawnFn below
    // (never the env var), but asserting the env state here too keeps both tests self-documenting.
    expect(process.env.FLEET_SPAWN_CONTROL_LIVE).toBe('false');

    const spawnCalls = [];
    const spawnFn = (program, args, env, cwd) => {
      spawnCalls.push({ program, args, env, cwd });
      return { pid: 424242 }; // sanctioned OS-boundary stub -- no real process launched
    };

    // NOTE: canaryOnlyLoadFn (production code) correctly filters to ALL canary-profile slots, which
    // includes the real seeded 'Canary-pilot' row alongside this test's own disposable slot -- so
    // runRebootRespawnDrill's respawn_events_present check expects events for BOTH. Filter by recency
    // rather than a single callsign so the count matches however many canary slots exist right now.
    const testStartedAt = new Date().toISOString();
    const rebootQueryEventsFn = async () => {
      const { data } = await supabase
        .from('coordination_events')
        .select('event_type, payload, created_at')
        .eq('event_type', 'fleet_verb_respawn')
        .gte('created_at', testStartedAt);
      return data || [];
    };

    const reboot = await defaultRunDrills(
      { canaryProfile: 'canary', cwd: process.cwd(), legs: [] },
      { supabase, spawnFn, rebootQueryEventsFn },
    ).then((r) => r.reboot);

    if (!reboot.pass) console.log('REBOOT CHECKS DEBUG:', JSON.stringify(reboot.checks, null, 2));
    expect(reboot.pass).toBe(true);
    // The OS-boundary stub was invoked for this test's own disposable canary slot -- proving the
    // fence let it through to a real spawn ATTEMPT. NOTE: canaryOnlyLoadFn (production code) loads
    // ALL canary-profile slots, which also includes the real seeded 'Canary-pilot' row alongside this
    // test's fixture -- so spawnCalls may contain more than one entry. Assert on OUR slot specifically
    // rather than assuming this fixture is the only canary slot in the environment.
    const ourSpawnCall = spawnCalls.find((c) => c.env.FLEET_WORKER_CALLSIGN === canarySlotName);
    expect(ourSpawnCall).toBeDefined();
    // The non-canary slot never reached the spawner at all -- filtered before the runner saw it.
    expect(spawnCalls.some((c) => c.env.FLEET_WORKER_CALLSIGN === nonCanarySlotName)).toBe(false);

    // Real DB read-back: the emitted fleet_verb_respawn event genuinely has payload.live=true --
    // this is the exact field QF-20260724-923's mocked test could never have caught being false.
    const { data: events } = await supabase
      .from('coordination_events')
      .select('event_type, payload')
      .eq('event_type', 'fleet_verb_respawn')
      .order('created_at', { ascending: false })
      .limit(5);
    const ours = (events || []).find((e) => e.payload && e.payload.callsign === canarySlotName);
    expect(ours).toBeDefined();
    expect(ours.payload.live).toBe(true);

    // The non-canary slot produced NO event via this drill path at all -- filtered before the runner
    // ever saw it, not merely dry-run.
    const nonCanaryEvent = (events || []).find((e) => e.payload && e.payload.callsign === nonCanarySlotName);
    expect(nonCanaryEvent).toBeUndefined();
  });

  it('G1a (kill-supervisor) + G3/U4 (relaunch-under-profile): real canary-guard resolution succeeds with the corrected supabaseClient key + callsign-string contract', async () => {
    // TRIPWIRE: this is the exact env var whose unchecked assumption caused the cp3-do-it-right-20260724
    // incident (12 real process spawns). Assert it explicitly, every run, so a future change to the
    // beforeAll setup can never silently regress this into a live OS spawn again.
    expect(process.env.FLEET_SPAWN_CONTROL_LIVE).toBe('false');

    // DEFENSE-IN-DEPTH (cp3-do-it-right-20260724 incident hardening, coordinator-approved plan):
    // defaultRunDrills now threads this SAME spawnFn through to G1a (canaryRestart) and G3/U4
    // (canaryRelaunchUnderProfile) as well, not just the reboot leg -- so a stub is present at the
    // OS-spawn boundary for every leg. With FLEET_SPAWN_CONTROL_LIVE forced 'false' (tripwire above),
    // spawn-control.js's spawn() returns dry-run before ever reaching opts.spawnFn, so this stub is
    // NOT invoked on this pass -- it exists as an independent second layer that only engages if `live`
    // is ever true, which is exactly the condition that was unguarded during the incident. The wiring
    // itself (spawnFn actually reaching canaryRestart/runU4Drill's opts) is asserted directly in the
    // mocked-call-shape unit test (start-cp3-drills.test.js).
    const res = await defaultRunDrills(
      { canaryProfile: 'canary', cwd: process.cwd(), legs: [] },
      { supabase, spawnFn: () => ({ pid: 1 }) },
    );

    // Bug2/bug3 proof: the guard must get PAST resolution (not fail at not_resolved/canary_kill_disabled/
    // not_canary_callsign) now that the correct opts key + callsign string + Canary- prefix are wired.
    // FLEET_SPAWN_CONTROL_LIVE is forced 'false' above (regardless of .env), so the underlying
    // spawn-control.js restart/relaunchUnderProfile call resolves the target fine but the replacement
    // spawn stays dry-run (spawnResult.live!==true) -- 'replacement_not_live' is the expected, SAFE
    // outcome proving the guard passed; 'not_resolved'/'canary_kill_disabled'/'not_canary_callsign'/
    // 'no_live_canary_session' would mean bug2/bug3 are NOT actually fixed.
    expect(res.g1a).not.toBe(undefined);
    expect(res.g1a.reason).not.toBe('no_live_canary_session');
    if (res.g1a.reason) {
      expect(['not_resolved', 'canary_kill_disabled', 'not_canary_callsign']).not.toContain(res.g1a.reason);
    }

    expect(res.u4.checks.some((c) => c.name === 'target_resolution')).toBe(false);
  });
});
