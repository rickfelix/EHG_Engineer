/**
 * Per-session sandboxed browser control plane (FR-1..FR-5), SD-LEO-INFRA-SESSION-VIEW-BROWSER-001-A.
 *
 * Backend/control-plane only (target_application=EHG_Engineer) -- no React rendering pane here. A
 * future EHG frontend session-view pane consumes requestBrowserSession/signalTakeover/signalHandBack
 * once a fleet launcher UI shell exists.
 *
 * SAFETY: never launches a real browser process -- buildBrowserLaunchOptions returns launch options
 * for the CALLER to pass to puppeteer/playwright; this module never spawns anything itself, mirroring
 * spawn-control.js's own "return the invocation, never execute it here" discipline for a security-
 * sensitive surface.
 */
import path from 'node:path';

const LOCALHOST_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

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
  if (typeof sessionId !== 'string' || !sessionId) {
    throw new Error(`resolveSessionProfileDir: sessionId required, got ${JSON.stringify(sessionId)}`);
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

// FR-5: in-memory per-session pause state. v1 is a single control-plane process; a future multi-
// process control plane would move this to a DB row, but there is exactly one process today.
const pausedSessions = new Set();

/** FR-5: pause agent-driven actions for a session immediately (takeover). */
export function signalTakeover(sessionId) {
  if (!sessionId) throw new Error('signalTakeover: sessionId required');
  pausedSessions.add(sessionId);
}

/** FR-5: resume agent-driven actions for a session. The ONLY way pause is cleared -- no auto-resume. */
export function signalHandBack(sessionId) {
  if (!sessionId) throw new Error('signalHandBack: sessionId required');
  pausedSessions.delete(sessionId);
}

export function isPaused(sessionId) {
  return pausedSessions.has(sessionId);
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
 * FR-3/FR-4/FR-5: guarded action execution. Re-checks the manifest gate on EVERY call (not just at
 * requestBrowserSession time) so revoking metadata.browser_mcp_enabled for an active session blocks
 * its very next action (FR-4 AC3) -- callers must pass a freshly-fetched session per call, not a
 * cached reference. Logs BEFORE invoking actionFn (FR-3 AC2: no log-after-action race).
 */
export async function driveAction(supabase, session, { eventType, payload = {}, actionFn } = {}) {
  const sessionId = session && session.session_id;
  if (!isBrowserMcpEnabled(session)) {
    return { executed: false, reason: 'browser_mcp_disabled' };
  }
  if (isPaused(sessionId)) {
    return { executed: false, reason: 'paused_for_takeover' };
  }
  await logBrowserAction(supabase, { sessionId, sdKey: session?.sd_key ?? null, eventType, payload });
  const result = typeof actionFn === 'function' ? await actionFn() : undefined;
  return { executed: true, result };
}
