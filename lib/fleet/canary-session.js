/**
 * CANARY SESSION PREDICATE — SD-LEO-INFRA-SESSION-SPAWN-AND-PROMPT-LIBRARY-001-E (FR-1, FR-2, FR-4).
 *
 * A canary is a PROBE session that must never acquire real work. This module answers exactly one
 * question — "is the session I am running in a canary?" — and it is consumed by the checkin claim
 * fence. It does NOT kill, claim, or mutate anything.
 *
 * ── WHY THIS IS AN OR, WHEN assertCanaryTarget IS AN AND ──────────────────────────────────────
 * canary-guard.js's assertCanaryTarget ANDs its conjuncts because it guards a DESTRUCTIVE verb:
 * "do not kill unless I am CERTAIN this is a canary." A claim fence is RESTRICTIVE, so fail-closed
 * INVERTS: "do not claim if there is ANY chance this is a canary." Hence a disjunction, and hence
 * an unavailable signal means NO EVIDENCE — never evidence of non-canary.
 *
 * ── WHY THERE IS NO ENV DISJUNCT (and why you must not add one) ───────────────────────────────
 * An earlier draft made process.env.FLEET_WORKER_CALLSIGN the primary signal. It is DEAD: measured
 * null on a live fleet worker, and build-session-launch.cjs:118-121 documents the mechanism — only
 * six CLAUDE_-prefixed vars reach hook subprocesses, which is exactly why sibling FLEET_AUTORESUME_SD
 * has zero readers repo-wide. Do not substitute a different env carrier; the BOUNDARY is what kills
 * it, not the variable name. An unreachable disjunct is worse than a stated gap because it reads as
 * coverage.
 *
 * ── THE SIGNAL THAT SURVIVES THE HOOK BOUNDARY ────────────────────────────────────────────────
 * It survives because it never crosses it. build-session-launch.cjs:128-141 shows the SPAWNER mints
 * the child session UUID and passes `claude --session-id <uuid>`, so the spawner knows the child's
 * identity BEFORE the child process exists. It can therefore PRE-REGISTER "this session id is a
 * canary" at spawn time. The child reads its own CLAUDE_SESSION_ID (populated from instruction zero)
 * and looks the marker up. No env propagation, and no 0-10s registration gap — which is the window
 * every metadata-based signal is blind in, because the account_profile and fleet_identity.callsign
 * stamps both land inside the session-bind loop (spawn-control.js:326-389, up to 10s after launch)
 * and reboot-respawn-runner.js never writes them at all.
 */

import { isCanaryCallsign } from './canary-guard.js';

/**
 * The FR-4 canary-specific metadata trigger. Deliberately NOT non_fleet / role='adam' /
 * is_coordinator: those trip isDispatchableFleetMember and isFleetWorker, which would hide the
 * canary from fleet-dashboard, rollcall, capacity-forecast and the liveness set — and, sharpest,
 * dispatch.cjs:472-481 would make the coordinator HARD-REFUSE to dispatch at it. A probe whose value
 * is being reachable by the same paths as a real worker must stay addressable.
 *
 * A NEW key is safe by construction: every one of those predicates is a CLOSED ALLOWLIST of named
 * keys (session-predicates.mjs:92-112, genuine-worker.mjs:33-39) — none does a generic truthiness
 * sweep of metadata.
 *
 * The token "probe" is deliberately absent: isFixtureSession matches SESSION IDs against a regex
 * including (^|[-_])probe([-_]|$), and keeping the vocabulary clear of it avoids inviting a
 * canary session id that would be silently dropped from every dispatchable set.
 */
export const CANARY_TRIGGER_KEY = 'canary_session';

/** payload.kind of the spawn-time pre-registration row (session_coordination, no DDL required). */
export const CANARY_PRE_REGISTRATION_KIND = 'canary_pre_registration';

export const CANARY_PROFILE = 'canary';

/**
 * The three signals readable from session metadata already in hand. PURE and synchronous — the
 * checkin pipeline has already fetched sessionMetadata before any step runs, so this needs no I/O
 * and cannot throw on a network fault.
 *
 * All three are LATE signals: they are blind during the 0-10s registration window and absent
 * entirely on the reboot-respawn path. They are defence-in-depth behind the pre-registration.
 * @param {object|null} metadata claude_sessions.metadata
 */
export function isCanaryMetadata(metadata) {
  const md = metadata && typeof metadata === 'object' ? metadata : {};
  if (md[CANARY_TRIGGER_KEY] === true) return true;
  if (md.account_profile === CANARY_PROFILE) return true;
  const identity = md.fleet_identity && typeof md.fleet_identity === 'object' ? md.fleet_identity : {};
  return isCanaryCallsign(identity.callsign) || isCanaryCallsign(md.callsign);
}

/**
 * Look up the spawn-time pre-registration for THIS session id.
 * @returns {Promise<{found:boolean, lookupFailed:boolean}>} — `lookupFailed` is deliberately
 *   distinct from `found:false`. Collapsing "no marker" and "could not read" into one falsy value is
 *   the precise conflation that let a reconciler report a healthy quiet lane while failing on every
 *   write; the caller decides the policy, this reports the state.
 */
export async function findCanaryPreRegistration(supabase, sessionId) {
  if (!supabase || !sessionId) return { found: false, lookupFailed: false };
  try {
    const { data, error } = await supabase
      .from('session_coordination')
      .select('id')
      .eq('target_session', sessionId)
      .eq('payload->>kind', CANARY_PRE_REGISTRATION_KIND)
      .limit(1);
    if (error) return { found: false, lookupFailed: true };
    return { found: Array.isArray(data) && data.length > 0, lookupFailed: false };
  } catch {
    return { found: false, lookupFailed: true };
  }
}

/**
 * THE FENCE PREDICATE. Returns a verdict object rather than a bare boolean so a fenced session can
 * state WHY — a fence that short-circuits the pipeline silently is indistinguishable from an idle
 * seat, and "the canary looked idle" is how this class of bug hides.
 *
 * FAIL-CLOSED (FR-2). If the pre-registration lookup could not complete, this fences. That is the
 * opposite of every neighbouring predicate in this codebase, which deliberately fail TOWARD
 * permissiveness (session-predicates.mjs:115 "fail toward member"; build-forbidden-session.cjs:11-13
 * "only an EXPLICIT ... returns true"). Reusing their idiom here would make the fence a silent no-op
 * exactly when something is already wrong.
 *
 * The usual objection to fail-closed — "a DB fault would fence the whole fleet" — does not apply:
 * every acquisition tier this fence guards performs a DB WRITE to claim. If the database is
 * unreachable, no session can claim anything regardless, so fencing costs nothing real while
 * removing the window in which a canary could slip through unidentified.
 *
 * @param {object} supabase
 * @param {{sessionId?:string, metadata?:object}} session
 * @returns {Promise<{isCanary:boolean, reason:string}>}
 */
export async function isCanarySession(supabase, { sessionId, metadata } = {}) {
  if (isCanaryMetadata(metadata)) return { isCanary: true, reason: 'canary_metadata', indeterminate: false };
  const pre = await findCanaryPreRegistration(supabase, sessionId);
  if (pre.found) return { isCanary: true, reason: 'canary_pre_registration', indeterminate: false };
  if (pre.lookupFailed) {
    // isCanary:true is the SAFE DEFAULT so a caller that ignores the flag still fails closed. But
    // `indeterminate` is reported SEPARATELY because the right policy is caller-specific, and baking
    // one policy in here was a real defect: the claim fence should fence on indeterminacy (claiming
    // needs the DB anyway, so it costs nothing), whereas the callsign writers must NOT freeze naming
    // for the whole fleet on a transient fault — "every worker unnamed" reads as a quiet fleet rather
    // than a broken one. findCanaryPreRegistration already says the caller decides the policy; this
    // now honours that one level up instead of contradicting it.
    return { isCanary: true, reason: 'canary_check_indeterminate_fail_closed', indeterminate: true };
  }
  return { isCanary: false, reason: 'not_canary', indeterminate: false };
}
