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
// FR-4 trigger key. Cycle-forced literal: canary-session.js imports isCanaryCallsign from here.
const CANARY_TRIGGER_KEY = 'canary_session';

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
  // QF-20260724-295: accept opts.supabase (the CP3 drill's key, start-cp3-drills.js) as well as
  // opts.supabaseClient (spawn-control's canonical key), then INJECT the canonical key before
  // delegating so BOTH the guard resolution here AND the underlying spawn-control verb resolve the
  // client. Without this, the drill's { supabase } leaves guardedVerb + spawn-control with an
  // undefined client, the guard cannot resolve the canary, and every target-scoped leg no-ops.
  const supabase = opts.supabaseClient || opts.supabase;
  const vopts = supabase ? { ...opts, supabaseClient: supabase } : opts;
  const by = opts.by || 'callsign';
  const resolution = await resolveCanaryTarget(supabase, { by, value: target });
  const guard = assertCanaryTarget(resolution);
  if (!guard.ok) {
    return { ok: false, reason: guard.reason, verb: verbName, guarded: true };
  }
  return verbFn(target, vopts);
}

/** Canary-guarded stop -- delegates to spawn-control.js's stop() ONLY after the guard passes. */
export async function canaryStop(target, opts = {}) {
  return guardedVerb(spawnControlStop, 'stop', target, opts);
}

/**
 * Canary-guarded restart -- delegates to spawn-control.js's restart() ONLY after the guard passes, then
 * self-stamps the LIVE respawn (QF-20260724-295) so an ACTIVE stamped canary target always exists.
 */
export async function canaryRestart(target, opts = {}) {
  const callsign = await preResolveCanaryCallsign(target, opts);
  const result = await guardedVerb(spawnControlRestart, 'restart', target, opts);
  await stampLiveRespawn(result, callsign, opts);
  return result;
}

/**
 * Canary-guarded relaunch-under-profile -- delegates to spawn-control.js's relaunchUnderProfile() ONLY
 * after the guard passes, then self-stamps the LIVE respawn (QF-20260724-295).
 */
export async function canaryRelaunchUnderProfile(target, accountProfile, opts = {}) {
  const callsign = await preResolveCanaryCallsign(target, opts);
  const result = await guardedVerb((t, o) => spawnControlRelaunchUnderProfile(t, accountProfile, o), 'relaunch_under_profile', target, opts);
  await stampLiveRespawn(result, callsign, opts);
  return result;
}

/** QF-20260724-295: cheap read of the target's CURRENT canary callsign, captured BEFORE the verb runs so it can be carried forward onto the (unstamped) respawn. Fail-soft: null on any failure. */
async function preResolveCanaryCallsign(target, opts) {
  try {
    const pre = await resolveCanaryTarget(opts.supabaseClient || opts.supabase, { by: opts.by || 'callsign', value: target });
    return (pre && pre.identity && pre.identity.callsign) || null;
  } catch { return null; }
}

/** QF-20260724-295: self-stamp the new session ONLY when the verb genuinely LIVE-respawned (has a pid). */
async function stampLiveRespawn(result, callsign, opts) {
  if (result && result.spawnResult && result.spawnResult.live === true && result.spawnResult.pid != null) {
    // VAL-CANHOST-01: thread the MINTED session id through so the stamp joins on the value the child
    // actually registers under, not on the already-exited launcher pid.
    const sessionId = result.spawnResult.invocation && result.spawnResult.invocation.sessionId;
    await stampRespawnedCanary(
      opts.supabaseClient || opts.supabase,
      { pid: result.spawnResult.pid, callsign, sessionId },
      opts,
    );
  }
}

/**
 * QF-20260724-295: SELF-STAMP a respawned canary. spawn-control.js's spawn() re-launches the replacement
 * with the callsign via env but does NOT set metadata.account_profile='canary' on the new session, so the
 * CP3 target-scoped legs (which fail-closed require account_profile==='canary' + a Canary- callsign)
 * silently no-op against the unstamped respawn. Bounded-wait, fail-soft, idempotent -- mirrors
 * spawn-control.js's window_handle bounded-wait + client-side metadata MERGE (read row -> merge -> write
 * back to the SAME session_id, NEVER a bare pid-scoped overwrite that would clobber fleet_identity).
 * Stamping is a side effect that NEVER throws / never breaks the verb.
 */
export async function stampRespawnedCanary(supabase, { pid, callsign, sessionId } = {}, opts = {}) {
  // SD-LEO-INFRA-LAUNCHER-CAN-HOST-001 (VALIDATION finding VAL-CANHOST-01): this was the THIRD dead
  // correlation site, and the only one FR-3 did not actually reach. The PRD claimed all three were
  // fixed; two were. `.eq('pid', pid)` matched the wt.exe LAUNCHER pid against claude_sessions.pid,
  // which holds the CLAUDE CODE pid -- the launcher has already exited by the time this runs, so it
  // could never match. This is the account_profile writer on the RESPAWN and RELAUNCH verbs, i.e.
  // exactly the CP3 legs, so a respawned canary could never be stamped and the drill's fail-closed
  // guard would reject it.
  //
  // Prefers the spawner-MINTED session id (the child registers under exactly that value); pid remains
  // a fallback for a caller that minted none. Same fix already applied to spawn-control.js and
  // reboot-respawn-runner.js -- fixing the family rather than the instance this time.
  if (!supabase || (pid == null && !sessionId)) return { stamped: false, reason: 'no_pid' };
  const attempts = opts.stampAttempts ?? 8;
  const gapMs = opts.stampGapMs ?? 500;
  const sleep = opts.sleepFn || ((ms) => new Promise((r) => setTimeout(r, ms)));
  try {
    for (let i = 0; i < attempts; i++) {
      const { data: row } = sessionId
        ? await supabase.from('claude_sessions').select('session_id, metadata').eq('session_id', sessionId).maybeSingle()
        : await supabase.from('claude_sessions').select('session_id, metadata').eq('pid', pid).maybeSingle();
      if (row && row.session_id) {
        const md = row.metadata || {};
        const fi = md.fleet_identity || {};
        const setCallsign = isCanaryCallsign(callsign) && !isCanaryCallsign(fi.callsign);
        if (md.account_profile === 'canary' && !setCallsign) return { stamped: true, already: true, session_id: row.session_id };
        // SD-LEO-INFRA-SESSION-SPAWN-AND-PROMPT-LIBRARY-001-E FR-4: stamp the trigger key alongside
        // account_profile. This is the SECOND (and last) place that writes canary metadata; a VALIDATION
        // review found the key was read by isCanaryMetadata but written nowhere, i.e. an unreachable
        // disjunct — exactly what canary-session.js's header warns against. Literal rather than an
        // import because canary-session.js imports isCanaryCallsign from THIS file, so importing back
        // would be a cycle (the same constraint spawn-control.js documents); a test pins the two agree.
        const metadata = { ...md, account_profile: 'canary', [CANARY_TRIGGER_KEY]: true, ...(setCallsign ? { fleet_identity: { ...fi, callsign } } : {}) };
        await supabase.from('claude_sessions').update({ metadata }).eq('session_id', row.session_id);
        return { stamped: true, session_id: row.session_id };
      }
      if (i < attempts - 1) await sleep(gapMs);
    }
    return { stamped: false, reason: 'respawn_not_registered' };
  } catch {
    return { stamped: false, reason: 'stamp_error' };
  }
}
