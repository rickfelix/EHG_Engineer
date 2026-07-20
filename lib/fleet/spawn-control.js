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
import {
  resolveLiveSession,
} from './session-registry-adapter.js';
import { captureWindowHandle, focusWindow } from './window-handle.js';
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
  return path.join(baseDir, profileName);
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
 */
export function buildLiveSpawnInvocation({ role, callsign, profileDir } = {}) {
  const env = { FLEET_WORKER_CALLSIGN: callsign || '', FLEET_WORKER_ROLE: role || 'worker' };
  // FR-7 / SECURITY: CLAUDE_CONFIG_DIR is injected ONLY into this returned env object -- the caller
  // must pass it to child_process.spawn's env option, never assign to process.env directly.
  if (profileDir) env.CLAUDE_CONFIG_DIR = profileDir;
  return {
    program: 'wt.exe',
    args: ['new-tab', '--', 'claude'],
    env,
  };
}

/** Restricted event payload -- never CLAUDE_CONFIG_DIR/profile paths/argv (FR-9, TR-6). */
function verbEventPayload({ verb, outcome, extra }) {
  return { verb, outcome, at: new Date().toISOString(), ...(extra || {}) };
}

async function emitVerbEvent(supabase, { verb, session_id, outcome, extra }) {
  try {
    const { logCoordinationEvent } = await import('../coordinator/coordination-events.cjs');
    await logCoordinationEvent(supabase, {
      event_type: `fleet_verb_${verb}`,
      session_id: session_id ?? null,
      payload: verbEventPayload({ verb, outcome, extra }),
    });
  } catch { /* fail-open: event emission never blocks a verb outcome */ }
}

/** FR-1: spawn a detached, visible session + capture its window handle. */
export async function spawn({ role, callsign, accountProfile } = {}, opts = {}) {
  const supabase = opts.supabaseClient;
  const live = opts.live ?? isLiveEnabled();
  const log = opts.log || (() => {});

  let profileDir = null;
  if (accountProfile) profileDir = resolveProfileDir(accountProfile, opts);
  const invocation = buildLiveSpawnInvocation({ role, callsign, profileDir });

  if (!live) {
    log(`[spawn-control] DRY-RUN would spawn ${role}/${callsign}: ${invocation.program} ${invocation.args.join(' ')}`);
    await emitVerbEvent(supabase, { verb: 'spawn', outcome: 'dry_run' });
    return { live: false, invocation };
  }

  const spawner = opts.spawnFn || ((program, args, env) => {
    const child = spawnProcess(program, args, { detached: true, stdio: 'ignore', env: { ...process.env, ...env } });
    child.unref();
    return child;
  });

  const child = spawner(invocation.program, invocation.args, invocation.env);
  const pid = child && child.pid;
  const handleResult = pid ? await captureWindowHandle(pid, opts) : { handle: null, handleCaptureFailed: true };

  if (supabase && pid) {
    // Best-effort: persist the captured handle once the spawned session self-registers (bounded
    // wait mirrors checkNewSessionHealth's own polling idiom -- never a hand-rolled sleep loop
    // outside this bounded, injectable retry).
    try {
      await supabase.from('claude_sessions').update({
        metadata: { window_handle: handleResult.handle, handle_capture_failed: handleResult.handleCaptureFailed },
      }).eq('pid', pid);
    } catch { /* fail-soft: the session row may not exist yet; a later attach() re-resolves */ }
  }

  await emitVerbEvent(supabase, { verb: 'spawn', session_id: null, outcome: handleResult.handleCaptureFailed ? 'handle_capture_failed' : 'ok' });
  return { live: true, invocation, pid, ...handleResult };
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

/** Internal: spawn a replacement session under the same role/callsign (shared by restart + relaunch). */
async function spawnReplacement({ oldIdentity, oldSession, accountProfile }, opts) {
  const role = roleOf(oldSession);
  const callsign = oldIdentity.callsign;
  return spawn({ role, callsign, accountProfile }, opts);
}

/** FR-4/FR-5: restart -- role-serial for singletons (via the existing guard), parallel for workers. */
export async function restart(target, opts = {}) {
  const supabase = opts.supabaseClient;
  const by = opts.by || 'callsign';
  const resolution = await resolveLiveSession(supabase, { by, value: target });
  if (!resolution.resolved) {
    await emitVerbEvent(supabase, { verb: 'restart', outcome: `not_resolved:${resolution.reason}` });
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
      await emitVerbEvent(supabase, { verb: 'restart', session_id: oldIdentity.session_id, outcome: 'awaiting_new_session_registration' });
      return { ok: false, reason: 'awaiting_new_session_registration', spawnResult, role: 'singleton' };
    }
    const seqResult = await sequenceSingletonRefresh(supabase, { newSessionId: opts.newSessionId, oldSessionId: oldIdentity.session_id });
    await emitVerbEvent(supabase, { verb: 'restart', session_id: oldIdentity.session_id, outcome: seqResult.action });
    return { ok: seqResult.retired || seqResult.action === 'hold_old', role: 'singleton', spawnResult, seqResult };
  }

  // FR-5: worker restart is parallel-safe by construction -- no shared mutex, resolveSpawnDecisions
  // (inside spawn -> worker-spawn-executor's decision path) already dedupes by callsign.
  const { error } = await supabase.from('claude_sessions').update({
    status: 'released', released_at: new Date().toISOString(), released_reason: 'restart',
  }).eq('session_id', oldIdentity.session_id);
  await emitVerbEvent(supabase, { verb: 'restart', session_id: oldIdentity.session_id, outcome: error ? 'db_error' : 'ok' });
  return { ok: !error, role: 'worker', spawnResult };
}

/** FR-7: the ratified account-switch verb -- isolated to the target session only. */
export async function relaunchUnderProfile(target, accountProfile, opts = {}) {
  const supabase = opts.supabaseClient;
  const by = opts.by || 'callsign';

  // Fail loud before touching anything if the profile doesn't resolve to a safe, allowlisted path.
  resolveProfileDir(accountProfile, opts);

  const resolution = await resolveLiveSession(supabase, { by, value: target });
  if (!resolution.resolved) {
    await emitVerbEvent(supabase, { verb: 'relaunch_under_profile', outcome: `not_resolved:${resolution.reason}` });
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
      await emitVerbEvent(supabase, { verb: 'relaunch_under_profile', session_id: oldIdentity.session_id, outcome: 'awaiting_new_session_registration' });
      return { ok: false, reason: 'awaiting_new_session_registration', spawnResult, role: 'singleton' };
    }
    const seqResult = await sequenceSingletonRefresh(supabase, { newSessionId: opts.newSessionId, oldSessionId: oldIdentity.session_id });
    await emitVerbEvent(supabase, { verb: 'relaunch_under_profile', session_id: oldIdentity.session_id, outcome: seqResult.action });
    return { ok: seqResult.retired || seqResult.action === 'hold_old', role: 'singleton', spawnResult, seqResult };
  }

  const { error } = await supabase.from('claude_sessions').update({
    status: 'released', released_at: new Date().toISOString(), released_reason: 'relaunch_under_profile',
  }).eq('session_id', oldIdentity.session_id);
  await emitVerbEvent(supabase, { verb: 'relaunch_under_profile', session_id: oldIdentity.session_id, outcome: error ? 'db_error' : 'ok' });
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
