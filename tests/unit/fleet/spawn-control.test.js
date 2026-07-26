/**
 * SD-LEO-INFRA-FLEET-SPAWN-CONTROL-001 -- six-verb control API (TS-1..TS-10 unit-testable subset).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// QF-20260725-757: spread the ORIGINAL module rather than replacing it wholesale. spawn() now reads
// the canonical FLEET_WORKER_STARTUP_PROMPT from here (the keepalive it must forward), and a
// stub that dropped that export made every spawn() test throw. Only logCoordinationEvent is
// overridden; everything else stays real so the stub cannot drift from the module's contract again.
vi.mock('../../../lib/coordinator/coordination-events.cjs', async (importOriginal) => ({
  ...(await importOriginal()),
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

/**
 * SD-LEO-INFRA-SPAWN-ROOT-CURRENCY-INVARIANT-001 FR-2 + post-CI RCA.
 *
 * Every live-path call below crosses the tree-currency seam in spawn-control.js. Injecting a
 * fake git runner is NOT mocking the gate: the gate is the enforceTreeCurrency CALL at that
 * seam plus its decision table, and both still execute in full (fetch -> branch -> dirty ->
 * behind -> current). `runner` is only the guard's I/O dependency, and tree-currency.cjs
 * documents it as the injection seam; tests/unit/worktree-reaper/tick.test.js:181 already
 * does exactly this. Deleting the enforcement block still turns the FR-2 seam suite red.
 *
 * WHY THIS IS REQUIRED, not cosmetic: without it these tests shell out to REAL git against
 * whatever tree the checkout happens to live in. That passed on the author's machine purely
 * because the runs happened inside .worktrees/ (which the guard deliberately exempts) and
 * failed in CI, where actions/checkout leaves a DETACHED HEAD and the guard correctly
 * refuses -- 21 red tests whose behaviour depended on the physical location of the checkout.
 * A unit test must never depend on real git state or on network egress.
 */
const CURRENT_RUNNER = (args) => {
  if (args[0] === 'fetch') return '';
  if (args.includes('--abbrev-ref')) return 'main\n';
  if (args[0] === 'status') return '';
  if (args[0] === 'rev-list') return '0\n';
  return '';
};
const { logCoordinationEvent } = await import('../../../lib/coordinator/coordination-events.cjs');
const { sequenceSingletonRefresh } = await import('../../../lib/coordinator/singleton-refresh-sequencer.cjs');
const { spawn: childProcessSpawnSpy } = await import('node:child_process');
const canarySession = await import('../../../lib/fleet/canary-session.js');

/**
 * FR-3: the spawner MINTS the session id and passes it as `claude --session-id <uuid>`, so the child
 * registers under this exact value and correlation is a direct lookup. Injected via opts.uuidFn to keep
 * tests deterministic. Must be a syntactically valid UUID — buildSessionLaunch DROPS a malformed one
 * rather than passing it to the CLI (which would reject it and fail the whole launch).
 */
const MINTED_SESSION_ID = '11111111-2222-4333-8444-555555555555';

/**
 * FR-4: spawn() now captures the window by ENUMERATION DIFF rather than by reading a per-process
 * MainWindowHandle, so execFn must return enumeration-shaped stdout (`handle|pid|proc|title`).
 * Call 1 is the BEFORE snapshot (no windows); every later call is an AFTER snapshot containing one
 * new WindowsTerminal window. The old shape -- a bare number -- parses to ZERO rows, so the capture
 * correctly fails; that is exactly why these tests went red until updated, and it is the signal that
 * the production call path really changed rather than the tests being loosened around it.
 */
function enumExec(handle = 131074) {
  let call = 0;
  return vi.fn(async () => {
    call += 1;
    return { stdout: call === 1 ? '' : `${handle}|5555|WindowsTerminal|Claude Code` };
  });
}

/** Minimal in-memory fake covering exactly the claude_sessions/session_coordination shapes spawn-control.js touches. */
function makeFakeSupabase({ sessions = [], coordinationInsertError = null } = {}) {
  const store = new Map(sessions.map((s) => [s.session_id, { ...s }]));
  const coordinationInserts = [];
  return {
    _store: store,
    _coordinationInserts: coordinationInserts,
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
        return {
          select: () => ({ eq: () => ({ gte: async () => ({ count: 0 }) }) }),
          // SD-LEO-INFRA-SESSION-SPAWN-AND-PROMPT-LIBRARY-001-E FR-4: canary spawns now write a
          // spawn-time pre-registration marker here BEFORE spawning, and refuse the spawn if it
          // cannot be written (an unmarked canary would pass the claim fence and take real work).
          // Recorded rather than swallowed so tests can assert the marker and its ordering.
          insert: async (row) => { coordinationInserts.push(row); return { error: coordinationInsertError }; },
        };
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
    // The guard exists to catch an undocumented 7th VERB, not to freeze the helper surface. The two
    // session-bind constants are exported so the budget can be asserted directly instead of by
    // wall-clock; they are values, not verbs, so they belong on this allowlist.
    const helperNames = ['roleOf', 'isSingletonRole', 'resolveProfileDir', 'isLiveEnabled', 'buildLiveSpawnInvocation',
      'SESSION_BIND_MAX_ATTEMPTS', 'SESSION_BIND_DELAY_MS',
      'CANARY_PROFILE', 'CANARY_CALLSIGN_PREFIX',
      // FR-4: third cycle-forced constant (see the drift pin). A value, not a verb.
      'CANARY_TRIGGER_KEY'];
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
    // Pre-existing env leakage: this repo's .env sets FLEET_ACCOUNT_PROFILES_DIR, which
    // resolveProfileDir() falls back to when opts.baseDir is absent -- neutralize it for the
    // duration of this one assertion so the test doesn't depend on ambient shell state.
    const saved = process.env.FLEET_ACCOUNT_PROFILES_DIR;
    delete process.env.FLEET_ACCOUNT_PROFILES_DIR;
    try {
      expect(() => resolveProfileDir('account_b', {})).toThrow(/FLEET_ACCOUNT_PROFILES_DIR/);
    } finally {
      if (saved !== undefined) process.env.FLEET_ACCOUNT_PROFILES_DIR = saved;
    }
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

describe('spawn (FR-1) — keepalive forwarding (QF-20260725-757)', () => {
  // spawn() was the THIRD hop of the QF-20260724-290 keepalive drop: that QF fixed
  // buildLiveSpawnInvocation and the respawn runner, but spawn() built its invocation with NO
  // startupPrompt, so every session created through the generic spawn verb came up with nothing to
  // do, heartbeat once, and ghosted. This is why provisioned canaries kept dying.
  it('REGRESSION: forwards the canonical keepalive prompt into the invocation env', async () => {
    const result = await spawn({ role: 'worker', callsign: 'Canary-pilot' }, { live: false });
    expect(result.invocation.env.FLEET_WORKER_STARTUP_PROMPT).toBeTruthy();
  });

  it('honours an explicit startupPrompt override', async () => {
    const result = await spawn({ role: 'worker', callsign: 'Canary-pilot' }, { live: false, startupPrompt: 'custom-keepalive' });
    expect(result.invocation.env.FLEET_WORKER_STARTUP_PROMPT).toBe('custom-keepalive');
  });

  it('honours an explicit null as a deliberate no-keepalive opt-out (respawn-runner parity)', async () => {
    const result = await spawn({ role: 'worker', callsign: 'Canary-pilot' }, { live: false, startupPrompt: null });
    expect(result.invocation.env.FLEET_WORKER_STARTUP_PROMPT).toBeUndefined();
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
    const execFn = enumExec();
    const supabaseClient = makeFakeSupabase({ sessions: [] });
    const result = await spawn({ role: 'worker', callsign: 'Alpha-5' }, { live: true, currencyRunner: CURRENT_RUNNER, execFn, sleepFn: vi.fn(), supabaseClient });
    // LOAD-BEARING: kill-survival depends on detached:true (OS re-parents the child when the
    // supervisor dies) + stdio:'ignore' (no inherited pipes tie it to the parent). Deleting
    // detached:true from spawn-control.js:147 makes THIS assertion fail (mutation-verified).
    expect(childProcessSpawnSpy).toHaveBeenCalledWith('wt.exe', expect.any(Array), expect.objectContaining({ detached: true, stdio: 'ignore' }));
    expect(fakeChild.unref).toHaveBeenCalled(); // unref'd so it outlives the parent
    expect(result.live).toBe(true);
    expect(result.handle).toBe(131074);
    expect(result.handleCaptureFailed).toBe(false);
  });

  // SD-LEO-INFRA-SESSION-SPAWN-AND-PROMPT-LIBRARY-001-F — MUTATION-KILLING seam test (condition C1).
  //
  // spawn() now asserts the launch contract immediately before the spawner. Without this test that
  // enforcement could be DELETED OUTRIGHT and the entire suite would still pass — the EXEC-phase
  // review demonstrated exactly that. An enforcement that can be silently removed while still being
  // reported as present is the shipped-but-inert shape this SD exists to eliminate, so leaving it
  // unpinned would have reproduced the SD's own defect inside the SD's own fix.
  //
  // Same corrective precedent as tests/unit/fleet/tree-currency.test.js, which added a
  // mutation-killing block for this same function after the identical finding.
  //
  // FLEET_CLAUDE_CMD is the lever because it is the ONE operator-reachable clause today:
  // resolveClaudeCmd returns it verbatim and the token regex requires a claude basename.
  it('C1: spawn() REFUSES a contract-violating invocation — deleting the assert makes this fail', async () => {
    const spawnFn = vi.fn();
    await expect(spawn(
      { role: 'worker', callsign: 'Probe-A' },
      {
        live: true, currencyRunner: CURRENT_RUNNER, spawnFn, execFn: enumExec(), sleepFn: vi.fn(),
        supabaseClient: makeFakeSupabase({ sessions: [] }), skipDedup: true,
        env: { FLEET_CLAUDE_CMD: 'C:\\tools\\node.exe' }, // not a claude launcher token
      },
    )).rejects.toThrow(/LAUNCH CONTRACT VIOLATION/);
    // The refusal must happen BEFORE the process is launched, not be reported after the fact.
    expect(spawnFn).not.toHaveBeenCalled();
  });

  it('C1 control: the SAME call without the override spawns (the refusal is not incidental)', async () => {
    const spawnFn = vi.fn().mockReturnValue({ pid: 4242 });
    const result = await spawn(
      { role: 'worker', callsign: 'Probe-A' },
      {
        live: true, currencyRunner: CURRENT_RUNNER, spawnFn, execFn: enumExec(), sleepFn: vi.fn(),
        supabaseClient: makeFakeSupabase({ sessions: [] }), skipDedup: true,
      },
    );
    expect(spawnFn).toHaveBeenCalledTimes(1);
    expect(result.live).toBe(true);
  });

  it('ADVERSARIAL-REVIEW FIX: merges the captured handle into existing metadata, never overwrites the whole blob', async () => {
    const nowMs = 1_800_000_000_000;
    const child = { pid: 4242 };
    const spawnFn = vi.fn().mockReturnValue(child);
    const execFn = enumExec();
    // FR-3: the child now registers under the SPAWNER-MINTED --session-id, so the row is keyed on
    // that id rather than on the wt.exe launcher pid (which never matched claude_sessions.pid).
    const supabaseClient = makeFakeSupabase({
      sessions: [{
        session_id: MINTED_SESSION_ID, pid: 4242, status: 'active',
        created_at: new Date(nowMs - 5_000).toISOString(), // freshly self-registered, well within the match window
        metadata: { fleet_identity: { callsign: 'Alpha-5' }, role: 'worker' },
      }],
    });
    await spawn({ role: 'worker', callsign: 'Beta-1' }, { live: true, currencyRunner: CURRENT_RUNNER, spawnFn, execFn, sleepFn: vi.fn(), supabaseClient, nowMs, skipDedup: true, uuidFn: () => MINTED_SESSION_ID });
    const merged = supabaseClient._store.get(MINTED_SESSION_ID).metadata;
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
    const execFn = enumExec();
    const supabaseClient = makeFakeSupabase({
      sessions: [{
        session_id: 's-old', pid: 4242, status: 'active',
        created_at: new Date(nowMs - 60 * 60 * 1000).toISOString(), // an hour old -- a different, unrelated session that happens to share the recycled OS pid
        metadata: { fleet_identity: { callsign: 'Unrelated-Session' }, role: 'worker' },
      }],
    });
    // FR-3: a valid minted id makes the bind a direct session_id lookup that never consults pid, which
    // would make this test pass VACUOUSLY. uuidFn returns a non-UUID so buildSessionLaunch drops it
    // (the CLI would reject a malformed --session-id) and spawn falls back to the pid path — which is
    // exactly the path whose freshness window this test exists to guard. Keeps its teeth.
    await spawn({ role: 'worker', callsign: 'Beta-1' }, { live: true, currencyRunner: CURRENT_RUNNER, spawnFn, execFn, sleepFn: vi.fn(), supabaseClient, nowMs, skipDedup: true, uuidFn: () => 'not-a-uuid' });
    // Untouched -- the stale row's metadata must never be corrupted by a fresh spawn's recycled pid.
    expect(supabaseClient._store.get('s-old').metadata).toEqual({ fleet_identity: { callsign: 'Unrelated-Session' }, role: 'worker' });
  });

  it('FR-5: skips (never double-spawns) a callsign that already has a live session', async () => {
    const spawnFn = vi.fn();
    const supabaseClient = makeFakeSupabase({
      sessions: [{ session_id: 's1', status: 'active', metadata: { fleet_identity: { callsign: 'Alpha-5' } } }],
    });
    const result = await spawn({ role: 'worker', callsign: 'Alpha-5' }, { live: true, currencyRunner: CURRENT_RUNNER, spawnFn, supabaseClient });
    expect(result.skipped).toBe(true);
    expect(spawnFn).not.toHaveBeenCalled();
  });

  it('FR-5: skipDedup:true (internal replacement path) bypasses the already-live check', async () => {
    const child = { pid: 4242 };
    const spawnFn = vi.fn().mockReturnValue(child);
    const execFn = enumExec();
    const supabaseClient = makeFakeSupabase({
      sessions: [{ session_id: 's1', status: 'active', metadata: { fleet_identity: { callsign: 'Alpha-5' } } }],
    });
    const result = await spawn({ role: 'worker', callsign: 'Alpha-5' }, { live: true, currencyRunner: CURRENT_RUNNER, spawnFn, execFn, sleepFn: vi.fn(), supabaseClient, skipDedup: true });
    expect(result.skipped).toBeUndefined();
    expect(spawnFn).toHaveBeenCalled();
  });

  // --- QF-20260724-739: fresh-spawn must bind session_id, not report it as null ---

  it('QF-20260724-739: binds session_id from the SessionStart-registered row, in BOTH the return value and the fleet_verb_spawn event (not hardcoded null)', async () => {
    const nowMs = 1_800_000_000_000;
    const child = { pid: 4242 };
    const spawnFn = vi.fn().mockReturnValue(child);
    const execFn = enumExec();
    const supabaseClient = makeFakeSupabase({
      sessions: [{
        session_id: MINTED_SESSION_ID, pid: 4242, status: 'active',
        created_at: new Date(nowMs - 5_000).toISOString(),
        metadata: { fleet_identity: { callsign: 'Beta-1' }, role: 'worker' },
      }],
    });
    logCoordinationEvent.mockClear();
    const result = await spawn({ role: 'worker', callsign: 'Beta-1' }, { live: true, currencyRunner: CURRENT_RUNNER, spawnFn, execFn, sleepFn: vi.fn(), supabaseClient, nowMs, skipDedup: true, uuidFn: () => MINTED_SESSION_ID });

    expect(result.session_id).toBe(MINTED_SESSION_ID);
    const spawnEventCall = logCoordinationEvent.mock.calls.find((c) => c[1].event_type === 'fleet_verb_spawn');
    expect(spawnEventCall).toBeTruthy();
    expect(spawnEventCall[1].session_id).toBe(MINTED_SESSION_ID); // was hardcoded null before QF-20260724-739
  });

  it('FR-3: binds by the MINTED session id, not by the wt.exe launcher pid', async () => {
    // The regression this pins: reverting to a pid join re-breaks correlation silently. The row here
    // carries a DIFFERENT pid than the launcher reports, which is the real-world case -- wt.exe exits
    // and claude_sessions.pid is the Claude Code pid. A pid-based bind finds nothing; the minted-id
    // bind finds the row.
    const nowMs = 1_800_000_000_000;
    const supabaseClient = makeFakeSupabase({
      sessions: [{
        session_id: MINTED_SESSION_ID, pid: 999999, status: 'active',
        created_at: new Date(nowMs - 5_000).toISOString(),
        metadata: {},
      }],
    });
    const result = await spawn({ role: 'worker', callsign: 'Beta-1' }, {
      live: true, currencyRunner: CURRENT_RUNNER, spawnFn: vi.fn().mockReturnValue({ pid: 4242 }),
      execFn: enumExec(),
      sleepFn: vi.fn(), supabaseClient, nowMs, skipDedup: true, uuidFn: () => MINTED_SESSION_ID,
    });
    expect(result.session_id).toBe(MINTED_SESSION_ID);
  });

  it('FR-1/FR-3: stamps metadata.account_profile on the FRESH-spawn path (the discoverability fix)', async () => {
    // Before this, accountProfile was used only to resolve a profile DIRECTORY (spawn-control.js:162)
    // and never written, while the sole writer (canary-guard.js:173) sat on the RESPAWN path and was
    // itself pid-dead. Net effect: zero sessions carried the stamp and resolveCanaryTarget fail-closed
    // even with canaries alive -- survival was sufficient, discoverability was not.
    const nowMs = 1_800_000_000_000;
    const supabaseClient = makeFakeSupabase({
      sessions: [{
        session_id: MINTED_SESSION_ID, pid: 4242, status: 'active',
        created_at: new Date(nowMs - 5_000).toISOString(),
        metadata: { fleet_identity: { callsign: 'Canary-1' } },
      }],
    });
    await spawn({ role: 'worker', callsign: 'Canary-1', accountProfile: 'canary' }, {
      live: true, currencyRunner: CURRENT_RUNNER, spawnFn: vi.fn().mockReturnValue({ pid: 4242 }),
      execFn: enumExec(),
      sleepFn: vi.fn(), supabaseClient, nowMs, skipDedup: true, uuidFn: () => MINTED_SESSION_ID,
      baseDir: 'C:/fake', // resolveProfileDir(name, opts) honours opts.baseDir — no FLEET_* env needed
    });
    const md = supabaseClient._store.get(MINTED_SESSION_ID).metadata;
    expect(md.account_profile).toBe('canary');
    expect(md.fleet_identity).toEqual({ callsign: 'Canary-1' }); // merged, not replaced
  });

  it('FR-4: takes the BEFORE snapshot strictly BEFORE launching the process (call-order pin)', async () => {
    // THE most important test in FR-4, and the one the pure diff tests cannot give us. If the
    // before-snapshot is taken AFTER the spawn, the set difference is always empty in production
    // while every pure selectNewWindowHandle test still passes -- green and dead. Only an ordering
    // assertion catches that, so this records the real interleaving rather than each call in isolation.
    const order = [];
    const supabaseClient = makeFakeSupabase({ sessions: [] });
    await spawn({ role: 'worker', callsign: 'Beta-1' }, {
      live: true, currencyRunner: CURRENT_RUNNER,
      enumerateWindowsFn: async () => { order.push('enumerate'); return []; },
      spawnFn: () => { order.push('spawn'); return { pid: 4242 }; },
      captureNewWindowHandleFn: async () => { order.push('capture'); return { handle: 1, handleCaptureFailed: false, attempts: 1, diagnostics: {} }; },
      sleepFn: vi.fn(), supabaseClient, skipDedup: true, uuidFn: () => MINTED_SESSION_ID,
    });
    expect(order).toEqual(['enumerate', 'spawn', 'capture']);
    expect(order.indexOf('enumerate')).toBeLessThan(order.indexOf('spawn'));
  });

  it('FR-4: persists the capture DIAGNOSIS into metadata when the handle cannot be resolved', async () => {
    // So the one permitted live run is a diagnosis, not a re-run: the counts distinguish "nothing
    // opened" from "the process filter excluded everything" from "too many opened at once".
    const nowMs = 1_800_000_000_000;
    const supabaseClient = makeFakeSupabase({
      sessions: [{
        session_id: MINTED_SESSION_ID, pid: 4242, status: 'active',
        created_at: new Date(nowMs - 5_000).toISOString(), metadata: {},
      }],
    });
    await spawn({ role: 'worker', callsign: 'Beta-1' }, {
      live: true, currencyRunner: CURRENT_RUNNER,
      spawnFn: vi.fn().mockReturnValue({ pid: 4242 }),
      enumerateWindowsFn: async () => [],
      captureNewWindowHandleFn: async () => ({
        handle: null, handleCaptureFailed: true, attempts: 1,
        diagnostics: { reason: 'ambiguous', beforeCount: 1, afterCount: 3, appearedCount: 2 },
      }),
      sleepFn: vi.fn(), supabaseClient, nowMs, skipDedup: true, uuidFn: () => MINTED_SESSION_ID,
    });
    const md = supabaseClient._store.get(MINTED_SESSION_ID).metadata;
    expect(md.handle_capture_failed).toBe(true);
    expect(md.window_handle_diagnostics).toMatchObject({ reason: 'ambiguous', appearedCount: 2 });
  });

  it('FR-4: does NOT persist diagnostics on a SUCCESSFUL capture (noise, not signal)', async () => {
    const nowMs = 1_800_000_000_000;
    const supabaseClient = makeFakeSupabase({
      sessions: [{
        session_id: MINTED_SESSION_ID, pid: 4242, status: 'active',
        created_at: new Date(nowMs - 5_000).toISOString(), metadata: {},
      }],
    });
    await spawn({ role: 'worker', callsign: 'Beta-1' }, {
      live: true, currencyRunner: CURRENT_RUNNER, spawnFn: vi.fn().mockReturnValue({ pid: 4242 }),
      enumerateWindowsFn: async () => [],
      captureNewWindowHandleFn: async () => ({ handle: 777, handleCaptureFailed: false, attempts: 1, diagnostics: { reason: 'ok' } }),
      sleepFn: vi.fn(), supabaseClient, nowMs, skipDedup: true, uuidFn: () => MINTED_SESSION_ID,
    });
    const md = supabaseClient._store.get(MINTED_SESSION_ID).metadata;
    expect(md.window_handle).toBe(777);
    expect(md.window_handle_diagnostics).toBeUndefined();
  });

  it('CALLSIGN MINT: stamps fleet_identity.callsign for a canary so assertCanaryTarget can pass', async () => {
    // The SECOND conjunct. assertCanaryTarget requires account_profile==='canary' AND a 'Canary-'
    // callsign. FR-3 stamped only the first, so the live canary came back DISCOVERABLE but
    // not_canary_callsign — half a predicate, and every CP3 target-scoped leg still rejected it.
    // stampRespawnedCanary cannot supply this: it is a CARRY-FORWARD whose callsign comes from the
    // target's CURRENT canary identity, which is null on a first provisioning.
    const nowMs = 1_800_000_000_000;
    const supabaseClient = makeFakeSupabase({
      sessions: [{
        session_id: MINTED_SESSION_ID, pid: 4242, status: 'active',
        created_at: new Date(nowMs - 5_000).toISOString(),
        metadata: { role: 'worker' },
      }],
    });
    await spawn({ role: 'worker', callsign: 'Canary-pilot', accountProfile: 'canary' }, {
      live: true, currencyRunner: CURRENT_RUNNER, spawnFn: vi.fn().mockReturnValue({ pid: 4242 }),
      execFn: enumExec(), sleepFn: vi.fn(), supabaseClient, nowMs, skipDedup: true,
      uuidFn: () => MINTED_SESSION_ID, baseDir: 'C:/fake',
    });
    const md = supabaseClient._store.get(MINTED_SESSION_ID).metadata;
    expect(md.account_profile).toBe('canary');
    expect(md.fleet_identity.callsign).toBe('Canary-pilot'); // both conjuncts now satisfiable
    expect(md.role).toBe('worker');                          // merged, not clobbered
  });

  it('CALLSIGN MINT: NEVER stamps a callsign for an ordinary worker', async () => {
    // Load-bearing safety property. Ordinary callsigns come from the coordinator's SET_IDENTITY and
    // the tier-band scheme; minting one here would pre-empt that authority and collide with
    // assign-fleet-identities. An over-broad mint would look harmless in this test file and cause a
    // fleet-wide identity fight.
    const nowMs = 1_800_000_000_000;
    const supabaseClient = makeFakeSupabase({
      sessions: [{
        session_id: MINTED_SESSION_ID, pid: 4242, status: 'active',
        created_at: new Date(nowMs - 5_000).toISOString(), metadata: {},
      }],
    });
    await spawn({ role: 'worker', callsign: 'Bravo' }, {
      live: true, currencyRunner: CURRENT_RUNNER, spawnFn: vi.fn().mockReturnValue({ pid: 4242 }),
      execFn: enumExec(), sleepFn: vi.fn(), supabaseClient, nowMs, skipDedup: true,
      uuidFn: () => MINTED_SESSION_ID,
    });
    expect(supabaseClient._store.get(MINTED_SESSION_ID).metadata.fleet_identity).toBeUndefined();
  });

  it('CALLSIGN MINT: a canary PROFILE with a non-canary slot name mints NOTHING', async () => {
    // Defence in depth against the gap the coordinator flagged: selectCanarySlot enforces the profile
    // but NOT the namespace, so a slot marked canary yet named "Bravo" must not mint a NATO callsign
    // into the canary namespace check. It stays discoverable-but-untargetable, and canary-provision
    // warns — better than silently minting something the guard will reject anyway.
    const nowMs = 1_800_000_000_000;
    const supabaseClient = makeFakeSupabase({
      sessions: [{
        session_id: MINTED_SESSION_ID, pid: 4242, status: 'active',
        created_at: new Date(nowMs - 5_000).toISOString(), metadata: {},
      }],
    });
    await spawn({ role: 'worker', callsign: 'Bravo', accountProfile: 'canary' }, {
      live: true, currencyRunner: CURRENT_RUNNER, spawnFn: vi.fn().mockReturnValue({ pid: 4242 }),
      execFn: enumExec(), sleepFn: vi.fn(), supabaseClient, nowMs, skipDedup: true,
      uuidFn: () => MINTED_SESSION_ID, baseDir: 'C:/fake',
    });
    const md = supabaseClient._store.get(MINTED_SESSION_ID).metadata;
    expect(md.account_profile).toBe('canary');
    expect(md.fleet_identity).toBeUndefined();
  });

  it('CALLSIGN MINT: idempotent — an existing canary callsign is left alone', async () => {
    const nowMs = 1_800_000_000_000;
    const supabaseClient = makeFakeSupabase({
      sessions: [{
        session_id: MINTED_SESSION_ID, pid: 4242, status: 'active',
        created_at: new Date(nowMs - 5_000).toISOString(),
        metadata: { fleet_identity: { callsign: 'Canary-9', color: 'yellow' } },
      }],
    });
    await spawn({ role: 'worker', callsign: 'Canary-pilot', accountProfile: 'canary' }, {
      live: true, currencyRunner: CURRENT_RUNNER, spawnFn: vi.fn().mockReturnValue({ pid: 4242 }),
      execFn: enumExec(), sleepFn: vi.fn(), supabaseClient, nowMs, skipDedup: true,
      uuidFn: () => MINTED_SESSION_ID, baseDir: 'C:/fake',
    });
    const fi = supabaseClient._store.get(MINTED_SESSION_ID).metadata.fleet_identity;
    expect(fi.callsign).toBe('Canary-9'); // carry-forward wins over a re-mint
    expect(fi.color).toBe('yellow');
  });

  it('the duplicated canary constants agree with canary-guard (cycle-forced duplication must not drift)', async () => {
    // spawn-control cannot import canary-guard (canary-guard imports stop/restart/relaunch from here,
    // so it would be a cycle), hence the local copies. This pins them against the canonical source so
    // a rename in one place is caught rather than silently diverging.
    const mod = await import('../../../lib/fleet/spawn-control.js');
    const guard = await import('../../../lib/fleet/canary-guard.js');
    expect(guard.isCanaryCallsign(`${mod.CANARY_CALLSIGN_PREFIX}1`)).toBe(true);
    expect(guard.isCanaryCallsign('Bravo')).toBe(false);
    expect(mod.CANARY_PROFILE).toBe('canary');
    // SD-LEO-INFRA-SESSION-SPAWN-AND-PROMPT-LIBRARY-001-E FR-4: the trigger key is duplicated here for
    // the same cycle reason, so it joins the same drift pin — against the canonical module this time,
    // since that is what READS the key out of metadata. A rename on either side breaks this.
    expect(mod.CANARY_TRIGGER_KEY).toBe(canarySession.CANARY_TRIGGER_KEY);
    expect(canarySession.isCanaryMetadata({ [mod.CANARY_TRIGGER_KEY]: true })).toBe(true);
  });

  it('FR-4: the stamped trigger key is REACHABLE — a canary spawn writes it into metadata', async () => {
    // A VALIDATION review found CANARY_TRIGGER_KEY was read by isCanaryMetadata and mirrored into the
    // marker payload but written to claude_sessions.metadata NOWHERE — an unreachable disjunct, which is
    // exactly what canary-session.js's own header forbids. This asserts the write happens, so the
    // disjunct cannot silently become decorative again.
    const nowMs = 1_800_000_000_000;
    const supabaseClient = makeFakeSupabase({
      sessions: [{ session_id: MINTED_SESSION_ID, pid: 4242, status: 'active', created_at: new Date(nowMs).toISOString(), metadata: {} }],
    });
    await spawn({ role: 'worker', callsign: 'Canary-pilot', accountProfile: 'canary' }, {
      live: true, spawnFn: vi.fn(() => ({ pid: 4242, unref: vi.fn() })), supabaseClient,
      currencyRunner: CURRENT_RUNNER, execFn: enumExec(), sleepFn: vi.fn(), nowMs,
      baseDir: 'C:\\fleet\\profiles', uuidFn: () => MINTED_SESSION_ID,
    });
    const md = supabaseClient._store.get(MINTED_SESSION_ID).metadata;
    expect(md[canarySession.CANARY_TRIGGER_KEY]).toBe(true);
    expect(canarySession.isCanaryMetadata(md)).toBe(true);
  });

  it('FR-4 NEGATIVE CONTROL: an ORDINARY spawn does not get the trigger key', async () => {
    // Without this the stamp could be unconditional, marking every worker a canary — which the claim
    // fence would then read as "nobody may claim anything".
    const nowMs = 1_800_000_000_000;
    const supabaseClient = makeFakeSupabase({
      sessions: [{ session_id: MINTED_SESSION_ID, pid: 4242, status: 'active', created_at: new Date(nowMs).toISOString(), metadata: {} }],
    });
    await spawn({ role: 'worker', callsign: 'Bravo' }, {
      live: true, spawnFn: vi.fn(() => ({ pid: 4242, unref: vi.fn() })), supabaseClient,
      currencyRunner: CURRENT_RUNNER, execFn: enumExec(), sleepFn: vi.fn(), nowMs,
      uuidFn: () => MINTED_SESSION_ID,
    });
    const md = supabaseClient._store.get(MINTED_SESSION_ID).metadata;
    expect(md[canarySession.CANARY_TRIGGER_KEY]).toBeUndefined();
    expect(canarySession.isCanaryMetadata(md)).toBe(false);
  });

  it('FR-1/FR-3: does NOT stamp account_profile when none was requested', async () => {
    const nowMs = 1_800_000_000_000;
    const supabaseClient = makeFakeSupabase({
      sessions: [{
        session_id: MINTED_SESSION_ID, pid: 4242, status: 'active',
        created_at: new Date(nowMs - 5_000).toISOString(), metadata: {},
      }],
    });
    await spawn({ role: 'worker', callsign: 'Beta-1' }, {
      live: true, currencyRunner: CURRENT_RUNNER, spawnFn: vi.fn().mockReturnValue({ pid: 4242 }),
      execFn: enumExec(),
      sleepFn: vi.fn(), supabaseClient, nowMs, skipDedup: true, uuidFn: () => MINTED_SESSION_ID,
    });
    expect(supabaseClient._store.get(MINTED_SESSION_ID).metadata.account_profile).toBeUndefined();
  });

  it('QF-20260724-739: retries the session-bind lookup (bounded) when the SessionStart row has not landed yet on the first attempt', async () => {
    const nowMs = 1_800_000_000_000;
    const child = { pid: 4242 };
    const spawnFn = vi.fn().mockReturnValue(child);
    const execFn = enumExec();
    let lookups = 0;
    const supabaseClient = {
      from(table) {
        if (table === 'claude_sessions') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => {
                  lookups++;
                  // Row only "appears" (self-registers) on the 2nd lookup.
                  if (lookups < 2) return { data: null };
                  return { data: { session_id: 's-late', metadata: {}, created_at: new Date(nowMs - 100).toISOString() } };
                },
              }),
            }),
            update: () => ({ eq: async () => ({ error: null }) }),
          };
        }
        if (table === 'session_coordination') return { select: () => ({ eq: () => ({ gte: async () => ({ count: 0 }) }) }) };
        throw new Error(`unexpected table: ${table}`);
      },
    };
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const result = await spawn({ role: 'worker', callsign: 'Beta-1' }, { live: true, currencyRunner: CURRENT_RUNNER, spawnFn, execFn, sleepFn, supabaseClient, nowMs, skipDedup: true });

    expect(lookups).toBe(2);
    expect(sleepFn).toHaveBeenCalledTimes(1); // slept once between attempt 1 and attempt 2
    expect(result.session_id).toBe('s-late');
  });

  it('QF-20260724-739: gives up cleanly (session_id stays null, no throw) when the SessionStart row never lands within the bounded retry budget', async () => {
    const child = { pid: 4242 };
    const spawnFn = vi.fn().mockReturnValue(child);
    const execFn = enumExec();
    const supabaseClient = makeFakeSupabase({ sessions: [] }); // never self-registers
    const result = await spawn({ role: 'worker', callsign: 'Beta-1' }, { live: true, currencyRunner: CURRENT_RUNNER, spawnFn, execFn, sleepFn: vi.fn(), supabaseClient, skipDedup: true });

    expect(result.session_id).toBeNull();
    expect(result.live).toBe(true); // spawn itself still succeeded -- only the session-bind is unresolved
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
    const execFn = enumExec();
    const supabaseClient = makeFakeSupabase({
      sessions: [{ session_id: 's1', status: 'active', metadata: { fleet_identity: { callsign: 'Alpha-5' }, role: 'worker' } }],
    });
    const result = await restart('Alpha-5', { supabaseClient, live: true, currencyRunner: CURRENT_RUNNER, spawnFn, execFn, sleepFn: vi.fn() });
    expect(result.ok).toBe(true);
    expect(result.role).toBe('worker');
    expect(sequenceSingletonRefresh).not.toHaveBeenCalled();
    expect(supabaseClient._store.get('s1').status).toBe('released');
  });

  // SD-LEO-INFRA-SESSION-SPAWN-AND-PROMPT-LIBRARY-001-E (FR-5 / FR-6).
  it('FR-5: threads the old session account_profile into the replacement (was DROPPED)', async () => {
    // Asserting the value that REACHES the child launch, not merely that spawnReplacement was
    // called — a "was called" assertion passes against the exact bug this fixes. accountProfile
    // drives CLAUDE_CONFIG_DIR isolation, so the proof is that the profile dir lands in the env.
    const spawnFn = vi.fn().mockReturnValue({ pid: 5150 });
    const supabaseClient = makeFakeSupabase({
      sessions: [{ session_id: 's1', status: 'active', metadata: { fleet_identity: { callsign: 'Canary-1' }, role: 'worker', account_profile: 'canary' } }],
    });

    const result = await restart('Canary-1', {
      supabaseClient, live: true, currencyRunner: CURRENT_RUNNER, spawnFn, execFn: enumExec(),
      sleepFn: vi.fn(), baseDir: 'C:\\fleet\\profiles',
    });

    expect(result.ok).toBe(true);
    const env = spawnFn.mock.calls[0][2]; // spawnFn(program, args, env) — arg[2] IS the env
    expect(env.CLAUDE_CONFIG_DIR).toBe('C:\\fleet\\profiles\\canary');
  });

  it('FR-5: a session with NO account_profile still restarts normally (negative control)', async () => {
    // Proves the threading is conditional, not a blanket requirement — otherwise every ordinary
    // worker restart would start demanding a profile dir.
    const spawnFn = vi.fn().mockReturnValue({ pid: 5151 });
    const supabaseClient = makeFakeSupabase({
      sessions: [{ session_id: 's1', status: 'active', metadata: { fleet_identity: { callsign: 'Alpha-5' }, role: 'worker' } }],
    });

    const result = await restart('Alpha-5', {
      supabaseClient, live: true, currencyRunner: CURRENT_RUNNER, spawnFn, execFn: enumExec(), sleepFn: vi.fn(),
    });

    expect(result.ok).toBe(true);
    const env = spawnFn.mock.calls[0][2]; // spawnFn(program, args, env) — arg[2] IS the env
    expect(env.CLAUDE_CONFIG_DIR).toBeUndefined();
  });

  it('FR-6: restarting a profile-stamped session with NO profiles dir configured FAILS LOUD', async () => {
    // The behaviour change this FR accepts deliberately. resolveProfileDir throws when
    // FLEET_ACCOUNT_PROFILES_DIR is unset; restart() never reached that path before. Measured
    // blast radius: 1 of 16 live sessions carries account_profile, and it is the canary. Degrading
    // to the un-isolated path instead would silently reinstate the defect FR-5 fixes — a canary
    // without its profile isolation is not a canary.
    const spawnFn = vi.fn().mockReturnValue({ pid: 5152 });
    const supabaseClient = makeFakeSupabase({
      sessions: [{ session_id: 's1', status: 'active', metadata: { fleet_identity: { callsign: 'Canary-1' }, role: 'worker', account_profile: 'canary' } }],
    });

    await expect(restart('Canary-1', {
      supabaseClient, live: true, currencyRunner: CURRENT_RUNNER, spawnFn, execFn: enumExec(),
      sleepFn: vi.fn(), baseDir: null,
    })).rejects.toThrow(/FLEET_ACCOUNT_PROFILES_DIR/);
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

  // QF-20260724-335: an explicit opts.sdKey must be stamped on the fleet_verb_restart event so a set
  // of CP3 drill legs can be attributed to one intentional run (Solomon S7 acceptance).
  it('threads opts.sdKey through to the emitted fleet_verb_restart event (QF-20260724-335)', async () => {
    logCoordinationEvent.mockClear();
    const child = { pid: 5151 };
    const spawnFn = vi.fn().mockReturnValue(child);
    const execFn = enumExec();
    const supabaseClient = makeFakeSupabase({
      sessions: [{ session_id: 's1', status: 'active', metadata: { fleet_identity: { callsign: 'Alpha-5' }, role: 'worker' } }],
    });
    await restart('Alpha-5', { supabaseClient, live: true, currencyRunner: CURRENT_RUNNER, spawnFn, execFn, sleepFn: vi.fn(), sdKey: 'CHECKPOINT-3' });
    const [, eventArg] = logCoordinationEvent.mock.calls.at(-1);
    expect(eventArg.event_type).toBe('fleet_verb_restart');
    expect(eventArg.sd_key).toBe('CHECKPOINT-3');
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
    const execFn = enumExec();
    const supabaseClient = makeFakeSupabase({
      sessions: [
        { session_id: 's1', status: 'active', metadata: { fleet_identity: { callsign: 'Alpha-5' }, role: 'worker' } },
        { session_id: 's2', status: 'active', metadata: { fleet_identity: { callsign: 'Alpha-6' }, role: 'worker' } },
      ],
    });
    const result = await relaunchUnderProfile('Alpha-5', 'account_b', { supabaseClient, baseDir: 'C:\\profiles', live: true, currencyRunner: CURRENT_RUNNER, spawnFn, execFn, sleepFn: vi.fn() });
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
    await expect(relaunchUnderProfile('Alpha-5', 'account_b', { supabaseClient, baseDir: 'C:\\profiles', live: true, currencyRunner: CURRENT_RUNNER, spawnFn, execFn: vi.fn().mockResolvedValue({ stdout: '0' }), sleepFn: vi.fn() }))
      .rejects.toThrow(/isolation invariant violated/);
    delete process.env.CLAUDE_CONFIG_DIR;
  });

  // QF-20260724-335: same run-correlator convention as restart() -- required for the G3/U4 leg's
  // fleet_verb_relaunch_under_profile event to be attributable to the same CP3 run as the other 2 legs.
  it('threads opts.sdKey through to the emitted fleet_verb_relaunch_under_profile event (QF-20260724-335)', async () => {
    logCoordinationEvent.mockClear();
    const child = { pid: 6161 };
    const spawnFn = vi.fn().mockReturnValue(child);
    const execFn = enumExec();
    const supabaseClient = makeFakeSupabase({
      sessions: [{ session_id: 's1', status: 'active', metadata: { fleet_identity: { callsign: 'Alpha-5' }, role: 'worker' } }],
    });
    await relaunchUnderProfile('Alpha-5', 'account_b', { supabaseClient, baseDir: 'C:\\profiles', live: true, currencyRunner: CURRENT_RUNNER, spawnFn, execFn, sleepFn: vi.fn(), sdKey: 'CHECKPOINT-3' });
    const [, eventArg] = logCoordinationEvent.mock.calls.at(-1);
    expect(eventArg.event_type).toBe('fleet_verb_relaunch_under_profile');
    expect(eventArg.sd_key).toBe('CHECKPOINT-3');
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
    const execFn = enumExec();
    const result = await drainAndRestart('Alpha-5', { supabaseClient, nowMs, live: true, currencyRunner: CURRENT_RUNNER, spawnFn, execFn, sleepFn: vi.fn() });
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
