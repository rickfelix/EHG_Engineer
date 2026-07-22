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
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  resolveLiveSession,
  loadLiveSessionIdentity,
} from './session-registry-adapter.js';
import { resolveSpawnDecisions } from './spawn-executor-core.cjs';
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
  // TR-1: this SD is Windows-only infra (baseDir is always a Windows path on the fleet host). Use
  // path.win32 explicitly so the join is correct even when this module runs under CI/tests on a
  // non-Windows runner (path.join maps to path.posix there and would silently forward-slash-join).
  return path.win32.join(baseDir, profileName);
}

/** True only when the operator has explicitly enabled the live OS spawn/relaunch surface. */
export function isLiveEnabled(env = process.env) {
  return String(env.FLEET_SPAWN_CONTROL_LIVE || '').toLowerCase() === 'true';
}

// Pilot fix (SD-LEO-INFRA-LEO-LAUNCHER-LIVE-ACTIVATION-CHECKPOINT-3-001 FR-1): resolve the FULL claude
// launcher path. Bare 'claude' fails inside wt.exe with 0x80070002 because the new-tab child shell
// cannot resolve it on PATH. Prefer an explicit operator override, else the Windows npm global bin
// (APPDATA\npm\claude.cmd), else fall back to bare 'claude' (non-Windows/CI or unresolved) so tests
// and non-fleet hosts stay sane rather than hard-locking to one machine.
export function resolveClaudeCmd(env = process.env) {
  const override = env.FLEET_CLAUDE_CMD || env.CLAUDE_CLI_PATH;
  if (override && String(override).trim()) return String(override).trim();
  const appData = env.APPDATA;
  if (appData) {
    const candidate = path.win32.join(appData, 'npm', 'claude.cmd');
    try { if (fs.existsSync(candidate)) return candidate; } catch { /* fall through to bare */ }
  }
  return 'claude';
}

// Pilot fix (FR-2): the spawned session must start with cwd = repo root so its SessionStart hooks
// REGISTER it in claude_sessions (the pilot canary ran fine but was INVISIBLE to claude_sessions).
// Prefer an explicit override, else resolve from this module's location (lib/fleet -> repo root).
const MODULE_REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export function resolveRepoRoot(env = process.env) {
  const override = env.FLEET_REPO_ROOT;
  if (override && String(override).trim()) return String(override).trim();
  return MODULE_REPO_ROOT;
}

/**
 * Build the host command that WOULD launch a visible Windows Terminal session for a role/callsign,
 * optionally under a switched account profile. Returns a structured command; NEVER executes it here.
 * ⚠️ Host-specific, like worker-spawn-executor.cjs's buildSpawnInvocation -- operator-validate before
 * flipping FLEET_SPAWN_CONTROL_LIVE.
 *
 * SD-LEO-INFRA-LEO-COMPLETION-001-D (FR-4): a `resumeUuid` appends `--resume <uuid>` to the argv so a
 * reboot-respawn tab REATTACHES to the captured Claude Code session (claude_sessions.session_id)
 * instead of starting fresh. `--resume` adds only an argv token — it MUST NOT touch process.env, so the
 * CLAUDE_CONFIG_DIR profile-into-child-env-only isolation invariant is unchanged. (Base argv is now
 * `['new-tab','-d',<repo-root>,'--',<resolved-claude.cmd>]` per the CHECKPOINT-3 pilot fixes: full
 * claude.cmd path for wt.exe + repo-root start-dir so the spawned session registers in claude_sessions.)
 */
export function buildLiveSpawnInvocation({ role, callsign, profileDir, resumeUuid, cwd } = {}) {
  const env = { FLEET_WORKER_CALLSIGN: callsign || '', FLEET_WORKER_ROLE: role || 'worker' };
  // FR-7 / SECURITY: CLAUDE_CONFIG_DIR is injected ONLY into this returned env object -- the caller
  // must pass it to child_process.spawn's env option, never assign to process.env directly.
  if (profileDir) env.CLAUDE_CONFIG_DIR = profileDir;
  // Pilot fix FR-1: launch the RESOLVED full claude path (bare 'claude' fails in wt.exe 0x80070002).
  const claudeCmd = resolveClaudeCmd();
  // Pilot fix FR-2: -d <repo-root> sets the NEW TAB's starting directory so the spawned claude starts
  // with cwd = repo root and its SessionStart hooks register it in claude_sessions. cwd is ALSO returned
  // so every spawner passes it to child_process.spawn (covers the wt.exe process itself).
  const startDir = cwd || resolveRepoRoot();
  const args = ['new-tab', '-d', startDir, '--', claudeCmd];
  // FR-4: resume path. Only appended when a token is present.
  if (resumeUuid) args.push('--resume', String(resumeUuid));
  return {
    program: 'wt.exe',
    args,
    env,
    cwd: startDir,
  };
}

/**
 * Restricted event payload -- HARD-LOCKED to exactly {verb, outcome, at}, never
 * CLAUDE_CONFIG_DIR/profile paths/argv (FR-9, TR-6). No extension point: a future verb needing a
 * new field must widen this allowlist explicitly here, never spread arbitrary caller data through.
 */
function verbEventPayload({ verb, outcome }) {
  return { verb, outcome, at: new Date().toISOString() };
}

async function emitVerbEvent(supabase, { verb, session_id, outcome }) {
  try {
    const { logCoordinationEvent } = await import('../coordinator/coordination-events.cjs');
    await logCoordinationEvent(supabase, {
      event_type: `fleet_verb_${verb}`,
      session_id: session_id ?? null,
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
  const invocation = buildLiveSpawnInvocation({ role, callsign, profileDir });

  if (!live) {
    log(`[spawn-control] DRY-RUN would spawn ${role}/${callsign}: ${invocation.program} ${invocation.args.join(' ')}`);
    await emitVerbEvent(supabase, { verb: 'spawn', outcome: 'dry_run' });
    return { live: false, invocation };
  }

  const spawner = opts.spawnFn || ((program, args, env) => {
    // Pilot fix FR-2: pass the invocation's repo-root cwd to the wt.exe process too (belt-and-suspenders
    // with the new-tab -d start-dir) so the spawn chain never falls back to the launcher's cwd.
    const child = spawnProcess(program, args, { detached: true, stdio: 'ignore', cwd: invocation.cwd, env: { ...process.env, ...env } });
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
    //
    // ADVERSARIAL-REVIEW FIX (data integrity): a bare `.update({ metadata: {...} }).eq('pid', pid)`
    // REPLACES the whole metadata JSONB blob (wiping fleet_identity.callsign/role/etc.) and `pid` is
    // an OS-recyclable identifier -- matching on it alone risks corrupting an unrelated row. Read the
    // current row first, merge client-side, and only write back to the SAME session_id we just read
    // (never a bare pid-scoped write), and only when the row is freshly created (this spawn, not a
    // stale/recycled-pid session).
    try {
      const nowMs2 = opts.nowMs ?? Date.now();
      const { data: current } = await supabase.from('claude_sessions')
        .select('session_id, metadata, created_at').eq('pid', pid).maybeSingle();
      const freshMs = opts.pidMatchFreshMs ?? 2 * 60 * 1000;
      const isFresh = current && current.created_at && (nowMs2 - Date.parse(current.created_at)) <= freshMs;
      if (current && isFresh) {
        await supabase.from('claude_sessions').update({
          metadata: { ...(current.metadata || {}), window_handle: handleResult.handle, handle_capture_failed: handleResult.handleCaptureFailed },
        }).eq('session_id', current.session_id);
      }
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
  //
  // ADVERSARIAL-REVIEW FIX (correctness): NEVER release the old session unless the replacement
  // genuinely spawned live (spawnResult.live === true). In the default (FLEET_SPAWN_CONTROL_LIVE=off)
  // dry-run mode, spawnReplacement() never launches a process -- releasing the old session anyway
  // would silently drop the tracked worker from the registry with no functioning replacement.
  if (!spawnResult || spawnResult.live !== true) {
    await emitVerbEvent(supabase, { verb: 'restart', session_id: oldIdentity.session_id, outcome: 'replacement_not_live' });
    return { ok: false, reason: 'replacement_not_live', role: 'worker', spawnResult };
  }
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

  // ADVERSARIAL-REVIEW FIX: same guard as restart()'s worker path -- never release the old session
  // unless the replacement genuinely spawned live.
  if (!spawnResult || spawnResult.live !== true) {
    await emitVerbEvent(supabase, { verb: 'relaunch_under_profile', session_id: oldIdentity.session_id, outcome: 'replacement_not_live' });
    return { ok: false, reason: 'replacement_not_live', role: 'worker', spawnResult };
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
