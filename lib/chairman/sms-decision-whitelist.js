/**
 * SMS decision-class whitelist read helper.
 * SD-LEO-FEAT-SMS-CHAIRMAN-DECISION-001-A (FR-1).
 *
 * Fail-closed allow-list check: a decision class is SMS-eligible ONLY when an ACTIVE row
 * with an EXACT (case-normalized) match exists in sms_decision_class_whitelist. This is
 * layered BEHIND the existing HIGH->console consequence classifier in sms-bridge.js — it
 * does not replace it. Every uncertain path (missing table, query error, null/empty result,
 * blank/non-string class, near/substring match, inactive row) returns FALSE, so a decision
 * only reaches the chairman's phone on a positive, explicit, active, exact match.
 *
 * @module lib/chairman/sms-decision-whitelist
 */

/**
 * Is the given decision class on the active SMS whitelist?
 *
 * IMPORTANT — the `supabase` client passed here MUST be a service_role client. The
 * whitelist's SELECT policy is chairman-only (fn_is_chairman()); an anon/authenticated
 * client reads ZERO rows and this helper returns false for EVERYTHING (permanent
 * all-console). service_role bypasses RLS and can read the list to make the send/hold
 * decision (it never needs INSERT/UPDATE/DELETE, which are REVOKEd at the table level).
 *
 * Matching is EXACT and case-normalized (lowercased + trimmed), never substring/ilike —
 * 'sched' must NOT match a whitelisted 'schedule'. Whitelist rows are stored normalized by
 * the chairman apply ceremony, so a normalized-input `.eq` is a true exact-equality compare.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase service_role client
 * @param {string} decisionClass the decision class / decisionType to check
 * @returns {Promise<boolean>} true ONLY on a positive exact ACTIVE match; false otherwise
 */
export async function isWhitelistedDecisionClass(supabase, decisionClass) {
  // Absent / blank / non-string -> never SMS-eligible.
  if (typeof decisionClass !== 'string') return false;
  const normalized = decisionClass.trim().toLowerCase();
  if (normalized === '') return false;

  try {
    const { data, error } = await supabase
      .from('sms_decision_class_whitelist')
      .select('decision_class')
      .eq('active', true)
      .eq('decision_class', normalized)
      .limit(1);

    // Treat query error, null data, and empty result ALL as false (fail-closed).
    if (error || !data || data.length === 0) return false;

    return true;
  } catch {
    // Any unexpected throw (network, client, etc.) -> fail-closed.
    return false;
  }
}

export default { isWhitelistedDecisionClass };
