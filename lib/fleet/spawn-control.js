/**
 * Fleet spawn-control -- the SIX governed verbs (spawn/attach/stop/restart/relaunch-under-profile/
 * drain-and-restart), SD-LEO-INFRA-FLEET-SPAWN-CONTROL-001.
 *
 * Composes existing primitives rather than rebuilding them: scripts/fleet/worker-spawn-executor.cjs's
 * spawn-detached pattern, lib/coordinator/singleton-refresh-sequencer.cjs's register-then-retire mutex,
 * lib/fleet/claim-boundary-probe.cjs's idle-boundary probe, and lib/fleet/session-registry-adapter.js's
 * DB adapter over SD-A's pure registry/manifest libs. Adds the three genuinely-new pieces: window-handle
 * capture (window-handle.js), CLAUDE_CONFIG_DIR profile injection, and this six-verb composition layer.
 *
 * SAFETY -- STAGED / INERT BY DEFAULT (mirrors WORKER_SPAWN_EXECUTOR_LIVE, TR-4): the live OS spawn
 * (a visible Windows Terminal process) is default-OFF behind FLEET_SPAWN_CONTROL_LIVE. With the flag
 * unset every verb that would spawn/relaunch a process instead logs the invocation it WOULD run and
 * returns { live:false, invocation }. Flipping the flag on requires the same operator host-validation
 * gate worker-spawn-executor.cjs already documents (the exact wt.exe invocation is host-specific).
 */
import { spawn as spawnProcess } from 'node:child_process';
import path from 'node:path';
import { buildSessionLaunch } from './build-session-launch.cjs';
import {
  resolveLiveSession,
  loadLiveSessionIdentity,
} from './session-registry-adapter.js';
import { resolveSpawnDecisions } from './spawn-executor-core.cjs';
import { captureNewWindowHandle, enumerateWindows, focusWindow } from './window-handle.js';
import { evaluateClaimBoundary } from './claim-boundary-probe.cjs';

const SINGLETON_ROLES = new Set(['coordinator', 'adam', 'solomon']);
const PROFILE_NAME_RE = /^[A-Za-z0-9_-]+$/;

/** Derive a session's role from its metadata (mirrors coordination-events.cjs's own convention). */
export function roleOf(session) {
  const md = (session && session.metadata) || {};
  if (String(md.is_coordinator) === 'true') return 'coordinator';
  if (md.role) return md.role;
  return 'worker';
}

export function isSingletonRole(role) {
  return SINGLETON_ROLES.has(role);
}

/**
 * Resolve an account-profile NAME to a directory under an operator-configured base dir. Rejects
 * anything but a bare alnum/dash/underscore name -- never a raw/absolute/traversal path from card
 * input (TR-5, FR-7 SECURITY acceptance criteria).
 */
export function resolveProfileDir(profileName, opts = {}) {
  const baseDir = opts.baseDir ?? process.env.FLEET_ACCOUNT_PROFILES_DIR ?? null;
  if (!baseDir) throw new Error('resolveProfileDir: FLEET_ACCOUNT_PROFILES_DIR is not configured');
  if (typeof profileName !== 'string' || !PROFILE_NAME_RE.test(profileName)) {
    throw new Error(`resolveProfileDir: invalid profile name: ${JSON.stringify(profileName)}`);
  }
  // TR-1: this SD is Windows-only infra (baseDir is always a Windows path on the fleet host). Use
  // path.win32 explicitly so the join is correct even when this module runs under CI/tests on a
  // non-Windows runner (path.join maps to path.posix there and would silently forward-slash-join).
  return path.win32.join(baseDir, profileName);
}

/** True only when the operator has explicitly enabled the live OS spawn/relaunch surface. */
export function isLiveEnabled(env = process.env) {
  return String(env.FLEET_SPAWN_CONTROL_LIVE || '').toLowerCase() === 'true';
}

/**
 * Build the host command that WOULD launch a visible Windows Terminal session for a role/callsign,
 * optionally under a switched account profile. Returns a structured command; NEVER executes it here.
 * ⚠️ Host-specific, like worker-spawn-executor.cjs's buildSpawnInvocation -- operator-validate before
 * flipping FLEET_SPAWN_CONTROL_LIVE.
 *
 * SD-LEO-INFRA-LEO-APP-LAUNCHER-001 (FR-2): this now DELEGATES to the canonical buildSessionLaunch —
 * the single source of the launch contract (full claude.cmd path + explicit -d <cwd> repo-root start
 * dir + CLAUDE_CONFIG_DIR + PERSISTENT wt.exe tab + auto-resume, fail-loud). No per-path launch logic
 * lives here anymore. `resumeUuid` still reattaches a captured session; `profileDir` is pre-resolved
 * by spawn() and passed through; the returned invocation additionally carries `cwd`+`persistent`.
 *
 * QF-20260724-290: `startupPrompt` is forwarded too. buildSessionLaunch has always destructured it
 * (and sets childEnv.FLEET_WORKER_STARTUP_PROMPT — the persistent replacement for headless -p), but
 * this hop did not, so a caller-supplied keepalive prompt was silently DISCARDED here and the launched
 * session came up with nothing to do: it heartbeat once and ghosted.
 */
export function buildLiveSpawnInvocation({ role, callsign, profileDir, resumeUuid, cwd, sdToResume, startupPrompt, sessionId } = {}, opts = {}) {
  // FR-3: sessionId/uuidFn forwarded so the minted id is injectable (deterministic tests) rather
  // than only reachable through crypto.randomUUID inside the builder.
  return buildSessionLaunch({ role, callsign, profileDir, resumeUuid, cwd, sdToResume, startupPrompt, sessionId }, opts);
}

/**
 * QF-20260725-757: the canonical keepalive prompt, mirroring reboot-respawn-runner.js's private
 * helper of the same name. Lazy dynamic import keeps this ESM module free of a load-time dependency
 * on the .cjs coordination-events surface (same idiom as the respawn runner).
 */
async function defaultStartupPrompt() {
  const { FLEET_WORKER_STARTUP_PROMPT } = await import('../coordinator/coordination-events.cjs');
  return FLEET_WORKER_STARTUP_PROMPT;
}

/**
 * Restricted event payload -- HARD-LOCKED to exactly {verb, outcome, at}, never
 * CLAUDE_CONFIG_DIR/profile paths/argv (FR-9, TR-6). No extension point: a future verb needing a
 * new field must widen this allowlist explicitly here, never spread arbitrary caller data through.
 */
function verbEventPayload({ verb, outcome }) {
  return { verb, outcome, at: new Date().toISOString() };
}

async function emitVerbEvent(supabase, { verb, session_id, outcome, sdKey }) {
  try {
    const { logCoordinationEvent } = await import('../coordinator/coordination-events.cjs');
    await logCoordinationEvent(supabase, {
      event_type: `fleet_verb_${verb}`,
      session_id: session_id ?? null,
      // QF-20260724-335: an explicit, intentional run-correlator (opt-in via opts.sdKey, e.g.
      // 'CHECKPOINT-3') so a set of drill-run events can be attributed to one invocation --
      // timing/session-proximity alone is insufficient (a stray dry-run batch can collide with a
      // real run). Defaults to null (unchanged behavior for every existing non-drill caller).
      sd_key: sdKey ?? null,
      payload: verbEventPayload({ verb, outcome }),
    });
  } catch { /* fail-open: event emission never blocks a verb outcome */ }
}

/**
 * FR-1: spawn a detached, visible session + capture its window handle. FR-5: dedup-by-callsign via
 * the SAME decision logic worker-spawn-executor.cjs already uses (resolveSpawnDecisions) -- never
 * spawn a callsign that's already live, whether this call came from restart()'s worker path or a
 * direct spawn() invocation.
 */
export async function spawn({ role, callsign, accountProfile } = {}, opts = {}) {
  const supabase = opts.supabaseClient;
  const live = opts.live ?? isLiveEnabled();
  const log = opts.log || (() => {});
  // QF-20260725-757: spawn() is the THIRD hop of the QF-20260724-290 keepalive drop. That QF fixed
  // buildLiveSpawnInvocation (L82) and reboot-respawn-runner, but spawn() still built its invocation
  // with no startupPrompt at all, so every session created through the generic spawn verb came up
  // with nothing to do, heartbeat once, and ghosted. Same opt-out semantics as the respawn runner
  // (reboot-respawn-runner.js:137): absent => canonical prompt, explicit null => deliberately none.
  const startupPrompt = ('startupPrompt' in opts) ? opts.startupPrompt : await defaultStartupPrompt();

  // ADVERSARIAL-REVIEW NOTE (known, accepted limitation): this dedup check reads liveCallsigns at a
  // point in time with no reservation/lock written before the OS spawn -- two near-simultaneous calls
  // for the same callsign can both observe "not live yet" and both proceed. This is the SAME inherent
  // TOCTOU shape worker-spawn-executor.cjs's own resolveSpawnDecisions() already has (this surface
  // reuses it rather than adding a new one); acceptable for a default-OFF, low-concurrency control
  // surface, not a regression introduced here.
  if (supabase && callsign && opts.skipDedup !== true) {
    const { callsignBySession } = await loadLiveSessionIdentity(supabase);
    const liveCallsigns = new Set(Object.values(callsignBySession));
    const decision = resolveSpawnDecisions({
      pendingRequests: [{ id: 'spawn-verb', requested_callsign: callsign, status: 'pending', requested_at: new Date().toISOString() }],
      liveCallsigns,
      nowMs: opts.nowMs ?? Date.now(),
      perTickCap: 1,
    });
    if (decision.toSpawn.length === 0) {
      const reason = (decision.skipped[0] && decision.skipped[0].reason) || 'already_live';
      log(`[spawn-control] skip spawn for ${callsign}: ${reason}`);
      await emitVerbEvent(supabase, { verb: 'spawn', outcome: `skipped:${reason}` });
      return { live: false, skipped: true, reason };
    }
  }

  let profileDir = null;
  if (accountProfile) profileDir = resolveProfileDir(accountProfile, opts);
  const invocation = buildLiveSpawnInvocation({ role, callsign, profileDir, startupPrompt }, opts);

  if (!live) {
    log(`[spawn-control] DRY-RUN would spawn ${role}/${callsign}: ${invocation.program} ${invocation.args.join(' ')}`);
    await emitVerbEvent(supabase, { verb: 'spawn', outcome: 'dry_run' });
    return { live: false, invocation };
  }

  const spawner = opts.spawnFn || ((program, args, env) => {
    // FR-2: carry the invocation's repo-root cwd (paired with new-tab -d) so the session registers in claude_sessions.
    // Strip the spawner's OWN Claude Code session markers before inheriting. These identify the
    // PARENT session; carrying them into an independent fleet session makes Claude Code treat it
    // as a child, which switches off session persistence so it never registers. Setting the
    // override in childEnv is not sufficient on its own — the stale marker must actually be gone.
    const inherited = { ...process.env };
    for (const k of ['CLAUDE_CODE_CHILD_SESSION', 'CLAUDE_SESSION_ID', 'CLAUDE_CODE_SESSION_ID']) {
      delete inherited[k];
    }
    const child = spawnProcess(program, args, { detached: true, stdio: 'ignore', cwd: invocation.cwd, env: { ...inherited, ...env } });
    child.unref();
    return child;
  });

  // FR-4: the BEFORE snapshot must be taken BEFORE the process launches. Ordering this after the
  // spawn would make the set difference always empty while every pure unit test still passed --
  // green-and-dead, the failure mode this SD exists to close. Enumeration is read-only and
  // fail-soft: on error it yields [], which degrades to no_new_window rather than a wrong handle.
  const enumerate = opts.enumerateWindowsFn || enumerateWindows;
  const beforeWindows = await enumerate(opts);

  const child = spawner(invocation.program, invocation.args, invocation.env);
  const pid = child && child.pid;

  // FR-4: capture by set difference, not by (Get-Process -Id <launcher pid>).MainWindowHandle.
  // wt.exe hands the tab to the running WindowsTerminal.exe host and exits, so that query ran
  // against a dead process and could only ever fail; and MainWindowHandle is per-PROCESS, so it
  // cannot name one session's window among the many sharing a host.
  const captureFn = opts.captureNewWindowHandleFn || captureNewWindowHandle;
  const handleResult = await captureFn(beforeWindows, opts);

  // QF-20260724-739: bind session_id via the spawned process's OWN SessionStart-registered
  // claude_sessions row (matched by pid), independent of window-handle capture success -- a captured
  // handle and a bound session are separate concerns, and S7 acceptance only needs the latter. The
  // prior code resolved this same row but discarded session_id before the event/return below, so
  // every spawn/respawn/relaunch chain reported session_id:null even on a genuine successful bind.
  // A small bounded retry (mirrors window-handle.js's own injectable poll idiom) absorbs the residual
  // race where SessionStart registration lands just after captureWindowHandle's own poll exhausted.
  //
  // SD-LEO-INFRA-LAUNCHER-CAN-HOST-001 FR-3: the pid match above could never succeed. `pid` is the
  // wt.exe LAUNCHER pid, and wt.exe hands the tab to the running WindowsTerminal.exe host and exits
  // immediately, while claude_sessions.pid holds the CLAUDE CODE pid. The freshness window and the
  // 3-attempt retry were both compensating for a join that has no matching rows to find. Now that
  // the spawner MINTS the session id and passes it as --session-id, the child registers under that
  // exact id and correlation is a direct lookup -- no pid, no freshness heuristic (a minted UUID is
  // unique per spawn, so there is no recycling to defend against), no recognition step.
  // The pid path is retained only as a fallback for a caller that supplied no minted id.
  let boundSessionId = null;
  const mintedId = invocation && invocation.sessionId;
  if (supabase && (mintedId || pid)) {
    const sleepFn = opts.sleepFn || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    const nowMs2 = opts.nowMs ?? Date.now();
    const freshMs = opts.pidMatchFreshMs ?? 2 * 60 * 1000;
    const maxAttempts = opts.sessionBindMaxAttempts ?? 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // ADVERSARIAL-REVIEW FIX (data integrity, retained): a bare `.update({ metadata:{...} })`
        // REPLACES the whole metadata JSONB blob -- read the current row first, merge client-side,
        // and only write back to the SAME session_id just read.
        const { data: current } = mintedId
          ? await supabase.from('claude_sessions')
            .select('session_id, metadata, created_at').eq('session_id', mintedId).maybeSingle()
          : await supabase.from('claude_sessions')
            .select('session_id, metadata, created_at').eq('pid', pid).maybeSingle();
        // Freshness guards pid recycling only; a minted id is unique per spawn and needs no window.
        const isFresh = mintedId
          ? true
          : current && current.created_at && (nowMs2 - Date.parse(current.created_at)) <= freshMs;
        if (current && isFresh) {
          boundSessionId = current.session_id;
          // FR-1/FR-3: STAMP account_profile HERE, on the fresh-spawn path. Previously accountProfile
          // was used only to resolve a profile DIRECTORY (L162) and never written, while the sole
          // writer of account_profile (canary-guard.js:173 stampRespawnedCanary) sits on the RESPAWN
          // path and is itself pid-dead. That is why zero sessions in 24h carried the stamp and
          // resolveCanaryTarget(by account_profile) fail-closed even with canaries alive and
          // heartbeating -- survival was sufficient, discoverability was not.
          await supabase.from('claude_sessions').update({
            metadata: {
              ...(current.metadata || {}),
              window_handle: handleResult.handle,
              handle_capture_failed: handleResult.handleCaptureFailed,
              // FR-4: persist the DIAGNOSIS on failure so the one permitted live run yields an answer
              // (nothing opened / filtered everything out / too many opened) instead of a bare retry.
              ...(handleResult.handleCaptureFailed && handleResult.diagnostics
                ? { window_handle_diagnostics: handleResult.diagnostics }
                : {}),
              ...(accountProfile ? { account_profile: accountProfile } : {}),
            },
          }).eq('session_id', current.session_id);
          break;
        }
      } catch { /* fail-soft: try again below, or give up -- a later attach() re-resolves */ }
      if (attempt < maxAttempts) await sleepFn(opts.sessionBindDelayMs ?? 500);
    }
  }

  await emitVerbEvent(supabase, { verb: 'spawn', session_id: boundSessionId, outcome: handleResult.handleCaptureFailed ? 'handle_capture_failed' : 'ok' });
  return { live: true, invocation, pid, session_id: boundSessionId, ...handleResult };
}

/** FR-3: card -> registry -> real terminal window. */
export async function attach(target, opts = {}) {
  const supabase = opts.supabaseClient;
  const by = opts.by || 'callsign';
  const resolution = await resolveLiveSession(supabase, { by, value: target });
  if (!resolution.resolved) {
    await emitVerbEvent(supabase, { verb: 'attach', outcome: `not_resolved:${resolution.reason}` });
    return { ok: false, reason: resolution.reason };
  }

  const { session_id } = resolution.identity;
  const { data: row } = await supabase.from('claude_sessions').select('metadata').eq('session_id', session_id).maybeSingle();
  const handle = row && row.metadata && row.metadata.window_handle;
  if (!handle) {
    await emitVerbEvent(supabase, { verb: 'attach', session_id, outcome: 'no_captured_handle' });
    return { ok: false, reason: 'no_captured_handle', session_id };
  }

  const focused = await focusWindow(handle, opts);
  await emitVerbEvent(supabase, { verb: 'attach', session_id, outcome: focused ? 'ok' : 'stale_handle' });
  return { ok: focused, reason: focused ? null : 'stale_handle', session_id };
}

/** Stop a live session without spawning a replacement. */
export async function stop(target, opts = {}) {
  const supabase = opts.supabaseClient;
  const by = opts.by || 'callsign';
  const resolution = await resolveLiveSession(supabase, { by, value: target });
  if (!resolution.resolved) {
    await emitVerbEvent(supabase, { verb: 'stop', outcome: `not_resolved:${resolution.reason}` });
    return { ok: false, reason: resolution.reason };
  }

  const { session_id } = resolution.identity;
  const { error } = await supabase.from('claude_sessions').update({
    status: 'released', released_at: new Date().toISOString(), released_reason: 'manual_stop',
  }).eq('session_id', session_id);

  await emitVerbEvent(supabase, { verb: 'stop', session_id, outcome: error ? 'db_error' : 'ok' });
  return { ok: !error, session_id };
}

/**
 * Internal: spawn a replacement session under the same role/callsign (shared by restart + relaunch).
 * skipDedup:true -- restart()/relaunchUnderProfile() already resolved ONE specific old session to
 * replace (not a speculative fresh request), so spawn()'s FR-5 already-live dedup would otherwise
 * always skip this (the old session under the same callsign is still live until it's retired).
 */
async function spawnReplacement({ oldIdentity, oldSession, accountProfile }, opts) {
  const role = roleOf(oldSession);
  const callsign = oldIdentity.callsign;
  return spawn({ role, callsign, accountProfile }, { ...opts, skipDedup: true });
}

/** FR-4/FR-5: restart -- role-serial for singletons (via the existing guard), parallel for workers. */
export async function restart(target, opts = {}) {
  const supabase = opts.supabaseClient;
  const by = opts.by || 'callsign';
  const sdKey = opts.sdKey;
  const resolution = await resolveLiveSession(supabase, { by, value: target });
  if (!resolution.resolved) {
    await emitVerbEvent(supabase, { verb: 'restart', outcome: `not_resolved:${resolution.reason}`, sdKey });
    return { ok: false, reason: resolution.reason };
  }

  const oldIdentity = resolution.identity;
  const { data: oldSession } = await supabase.from('claude_sessions').select('metadata').eq('session_id', oldIdentity.session_id).maybeSingle();
  const role = roleOf(oldSession);

  const spawnResult = await spawnReplacement({ oldIdentity, oldSession }, opts);

  if (isSingletonRole(role)) {
    // FR-4: never a bespoke retire-then-spawn sequence -- the EXISTING register-then-retire mutex owns
    // this ordering. sequenceSingletonRefresh only retires the old session once the new one is verified
    // healthy (a live claude_sessions row must exist for newSessionId -- opts.newSessionId lets a live
    // caller supply it once the spawned process self-registers).
    const { sequenceSingletonRefresh } = await import('../coordinator/singleton-refresh-sequencer.cjs');
    if (!opts.newSessionId) {
      await emitVerbEvent(supabase, { verb: 'restart', session_id: oldIdentity.session_id, outcome: 'awaiting_new_session_registration', sdKey });
      return { ok: false, reason: 'awaiting_new_session_registration', spawnResult, role: 'singleton' };
    }
    const seqResult = await sequenceSingletonRefresh(supabase, { newSessionId: opts.newSessionId, oldSessionId: oldIdentity.session_id });
    await emitVerbEvent(supabase, { verb: 'restart', session_id: oldIdentity.session_id, outcome: seqResult.action, sdKey });
    return { ok: seqResult.retired || seqResult.action === 'hold_old', role: 'singleton', spawnResult, seqResult };
  }

  // FR-5: worker restart is parallel-safe by construction -- no shared mutex, resolveSpawnDecisions
  // (inside spawn -> worker-spawn-executor's decision path) already dedupes by callsign.
  //
  // ADVERSARIAL-REVIEW FIX (correctness): NEVER release the old session unless the replacement
  // genuinely spawned live (spawnResult.live === true). In the default (FLEET_SPAWN_CONTROL_LIVE=off)
  // dry-run mode, spawnReplacement() never launches a process -- releasing the old session anyway
  // would silently drop the tracked worker from the registry with no functioning replacement.
  if (!spawnResult || spawnResult.live !== true) {
    await emitVerbEvent(supabase, { verb: 'restart', session_id: oldIdentity.session_id, outcome: 'replacement_not_live', sdKey });
    return { ok: false, reason: 'replacement_not_live', role: 'worker', spawnResult };
  }
  const { error } = await supabase.from('claude_sessions').update({
    status: 'released', released_at: new Date().toISOString(), released_reason: 'restart',
  }).eq('session_id', oldIdentity.session_id);
  await emitVerbEvent(supabase, { verb: 'restart', session_id: oldIdentity.session_id, outcome: error ? 'db_error' : 'ok', sdKey });
  return { ok: !error, role: 'worker', spawnResult };
}

/** FR-7: the ratified account-switch verb -- isolated to the target session only. */
export async function relaunchUnderProfile(target, accountProfile, opts = {}) {
  const supabase = opts.supabaseClient;
  const by = opts.by || 'callsign';
  const sdKey = opts.sdKey;

  // Fail loud before touching anything if the profile doesn't resolve to a safe, allowlisted path.
  resolveProfileDir(accountProfile, opts);

  const resolution = await resolveLiveSession(supabase, { by, value: target });
  if (!resolution.resolved) {
    await emitVerbEvent(supabase, { verb: 'relaunch_under_profile', outcome: `not_resolved:${resolution.reason}`, sdKey });
    return { ok: false, reason: resolution.reason };
  }

  const oldIdentity = resolution.identity;
  const { data: oldSession } = await supabase.from('claude_sessions').select('metadata').eq('session_id', oldIdentity.session_id).maybeSingle();
  const role = roleOf(oldSession);

  // SECURITY (FR-7): CLAUDE_CONFIG_DIR must be isolated to the spawned child's env only -- assert the
  // supervisor's own process.env is untouched by this call, before and after.
  const supervisorConfigDirBefore = process.env.CLAUDE_CONFIG_DIR;
  const spawnResult = await spawnReplacement({ oldIdentity, oldSession, accountProfile }, opts);
  const supervisorConfigDirAfter = process.env.CLAUDE_CONFIG_DIR;
  if (supervisorConfigDirBefore !== supervisorConfigDirAfter) {
    throw new Error('relaunchUnderProfile: supervisor process.env.CLAUDE_CONFIG_DIR changed -- isolation invariant violated');
  }

  if (isSingletonRole(role)) {
    const { sequenceSingletonRefresh } = await import('../coordinator/singleton-refresh-sequencer.cjs');
    if (!opts.newSessionId) {
      await emitVerbEvent(supabase, { verb: 'relaunch_under_profile', session_id: oldIdentity.session_id, outcome: 'awaiting_new_session_registration', sdKey });
      return { ok: false, reason: 'awaiting_new_session_registration', spawnResult, role: 'singleton' };
    }
    const seqResult = await sequenceSingletonRefresh(supabase, { newSessionId: opts.newSessionId, oldSessionId: oldIdentity.session_id });
    await emitVerbEvent(supabase, { verb: 'relaunch_under_profile', session_id: oldIdentity.session_id, outcome: seqResult.action, sdKey });
    return { ok: seqResult.retired || seqResult.action === 'hold_old', role: 'singleton', spawnResult, seqResult };
  }

  // ADVERSARIAL-REVIEW FIX: same guard as restart()'s worker path -- never release the old session
  // unless the replacement genuinely spawned live.
  if (!spawnResult || spawnResult.live !== true) {
    await emitVerbEvent(supabase, { verb: 'relaunch_under_profile', session_id: oldIdentity.session_id, outcome: 'replacement_not_live', sdKey });
    return { ok: false, reason: 'replacement_not_live', role: 'worker', spawnResult };
  }
  const { error } = await supabase.from('claude_sessions').update({
    status: 'released', released_at: new Date().toISOString(), released_reason: 'relaunch_under_profile',
  }).eq('session_id', oldIdentity.session_id);
  await emitVerbEvent(supabase, { verb: 'relaunch_under_profile', session_id: oldIdentity.session_id, outcome: error ? 'db_error' : 'ok', sdKey });
  return { ok: !error, role: 'worker', spawnResult };
}

/**
 * FR-6: drain-and-restart waits for the idle boundary. A single call NEVER busy-waits/sleeps inline --
 * it returns a deferred verdict on MISS/UNKNOWN so the caller (a tick-based scheduler, matching this
 * codebase's own convention for every other evaluateClaimBoundary consumer) re-invokes on its own
 * cadence. Restart only ever fires on a genuine PASS.
 */
export async function drainAndRestart(target, opts = {}) {
  const supabase = opts.supabaseClient;
  const by = opts.by || 'callsign';
  const resolution = await resolveLiveSession(supabase, { by, value: target });
  if (!resolution.resolved) {
    return { ok: false, reason: resolution.reason };
  }

  const { session_id } = resolution.identity;
  const { data: row } = await supabase.from('claude_sessions')
    .select('sd_key, claimed_at, last_tool_at, expected_silence_until, current_tool_expected_end_at')
    .eq('session_id', session_id).maybeSingle();

  let outboundSinceAnchor = 0;
  if (row && row.claimed_at) {
    const { count } = await supabase.from('session_coordination')
      .select('id', { count: 'exact', head: true })
      .eq('sender_session', session_id)
      .gte('created_at', row.claimed_at);
    outboundSinceAnchor = Number.isFinite(count) ? count : 0;
  }

  const verdict = evaluateClaimBoundary({
    nowMs: opts.nowMs ?? Date.now(),
    anchorMs: row && row.claimed_at ? Date.parse(row.claimed_at) : null,
    anchorType: 'claim',
    lastToolAtMs: row && row.last_tool_at ? Date.parse(row.last_tool_at) : null,
    outboundSinceAnchor,
    expectedSilenceUntilMs: row && row.expected_silence_until ? Date.parse(row.expected_silence_until) : null,
    currentToolExpectedEndMs: row && row.current_tool_expected_end_at ? Date.parse(row.current_tool_expected_end_at) : null,
  });

  if (verdict.verdict !== 'PASS') {
    await emitVerbEvent(supabase, { verb: 'drain_and_restart', session_id, outcome: `deferred:${verdict.verdict}` });
    return { ok: false, deferred: true, verdict: verdict.verdict, reason: verdict.reason, session_id };
  }

  const result = await restart(target, opts);
  return { ...result, deferred: false, verdict: 'PASS' };
}
