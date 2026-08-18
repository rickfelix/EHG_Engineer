/**
 * Venture-User Feedback Emitter — SD-MAN-INFRA-VENTURE-CRACK-GATE-001 FR-9 (class i).
 *
 * WIRING scoped IN, CONTENT scoped OUT (per the chairman's own explicit sequencing instruction --
 * see metadata.fr9_scope_decision_2026_08_18 on this PRD).
 *
 * WHY fn_submit_venture_user_feedback, NOT fn_submit_internal_feedback (FR-9's original text names
 * both): read both RPC bodies live before wiring either (database/chairman-gated/
 * 20260817_fdbk_internal_feedback_rpc.sql, 20260815_venture_user_feedback_ownership_rpc.sql).
 * fn_submit_internal_feedback authorizes via `v_user_id := auth.uid()` and RAISEs 'unauthorized'
 * when NULL -- confirmed live (a service-role probe returned a real 28000, not PGRST202). EVERY
 * EHG_Engineer backend caller (this sweep, every stage-analysis step, every CLI in this repo) runs
 * as service_role, which never carries a user JWT `sub` claim -- so that RPC can NEVER succeed from
 * ANY backend workflow stage, only from a real frontend user session (its own comments name
 * FeedbackWidget.tsx as the intended caller). Wiring it here would be a permanently-dead call, not
 * a "blocked pending X" state -- worse than not shipping it. fn_submit_venture_user_feedback
 * instead authorizes via `_verify_venture_ingest_secret(p_venture_id, p_ingest_secret)` -- a
 * SECRET, not a session -- which IS satisfiable from backend code once a secret is provisioned.
 * QF-20260817-982 (still open) explicitly owns that provisioning/model decision, so this emitter
 * is safely inert (never calls the RPC without a real secret) until it lands -- the same
 * "wire it now, safely blocked on an external dependency" shape as FR-1 and FR-10 in this SD.
 */

/** True when a Supabase/PostgREST error means "the RPC does not exist yet" (PGRST202/42883). */
function isMissingFunctionError(error) {
  if (!error) return false;
  const code = error.code || '';
  const message = String(error.message || '');
  return code === 'PGRST202' || code === '42883' || /schema cache/i.test(message);
}

/**
 * Emit venture-scoped feedback via fn_submit_venture_user_feedback. Never throws -- feedback
 * capture is a secondary signal and must never break the primary caller (a sweep job, a stage
 * step, etc.). Deliberately never attempts the RPC without a real ingestSecret: no venture has one
 * provisioned today (QF-20260817-982), and a guaranteed-fail call on every cycle would only spend
 * the RPC's own rate-limit ceiling for no benefit.
 * @param {object} supabase
 * @param {object} params
 * @param {string} params.ventureId
 * @param {string|null} params.ingestSecret - null when unprovisioned (the case for every venture today)
 * @param {string} params.feedbackType - one of 'user_bug'|'user_feature_request'|'user_usability'|'user_other'
 * @param {string} params.title
 * @param {string} params.description
 * @returns {Promise<{submitted: boolean, id?: string, reason?: string}>}
 */
export async function emitVentureUserFeedback(supabase, { ventureId, ingestSecret, feedbackType, title, description }) {
  if (!ingestSecret) {
    return { submitted: false, reason: 'no_ingest_secret_provisioned (blocked on QF-20260817-982)' };
  }
  try {
    const { data, error } = await supabase.rpc('fn_submit_venture_user_feedback', {
      p_venture_id: ventureId,
      p_ingest_secret: ingestSecret,
      p_feedback_type: feedbackType,
      p_title: title,
      p_description: description,
    });
    if (error) {
      if (isMissingFunctionError(error)) return { submitted: false, reason: 'fn_submit_venture_user_feedback not yet applied (chairman-gated migration pending)' };
      return { submitted: false, reason: `rpc_error: ${error.message}` };
    }
    return { submitted: true, id: data?.id ?? null };
  } catch (err) {
    return { submitted: false, reason: `unexpected_error: ${err.message}` };
  }
}
