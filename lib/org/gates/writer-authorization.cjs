/**
 * Writer-authorization gate — born-denied, per-ROLE writer identity for org agents.
 * SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-B FR-2 (design-spike: PRD metadata.design_spike,
 * chairman org-centered ratification 2026-07-11, Adam advisory f8143eb6).
 *
 * DELIBERATE MIRROR of lib/claim/gates/dispatch-authorization.cjs (SD-ARCH-HOTSPOT-
 * SD-START-001 FR-7) — the ratified born-denied ladder, applied to org-agent WRITE
 * surfaces instead of SD claims. No new authority substrate: grants are
 * lib/decision-binding/disposition.js rows (kind='writer_auth').
 *
 * MODE LADDER (two boolean flags, off by default — byte-identical when absent):
 *   writer_identity_born_denied           absent/disabled → 'off'
 *   writer_identity_born_denied  enabled, enforce off     → 'observe'  (never blocks; logs would-deny)
 *   + writer_identity_born_denied_enforce enabled         → 'enforce'  (fail-closed)
 * Any evaluator error → 'off' (fail-soft — a flag fault never changes write behavior).
 *
 * ORG-CENTERED INVARIANTS (structural, not advisory):
 *   1. Per-ROLE identity: grants attach to (agent_identity, write_surface) where the
 *      identity is a role-specialized org_agent_identities row — never a shared brain.
 *   2. EVA IS NEVER THE DECISION BOTTLENECK: payloads granting DOMAIN surfaces to a
 *      chief-of-staff/routing identity are treated as UN-granted even if recorded
 *      (isEvaBottleneckGrant below). EVA remains allowlist-eligible only for
 *      ROUTING_SURFACES.
 *   3. Authority allowlist: chairman | coordinator | calibration-engine. A role agent
 *      can never grant itself; calibration-engine is the earned-autonomy widening path.
 *
 * ROLLOUT: OBSERVE first. ENFORCE flips only after
 * scripts/backfill-writer-auth-grants.mjs verifies zero un-granted active writers AND
 * >=2 distinct role identities hold grants per active venture (distributed-authority
 * precondition). Observe-Only-First default per CLAUDE_CORE.
 *
 * @module lib/org/gates/writer-authorization
 */
'use strict';

/** Who may grant writer authorization. */
const WRITER_AUTH_AUTHORITY_ALLOWLIST = Object.freeze(['chairman', 'coordinator', 'calibration-engine']);

/** Surfaces a routing/chief-of-staff identity (EVA) may legitimately hold. */
const ROUTING_SURFACES = Object.freeze(['routing', 'scheduling', 'meeting_brief_delivery']);

/** Role keys classified as routing/chief-of-staff — never domain decision-makers. */
const ROUTING_ROLE_KEYS = Object.freeze(['EVA', 'CHIEF_OF_STAFF']);

const BASE_FLAG = 'writer_identity_born_denied';
const ENFORCE_FLAG = 'writer_identity_born_denied_enforce';

/**
 * Resolve the gate mode from the two-flag ladder (single resolve per pass).
 * @param {{isEnabledFn?: (flagKey: string) => Promise<boolean>}} [opts] test seam
 * @returns {Promise<'off'|'observe'|'enforce'>}
 */
async function resolveWriterAuthMode({ isEnabledFn } = {}) {
  try {
    let isEnabled = isEnabledFn;
    if (typeof isEnabled !== 'function') {
      ({ isEnabled } = await import('../../feature-flags/evaluator.js'));
    }
    if (!(await isEnabled(BASE_FLAG))) return 'off';
    return (await isEnabled(ENFORCE_FLAG)) ? 'enforce' : 'observe';
  } catch {
    return 'off'; // fail-soft: a flag-infrastructure fault never changes write behavior
  }
}

/**
 * The anti-bottleneck invariant: a routing-role identity holding a DOMAIN write
 * surface is structurally un-granted, regardless of what the grant row says.
 * @param {{role_key?: string}} identity
 * @param {string} writeSurface
 * @returns {boolean} true when this grant shape must be refused
 */
function isEvaBottleneckGrant(identity, writeSurface) {
  const roleKey = identity && typeof identity.role_key === 'string' ? identity.role_key.toUpperCase() : '';
  if (!ROUTING_ROLE_KEYS.includes(roleKey)) return false;
  return !ROUTING_SURFACES.includes(writeSurface);
}

/**
 * Evaluate born-denied writer authorization for an org-agent identity on a write surface.
 *
 * @param {{id: string, role_key?: string, venture_id?: string}} identity - org_agent_identities row
 * @param {string} writeSurface - e.g. 'evidence_fabric', 'objective_registry', 'read_model_refresh'
 * @param {object} supabase - service client
 * @param {object} opts
 * @param {'off'|'observe'|'enforce'} opts.mode - from resolveWriterAuthMode (caller-resolved)
 * @param {Function} [opts.getDispositionBySubjectFn] - test seam over lib/decision-binding/disposition.js
 * @returns {Promise<{authorized: boolean, mode: string, would_deny?: boolean, reason?: string, authority?: string}>}
 *   off     → {authorized:true, mode:'off'} with ZERO lookups
 *   observe → granted: {authorized:true, mode}; un-granted: {authorized:true, would_deny:true, reason}
 *   enforce → granted: {authorized:true, mode}; un-granted: {authorized:false, reason}
 */
async function evaluateWriterAuthorization(identity, writeSurface, supabase, { mode = 'off', getDispositionBySubjectFn } = {}) {
  if (mode !== 'observe' && mode !== 'enforce') {
    return { authorized: true, mode: 'off' };
  }
  const identityId = identity && identity.id;
  if (!identityId || !writeSurface) {
    const reason = 'writer_auth_unresolvable_subject';
    return mode === 'observe'
      ? { authorized: true, mode, would_deny: true, reason }
      : { authorized: false, mode, reason };
  }

  // Structural refusal precedes any grant lookup: the invariant holds even if a
  // grant row was recorded (never trust a recorded grant — dispatch-auth doctrine).
  if (isEvaBottleneckGrant(identity, writeSurface)) {
    const reason = `writer_auth_eva_bottleneck_refused: routing role may not hold domain surface ${writeSurface}`;
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
    grant = await getBySubject(supabase, 'writer_auth', { subject_id: identityId, gate_type: writeSurface });
  } catch (e) {
    readError = (e && e.message) || String(e);
  }

  const payload = grant && grant.payload;
  const statusOk = payload && (payload.status === 'dispositioned' || payload.status === 'consumed');
  const authorityOk = payload && WRITER_AUTH_AUTHORITY_ALLOWLIST.includes(payload.authority);

  if (statusOk && authorityOk) {
    return { authorized: true, mode, authority: payload.authority };
  }

  const reason = readError
    ? `writer_auth_read_error: ${readError}`
    : statusOk && !authorityOk
      ? `writer_auth_authority_not_allowlisted: ${payload.authority}`
      : 'writer_auth_pending';

  return mode === 'observe'
    ? { authorized: true, mode, would_deny: true, reason }
    : { authorized: false, mode, reason };
}

/** One consistent WOULD-DENY line for all write call sites (observe-window evidence). */
function formatWriterWouldDenyLine(identity, writeSurface, verdict) {
  const role = (identity && identity.role_key) || 'unknown-role';
  return `WRITER_AUTH_WOULD_DENY identity=${identity && identity.id} role=${role} surface=${writeSurface} reason=${verdict.reason} (observe mode — write proceeds; SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-B FR-2)`;
}

const WRITER_WOULD_DENY_EVENT_TYPE = 'WRITER_AUTH_WOULD_DENY';

/**
 * Durable would-deny evidence to system_events (mirrors recordWouldDenyEvidence).
 * Fail-soft: evidence recording never affects the write path.
 * @param {object} supabase
 * @param {{id: string, role_key?: string, venture_id?: string}} identity
 * @param {string} writeSurface
 * @param {{reason?: string}} verdict
 */
async function recordWriterWouldDenyEvidence(supabase, identity, writeSurface, verdict) {
  try {
    await supabase.from('system_events').insert({
      event_type: WRITER_WOULD_DENY_EVENT_TYPE,
      payload: {
        identity_id: identity && identity.id,
        role_key: identity && identity.role_key,
        venture_id: identity && identity.venture_id,
        write_surface: writeSurface,
        reason: verdict.reason,
      },
    });
  } catch {
    // fail-soft (TR-2 doctrine)
  }
}

module.exports = {
  resolveWriterAuthMode,
  evaluateWriterAuthorization,
  isEvaBottleneckGrant,
  formatWriterWouldDenyLine,
  recordWriterWouldDenyEvidence,
  WRITER_WOULD_DENY_EVENT_TYPE,
  WRITER_AUTH_AUTHORITY_ALLOWLIST,
  ROUTING_SURFACES,
  ROUTING_ROLE_KEYS,
  BASE_FLAG,
  ENFORCE_FLAG,
};
