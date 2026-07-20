/**
 * Per-session sandboxed browser control plane (FR-1..FR-5), SD-LEO-INFRA-SESSION-VIEW-BROWSER-001-A.
 *
 * Backend/control-plane only (target_application=EHG_Engineer) -- no React rendering pane here. A
 * future EHG frontend session-view pane consumes requestBrowserSession/signalTakeover/signalHandBack
 * once a fleet launcher UI shell exists.
 *
 * SAFETY: never launches a real browser process -- buildBrowserLaunchOptions returns launch options
 * for the CALLER to pass to puppeteer/playwright; this module never spawns anything itself. This is
 * the same "return the invocation, never execute it here" discipline this codebase applies to other
 * security-sensitive control-plane surfaces.
 */
import path from 'node:path';

const LOCALHOST_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);
// SECURITY (adversarial review): session_id gates path.join() in resolveSessionProfileDir -- without
// this allowlist, a session_id containing '..' collapses through path.join and can resolve OUTSIDE
// the configured base dir (e.g. onto a real Chrome profile), defeating the exact isolation invariant
// FR-1 exists to guarantee. Mirrors the PROFILE_NAME_RE discipline used elsewhere in lib/fleet/ for
// the same class of "name become a path segment" risk.
const SAFE_SESSION_ID_RE = /^[A-Za-z0-9_-]+$/;

/** FR-4: manifest-gate check. Mirrors session-predicates.mjs's field-presence idiom -- absent/false = OFF. */
export function isBrowserMcpEnabled(session) {
  return !!(session && session.metadata && session.metadata.browser_mcp_enabled === true);
}

/** FR-2: CDP must always resolve to a localhost address. Throws on any non-localhost override. */
export function assertLocalhostBind(host) {
  const h = String(host || '127.0.0.1').toLowerCase();
  if (!LOCALHOST_HOSTS.has(h)) {
    throw new Error(`assertLocalhostBind: refusing non-localhost CDP bind: ${JSON.stringify(host)}`);
  }
  return h;
}

/** FR-1: per-session profile dir, isolated by session_id -- never the chairman's own browser profile. */
export function resolveSessionProfileDir(sessionId, opts = {}) {
  if (typeof sessionId !== 'string' || !SAFE_SESSION_ID_RE.test(sessionId)) {
    throw new Error(`resolveSessionProfileDir: unsafe sessionId (path-traversal guard): ${JSON.stringify(sessionId)}`);
  }
  const baseDir = opts.baseDir ?? process.env.FLEET_BROWSER_PROFILES_DIR ?? null;
  if (!baseDir) throw new Error('resolveSessionProfileDir: FLEET_BROWSER_PROFILES_DIR is not configured');
  return path.join(baseDir, sessionId);
}

/**
 * FR-1/FR-2: pure launch-options builder for puppeteer/playwright. Never executes anything -- the
 * caller passes this to its own launch() call.
 */
export function buildBrowserLaunchOptions(sessionId, opts = {}) {
  const userDataDir = resolveSessionProfileDir(sessionId, opts);
  const host = assertLocalhostBind(opts.host);
  return {
    userDataDir,
    headless: opts.headless ?? true,
    args: [`--remote-debugging-address=${host}`, `--remote-debugging-port=${opts.port ?? 0}`],
  };
}

/**
 * FR-3: log a browser action to the existing fleet event feed (lib/coordinator/coordination-events.cjs),
 * matching the {event_type, session_id, sd_key, payload} shape already used at coordination-events.cjs
 * :290-297. Dynamic import (not a static import) mirrors spawn-control.js's own emitVerbEvent, the
 * established pattern in this codebase for an ESM module consuming a .cjs sibling. Fail-open: never
 * throws to the caller (an audit-log outage must not block a browser action, per the existing feed's
 * own documented fail-open contract).
 */
export async function logBrowserAction(supabase, { sessionId, sdKey = null, eventType, payload = {} } = {}) {
  if (!eventType || !eventType.startsWith('browser_')) {
    throw new Error(`logBrowserAction: eventType must be browser_-prefixed, got ${JSON.stringify(eventType)}`);
  }
  try {
    const { logCoordinationEvent } = await import('../coordinator/coordination-events.cjs');
    return await logCoordinationEvent(supabase, {
      event_type: eventType,
      session_id: sessionId ?? null,
      sd_key: sdKey,
      payload,
    });
  } catch (error) {
    return { ok: false, error: error && error.message };
  }
}

/**
 * FR-5: pause state lives on claude_sessions.metadata.browser_takeover_paused (same per-session
 * metadata-field idiom as FR-4's browser_mcp_enabled) -- NOT an in-memory Set. An adversarial review
 * caught that in-memory-only state silently re-permits the agent across a control-plane process
 * restart, contradicting FR-5 AC3's "no auto-resume" invariant. Read-merge-write (never a bare
 * metadata replace) to avoid clobbering unrelated metadata keys, mirroring the same defensive pattern
 * this codebase's other session-metadata writers use.
 *
 * KNOWN LIMITATION (adversarial review, round 2): this read-merge-write is NOT atomic. Several other
 * writers in this codebase (scripts/worker-checkin.cjs, scripts/hooks/stop-loop-wakeup-reminder.cjs,
 * lib/checkin/steps/model-effort-merge.cjs, the adam/solomon register scripts) use the SAME whole-
 * object client-side RMW pattern against claude_sessions.metadata -- a stale concurrent write from any
 * of them can clobber browser_takeover_paused back to absent. This is a PRE-EXISTING, cross-cutting gap
 * in how this codebase writes claude_sessions.metadata generally (an atomic DB-side jsonb merge/RPC
 * would close it for every writer, not just this one), not something introduced here or fixable within
 * this SD's control-plane-only scope. Throwing on a failed WRITE (below) keeps THIS module honest about
 * its own failures; the cross-writer clobber risk is tracked separately (see /signal harness-bug).
 */
async function persistPauseState(supabase, sessionId, paused) {
  const { data: current, error: readError } = await supabase
    .from('claude_sessions')
    .select('metadata')
    .eq('session_id', sessionId)
    .maybeSingle();
  if (readError) throw new Error(`persistPauseState: read failed for ${sessionId}: ${readError.message}`);
  const { error: writeError } = await supabase
    .from('claude_sessions')
    .update({ metadata: { ...(current?.metadata || {}), browser_takeover_paused: paused } })
    .eq('session_id', sessionId);
  if (writeError) throw new Error(`persistPauseState: write failed for ${sessionId}: ${writeError.message}`);
}

/** FR-5 AC3: read-only pause check. Pure, mirrors isBrowserMcpEnabled -- reads a fresh session object. */
export function isPaused(session) {
  return !!(session && session.metadata && session.metadata.browser_takeover_paused === true);
}

/**
 * FR-5 AC1+AC2: pause agent-driven actions for a session immediately (takeover). THROWS if the pause
 * state fails to persist -- a safety control that silently "succeeds" while leaving the agent unpaused
 * is worse than a loud failure the caller must handle. The browser_takeover audit event is logged only
 * AFTER a successful persist, so the fleet feed never claims a takeover that didn't actually take.
 */
export async function signalTakeover(supabase, sessionId, sdKey = null) {
  if (!sessionId) throw new Error('signalTakeover: sessionId required');
  await persistPauseState(supabase, sessionId, true);
  await logBrowserAction(supabase, { sessionId, sdKey, eventType: 'browser_takeover', payload: {} });
}

/**
 * FR-5 AC3: resume agent-driven actions for a session. The ONLY way pause is cleared -- no
 * auto-resume. THROWS if the state fails to persist (same reasoning as signalTakeover); the
 * browser_handback event is logged only after a successful persist.
 */
export async function signalHandBack(supabase, sessionId, sdKey = null) {
  if (!sessionId) throw new Error('signalHandBack: sessionId required');
  await persistPauseState(supabase, sessionId, false);
  await logBrowserAction(supabase, { sessionId, sdKey, eventType: 'browser_handback', payload: {} });
}

/**
 * FR-4 entry guard + FR-1 profile resolution. Does NOT launch a real browser process -- validates the
 * manifest gate and returns the resolved launch options, or a clear refusal reason.
 */
export function requestBrowserSession(session, opts = {}) {
  if (!isBrowserMcpEnabled(session)) {
    return { ok: false, reason: 'browser_mcp_disabled' };
  }
  const launchOptions = buildBrowserLaunchOptions(session.session_id, opts);
  return { ok: true, launchOptions };
}

/**
 * FR-3/FR-4/FR-5: guarded action execution. Re-checks the manifest gate AND pause state on EVERY
 * call (not just at requestBrowserSession time) so revoking metadata.browser_mcp_enabled or a
 * takeover for an active session blocks its very next action (FR-4 AC3) -- callers must pass a
 * freshly-fetched session per call, not a cached reference. Logs BEFORE invoking actionFn (FR-3
 * AC2: no log-after-action race). The log call's outcome is surfaced as `auditWarning` rather than
 * silently discarded -- logging stays fail-open (an outage never blocks the action itself), but the
 * caller can now observe and react to a lost audit record instead of it vanishing unnoticed.
 */
export async function driveAction(supabase, session, { eventType, payload = {}, actionFn } = {}) {
  const sessionId = session && session.session_id;
  if (!isBrowserMcpEnabled(session)) {
    return { executed: false, reason: 'browser_mcp_disabled' };
  }
  if (isPaused(session)) {
    return { executed: false, reason: 'paused_for_takeover' };
  }
  const logResult = await logBrowserAction(supabase, { sessionId, sdKey: session?.sd_key ?? null, eventType, payload });
  const result = typeof actionFn === 'function' ? await actionFn() : undefined;
  return {
    executed: true,
    result,
    // Generic, UI-safe message only -- logResult.error (raw Postgres/PostgREST detail: host, table,
    // column names) is deliberately NOT surfaced here, adversarial review round 2. Callers needing the
    // raw detail for server-side logging should call logBrowserAction directly.
    ...(logResult && logResult.ok === false ? { auditWarning: 'audit log write failed' } : {}),
  };
}
