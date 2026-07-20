/**
 * Canary isolation harness -- SD-LEO-INFRA-LEO-COMPLETION-001-B (FR-3).
 *
 * A thin, additive layer on top of the already-shipped lib/fleet/spawn-control.js (SD-LEO-INFRA-
 * FLEET-SPAWN-CONTROL-001, completed) -- stop()/restart()/relaunchUnderProfile() are imported and
 * reused as-is; this module adds ONLY the genuinely-new pieces: a canary-only callsign namespace, an
 * independent canary-kill env flag, and a fail-closed assert-before-kill guard.
 *
 * WHY A GUARD IS NEEDED (risk-agent finding, verified): lib/fleet/session-registry-adapter.js's
 * resolveLiveSession() resolves purely by session_id/callsign -- ZERO account_profile filtering.
 * That means, absent this guard, a canary-drill call to stop()/restart()/relaunchUnderProfile()
 * could target a live production coordinator/Adam/Solomon/worker session. This guard is the ONLY
 * partition between a canary drill and killing production sessions.
 *
 * FAIL-CLOSED CONTRACT: the guard trusts ONLY the server-resolved session's metadata.account_profile
 * -- it never reads account_profile from caller-supplied target/opts. Any resolution failure
 * (not_found / ambiguous / absent field / non-canary value) rejects the mutation.
 */
import { loadLiveSessionIdentity } from './session-registry-adapter.js';
import { resolveSessionIdentity } from './session-registry.js';
import {
  stop as spawnControlStop,
  restart as spawnControlRestart,
  relaunchUnderProfile as spawnControlRelaunchUnderProfile,
} from './spawn-control.js';

const CANARY_CALLSIGN_PREFIX = 'Canary-';

/**
 * True only when the operator has explicitly enabled the canary-kill surface. INDEPENDENT of
 * FLEET_SPAWN_CONTROL_LIVE (FR-3 acceptance criterion) -- both default OFF, toggled separately.
 */
export function isCanaryKillEnabled(env = process.env) {
  return String(env.FLEET_CANARY_KILL_ENABLED || '').toLowerCase() === 'true';
}

/** True only for a callsign in the canary-only namespace (defence-in-depth alongside the account_profile check). */
export function isCanaryCallsign(callsign) {
  return typeof callsign === 'string' && callsign.startsWith(CANARY_CALLSIGN_PREFIX);
}

/**
 * Resolve a card/session identifier to ONE live identity WITH its server-side account_profile.
 * session-registry-adapter.js's joinSessionIdentity carries no account_profile today -- this reads
 * it directly from claude_sessions.metadata, additive/parallel to that adapter, touching nothing
 * there. NEVER accepts an account_profile value from the caller.
 * @param {object} supabase
 * @param {{ by?:string, value?:any }} key
 */
export async function resolveCanaryTarget(supabase, { by, value } = {}) {
  const { sessions, callsignBySession } = await loadLiveSessionIdentity(supabase);
  const joined = (sessions || []).map((s) => ({
    session_id: (s && s.session_id) || null,
    terminal_id: (s && s.terminal_id) || null,
    pid: s && s.pid != null ? s.pid : null,
    callsign: (s && s.session_id && callsignBySession[s.session_id]) || null,
    account_profile: (s && s.metadata && s.metadata.account_profile) || null,
  }));
  return resolveSessionIdentity(joined, { by, value });
}

/**
 * FAIL-CLOSED assert-before-kill guard (FR-3 core). Requires a resolved session AND
 * identity.account_profile === 'canary' (server-resolved) AND, defence-in-depth, a canary-namespace
 * callsign. Any ambiguity/absence/mismatch -> REJECT. Never throws -- always returns a verdict.
 * @param {{resolved:boolean, identity?:object, reason?:string}} resolution
 * @returns {{ok:boolean, reason?:string}}
 */
export function assertCanaryTarget(resolution) {
  if (!resolution || resolution.resolved !== true) {
    return { ok: false, reason: (resolution && resolution.reason) || 'not_resolved' };
  }
  const identity = resolution.identity || {};
  if (identity.account_profile !== 'canary') {
    return { ok: false, reason: 'not_canary_profile' };
  }
  if (!isCanaryCallsign(identity.callsign)) {
    return { ok: false, reason: 'not_canary_callsign' };
  }
  return { ok: true };
}

/**
 * Structural composition point every canary-guarded verb routes through (TS-5e): the canary-kill
 * flag is checked FIRST (AND-composition, TS-6a -- a resolved canary session is still NOT killed
 * when the flag is off), then the target is resolved server-side and the fail-closed guard applied,
 * and ONLY on a full pass does the underlying spawn-control.js verb ever run.
 */
async function guardedVerb(verbFn, verbName, target, opts = {}) {
  if (!isCanaryKillEnabled(opts.env)) {
    return { ok: false, reason: 'canary_kill_disabled', verb: verbName, guarded: true };
  }
  const supabase = opts.supabaseClient;
  const by = opts.by || 'callsign';
  const resolution = await resolveCanaryTarget(supabase, { by, value: target });
  const guard = assertCanaryTarget(resolution);
  if (!guard.ok) {
    return { ok: false, reason: guard.reason, verb: verbName, guarded: true };
  }
  return verbFn(target, opts);
}

/** Canary-guarded stop -- delegates to spawn-control.js's stop() ONLY after the guard passes. */
export async function canaryStop(target, opts = {}) {
  return guardedVerb(spawnControlStop, 'stop', target, opts);
}

/** Canary-guarded restart -- delegates to spawn-control.js's restart() ONLY after the guard passes. */
export async function canaryRestart(target, opts = {}) {
  return guardedVerb(spawnControlRestart, 'restart', target, opts);
}

/** Canary-guarded relaunch-under-profile -- delegates to spawn-control.js's relaunchUnderProfile() ONLY after the guard passes. */
export async function canaryRelaunchUnderProfile(target, accountProfile, opts = {}) {
  return guardedVerb((t, o) => spawnControlRelaunchUnderProfile(t, accountProfile, o), 'relaunch_under_profile', target, opts);
}
