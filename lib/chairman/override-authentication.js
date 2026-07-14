/**
 * Chairman override authentication — loop-map gap L6.
 * (SD-LEO-INFRA-AUTHENTICATE-CHAIRMAN-OVERRIDES-001)
 *
 * Wires the EXISTING-but-dormant substrate: chairman_decisions.decided_by_user_id
 * (added but ~97% NULL) and the override-tracker (lib/eva/stage-zero/
 * chairman-override-tracker.js, zero live callers) so a genuine chairman override is
 * distinguishable from an AI self-approval.
 *
 * HONESTY-FIRST (the whole point): an authenticated identity is captured ONLY when one
 * is genuinely present. We NEVER fabricate/hardcode a chairman user_id and NEVER derive
 * identity from the free-text `decided_by` string — an unknown identity stays NULL and
 * is counted as UNAUTHENTICATED. Inflating the number would re-create the exact
 * AI-self-approval conflation this SD exists to end.
 */

/**
 * FR-1 (activation) — the canonical server-side entry point for resolving a chairman
 * decision WITH authenticated-identity capture. This binds the REAL override-tracker
 * (lib/eva/stage-zero/chairman-override-tracker.js) as the live caller so it stops being
 * dormant (zero callers). Any server-side path that resolves a chairman decision should
 * call THIS instead of updating chairman_decisions directly. Fail-soft.
 *
 * @param {Object} supabase - service-role client
 * @param {Object} params - see recordAuthenticatedOverride params
 * @returns {Promise<Object>} recordAuthenticatedOverride result
 */
export async function resolveChairmanDecisionAuthenticated(supabase, params) {
  // Lazy import so the pure helpers above stay dependency-free/testable.
  const { recordOverride } = await import('../eva/stage-zero/chairman-override-tracker.js');
  return recordAuthenticatedOverride({ supabase, recordOverride }, params);
}

/**
 * FR-2 — resolve an authenticated identity from a decision/session context, ONLY if one
 * is genuinely present. Returns a UUID user id or null. Never fabricates.
 *
 * Recognized authenticated sources (in priority order):
 *   1. context.authenticatedUserId — an explicitly-authenticated user id
 *   2. context.session.user.id — a Supabase auth session user
 *   3. context.auth.userId — a generic auth carrier
 * Free-text `decided_by` (e.g. 'adam', 'chairman-verbal-relay:...') is NOT an identity.
 *
 * @param {Object} [context]
 * @returns {string|null}
 */
export function resolveAuthenticatedIdentity(context = {}) {
  const candidates = [
    context.authenticatedUserId,
    context.session?.user?.id,
    context.auth?.userId,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && isUuid(c)) return c;
  }
  return null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(s) { return typeof s === 'string' && UUID_RE.test(s); }

/**
 * FR-1/FR-2 — record a chairman override with authenticated identity capture. Populates
 * chairman_decisions.decided_by_user_id when an identity is genuinely available, and
 * fires the override-tracker. FAIL-SOFT: a tracker error NEVER blocks the decision, and
 * an absent identity does not fail — it records an unauthenticated override honestly.
 *
 * @param {Object} deps
 * @param {Object} deps.supabase - service-role client
 * @param {Function} [deps.recordOverride] - the override-tracker recordOverride (injected for reuse/testing)
 * @param {Object} params
 * @param {string} params.decisionId - chairman_decisions.id being overridden/resolved
 * @param {string} params.decision - 'approved' | 'rejected' | ...
 * @param {Object} [params.identityContext] - carries an authenticated identity if present
 * @param {string} [params.decidedBy] - free-text label (kept for provenance, NOT an identity)
 * @param {string} [params.component]
 * @returns {Promise<{decisionUpdated:boolean, authenticated:boolean, userId:string|null, trackerRecorded:boolean, reason?:string}>}
 */
export async function recordAuthenticatedOverride(deps, params) {
  const { supabase, recordOverride } = deps || {};
  const { decisionId, decision, identityContext, decidedBy = null, component = null } = params || {};
  const userId = resolveAuthenticatedIdentity(identityContext || {});
  const authenticated = userId != null;

  let decisionUpdated = false;
  if (supabase && decisionId) {
    try {
      const patch = { decision, status: 'decided', decided_at: new Date().toISOString() };
      // Only stamp decided_by_user_id when genuinely authenticated (else leave NULL — honest).
      if (authenticated) patch.decided_by_user_id = userId;
      if (decidedBy) patch.decided_by = decidedBy; // free-text provenance, not identity
      const { error } = await supabase.from('chairman_decisions').update(patch).eq('id', decisionId);
      decisionUpdated = !error;
    } catch { /* fail-soft: caller decides how to surface */ }
  }

  // FR-1 — fire the override-tracker, FAIL-SOFT (never block the decision). The tracker's
  // domain is VENTURE synthesis-score overrides (chairman_overrides needs ventureId +
  // component + scores), so we only record there when this override carries that context
  // (params.ventureId + component). Identity capture above is decision-scoped and always
  // runs; the tracker record is the venture-score-override half.
  let trackerRecorded = false;
  const { ventureId = null, systemScore = null, overrideScore = null, reason = null } = params || {};
  if (typeof recordOverride === 'function' && ventureId && component) {
    try {
      const res = await recordOverride({ supabase }, {
        ventureId,
        component,
        systemScore,
        overrideScore,
        reason: reason || (authenticated ? `authenticated chairman override (user ${userId})` : 'unauthenticated override'),
      });
      trackerRecorded = res != null;
    } catch { /* tracker failure must not block */ }
  }

  return {
    decisionUpdated,
    authenticated,
    userId,
    trackerRecorded,
    reason: authenticated ? 'authenticated chairman identity captured' : 'no authenticated identity — recorded as unauthenticated',
  };
}

/**
 * FR-3 — honest authenticated-vs-unauthenticated ratio over chairman_decisions. Legacy
 * NULL-identity rows are counted as unauthenticated (never reclassified). Fail-soft.
 *
 * @param {Object} supabase - service-role client
 * @returns {Promise<{total:number, authenticated:number, unauthenticated:number, ratio:number|null, ok:boolean, reason?:string}>}
 */
export async function authenticationRatio(supabase) {
  try {
    const totalRes = await supabase.from('chairman_decisions').select('*', { count: 'exact', head: true });
    const authRes = await supabase.from('chairman_decisions').select('*', { count: 'exact', head: true }).not('decided_by_user_id', 'is', null);
    if (totalRes.error || authRes.error) {
      return { total: 0, authenticated: 0, unauthenticated: 0, ratio: null, ok: false, reason: (totalRes.error || authRes.error).message };
    }
    const total = totalRes.count || 0;
    const authenticated = authRes.count || 0;
    const unauthenticated = total - authenticated;
    return { total, authenticated, unauthenticated, ratio: total > 0 ? authenticated / total : null, ok: true };
  } catch (e) {
    return { total: 0, authenticated: 0, unauthenticated: 0, ratio: null, ok: false, reason: (e && e.message) || String(e) };
  }
}

/**
 * FR-4 — surface the chairman-auth-MECHANISM question to the chairman. This SD does NOT
 * invent a mechanism; the decision (how to authenticate a chairman identity going
 * forward) is chairman-owned. Records a blocking chairman_decisions question via the
 * canonical recorder so it lands in the chairman decision-queue + fires the escalation email.
 *
 * @param {Object} deps
 * @param {Object} deps.supabase
 * @param {Function} deps.recordPendingDecision - lib/chairman/record-pending-decision.mjs recorder
 * @returns {Promise<{recorded:boolean, id?:string, error?:string}>}
 */
export async function surfaceAuthMechanismQuestion(deps) {
  const { supabase, recordPendingDecision } = deps || {};
  if (typeof recordPendingDecision !== 'function') return { recorded: false, error: 'recordPendingDecision is required' };
  return recordPendingDecision(supabase, {
    title: 'How should a chairman identity be authenticated? (L6 override-authentication)',
    decisionType: 'session_question',
    blocking: true,
    raisedBy: 'loop-governance-L6',
    recommendation: null,
    context:
      'chairman_decisions.decided_by_user_id exists but ~97% of rows are NULL because no path captures an ' +
      'authenticated chairman identity. LIVE PROOF (2026-07-13): the Alt-Text Stage-3 approval recorded ' +
      "decided_by='chairman-verbal-relay:codestreetlabs@gmail.com', decided_by_user_id=NULL. The wiring is done " +
      '(override-tracker activated, capture path added, honest ratio query) but it can only stamp an identity when ' +
      'one is genuinely authenticated. OPTIONS to decide: (a) a chairman Supabase-auth login that stamps auth.uid() ' +
      'on decisions; (b) a signed chairman-approval token; (c) a dedicated authenticated chairman console. Until a ' +
      'mechanism is chosen, chairman decisions remain honestly unauthenticated and indistinguishable from AI self-approval.',
  });
}
