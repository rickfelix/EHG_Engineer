/**
 * Dispatch-authorization gate — the SD-2 phase-1 POLARITY FLIP, shipped safe.
 * SD-ARCH-HOTSPOT-SD-START-001 FR-7 (coupling rule Adam d56fa60a: fold the flip
 * INTO this door; no separate SD-2 build).
 *
 * WHAT FLIPS: SD-LEO-INFRA-HANDOFF-DISPATCH-AUTHORIZATION-001 shipped
 * isDispatchAuthorized as OPT-IN (only SDs stamped metadata.dispatch_auth_required
 * === true are checked — everything else is born CLAIMABLE, fail-open). This gate
 * inverts that polarity when active: EVERY SD is born UN-authorized until a
 * dispatch_auth disposition grant exists (fail-closed), per the deferred
 * "separately-scoped coordinated cutover" SD-2's LEAD explicitly carved out.
 *
 * WHY IT CANNOT FREEZE THE BELT (the exact risk SD-2 deferred over):
 *   1. MODE LADDER, off by default. leo_feature_flags has no variant/metadata
 *      column, so the three modes ride TWO boolean flags (strictly more
 *      auditable than a metadata field; prospective-testing D7 adapted):
 *        dispatch_auth_born_denied          absent/disabled  → mode 'off'   (byte-identical behavior)
 *        dispatch_auth_born_denied  enabled, enforce flag off → mode 'observe'
 *        + dispatch_auth_born_denied_enforce enabled          → mode 'enforce'
 *      Any evaluator error → 'off' (fail-soft, coordinator-backlog-rank precedent).
 *   2. OBSERVE NEVER BLOCKS: it returns {authorized:true, would_deny:true} and
 *      the callers log ONE structured WOULD-DENY line — the observe-window
 *      evidence for the later enforce flip.
 *   3. ENFORCE is implemented + tested but DORMANT: flipping it on is a later
 *      data-only cutover gated on the backfill verification (zero un-granted
 *      claimables — scripts/backfill-dispatch-auth-grants.mjs).
 *
 * AUTHORITY ALLOWLIST (implements the claim-eligibility.cjs L421-425 TODO —
 * specified by SD-2's adversarial review, never built): a disposition row only
 * authorizes when payload.authority ∈ {chairman, coordinator, backfill-cutover}.
 * Any other authority (e.g. a worker session granting itself) is treated as
 * UN-granted — never trust a recorded grant regardless of who recorded it.
 *
 * HOOK PLACEMENT (prospective-testing D8): callers wire this AFTER every other
 * eligibility gate and IMMEDIATELY BEFORE the claim write (checkin: between
 * parentLeadPending and tryClaim; sd-start: just before claim_sd) so the
 * observe-mode WOULD-DENY set equals exactly the set enforce would block.
 * PHASE-1 LANES: the two SELF-CLAIM lanes only. Checkin's orphan-adopt and
 * directed WORK_ASSIGNMENT lanes are deliberate exemptions — coordinator-
 * initiated lanes carry their own authorization semantics (the directed_assign
 * IS the authorization); they are the enumerated phase-2 enforcement surface.
 *
 * @module lib/claim/gates/dispatch-authorization
 */
'use strict';

/** Who may grant dispatch authorization (claim-eligibility L421-425 spec). */
const DISPATCH_AUTH_AUTHORITY_ALLOWLIST = Object.freeze(['chairman', 'coordinator', 'backfill-cutover']);

const BASE_FLAG = 'dispatch_auth_born_denied';
const ENFORCE_FLAG = 'dispatch_auth_born_denied_enforce';

/**
 * Resolve the gate mode from the two-flag ladder. Resolve ONCE per CLI pass
 * (the evaluator's 30s per-process cache makes repeat calls cheap but the
 * single resolve keeps a pass internally consistent).
 * @param {{isEnabledFn?: (flagKey: string) => Promise<boolean>}} [opts] test seam
 * @returns {Promise<'off'|'observe'|'enforce'>}
 */
async function resolveDispatchAuthMode({ isEnabledFn } = {}) {
  try {
    let isEnabled = isEnabledFn;
    if (typeof isEnabled !== 'function') {
      ({ isEnabled } = await import('../../feature-flags/evaluator.js'));
    }
    if (!(await isEnabled(BASE_FLAG))) return 'off';
    return (await isEnabled(ENFORCE_FLAG)) ? 'enforce' : 'observe';
  } catch {
    return 'off'; // fail-soft: a flag-infrastructure fault never changes claim behavior
  }
}

/**
 * Evaluate born-un-authorized dispatch authorization for an SD.
 *
 * @param {object} sd - SD row (needs sd_key)
 * @param {object} supabase - service client
 * @param {object} opts
 * @param {'off'|'observe'|'enforce'} opts.mode - from resolveDispatchAuthMode (caller-resolved)
 * @param {Function} [opts.getDispositionBySubjectFn] - test seam over lib/decision-binding/disposition.js
 * @returns {Promise<{authorized: boolean, mode: string, would_deny?: boolean, reason?: string, authority?: string}>}
 *   off     → {authorized:true, mode:'off'} with ZERO lookups
 *   observe → granted: {authorized:true, mode}; un-granted: {authorized:true, would_deny:true, reason}
 *   enforce → granted: {authorized:true, mode}; un-granted: {authorized:false, reason:'dispatch_auth_pending'}
 */
async function evaluateDispatchAuthorization(sd, supabase, { mode = 'off', getDispositionBySubjectFn } = {}) {
  if (mode !== 'observe' && mode !== 'enforce') {
    return { authorized: true, mode: 'off' };
  }
  const sdKey = sd && sd.sd_key;
  if (!sdKey) {
    // No subject identity to check a grant against — surface it, never crash a claim.
    const reason = 'dispatch_auth_unresolvable_subject';
    return mode === 'observe'
      ? { authorized: true, mode, would_deny: true, reason }
      : { authorized: false, mode, reason };
  }

  let grant = null;
  let readError = null;
  try {
    let getBySubject = getDispositionBySubjectFn;
    if (typeof getBySubject !== 'function') {
      ({ getDispositionBySubject: getBySubject } = await import('../../decision-binding/disposition.js'));
    }
    grant = await getBySubject(supabase, 'dispatch_auth', { subject_id: sdKey, gate_type: 'dispatch' });
  } catch (e) {
    readError = (e && e.message) || String(e);
  }

  const payload = grant && grant.payload;
  const statusOk = payload && (payload.status === 'dispositioned' || payload.status === 'consumed');
  const authorityOk = payload && DISPATCH_AUTH_AUTHORITY_ALLOWLIST.includes(payload.authority);

  if (statusOk && authorityOk) {
    return { authorized: true, mode, authority: payload.authority };
  }

  // Un-granted (absent, pending, read error, or non-allowlisted authority).
  // Fail-closed semantics per the decision-binding principle: absence never
  // authorizes — but observe mode converts the denial into evidence only.
  const reason = readError
    ? `dispatch_auth_read_error: ${readError}`
    : statusOk && !authorityOk
      ? `dispatch_auth_authority_not_allowlisted: ${payload.authority}`
      : 'dispatch_auth_pending';

  return mode === 'observe'
    ? { authorized: true, mode, would_deny: true, reason }
    : { authorized: false, mode, reason };
}

/** One consistent WOULD-DENY line for both CLIs (the observe-window evidence). */
function formatWouldDenyLine(sdKey, verdict, lane) {
  return `DISPATCH_AUTH_WOULD_DENY sd=${sdKey} lane=${lane} reason=${verdict.reason} (observe mode — claim proceeds; SD-ARCH-HOTSPOT-SD-START-001 FR-7)`;
}

module.exports = {
  resolveDispatchAuthMode,
  evaluateDispatchAuthorization,
  formatWouldDenyLine,
  DISPATCH_AUTH_AUTHORITY_ALLOWLIST,
  BASE_FLAG,
  ENFORCE_FLAG,
};
