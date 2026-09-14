/**
 * DB-first, fail-loud chairman identity resolution -- extracted to its own small module
 * (SD-LEO-INFRA-CHAIRMAN-SMS-DURABLE-001) so a second caller (lib/chairman/sms-outbound-worker.js)
 * can reuse it WITHOUT statically importing the whole chairman-sms-gate/index.js module, which
 * dynamically imports lib/adam/should-consult-solomon.js (the outbound-sink-conformance census's
 * CONSULT_GATE) for an entirely unrelated code path (the rubric-gated send itself). Importing the
 * gate file for this one small function made every importer transitively "reach" the consult gate
 * in the census's file-level reachability graph -- a false positive (this function never calls
 * evaluatePreSendConsult/performBoundedConsult), silently shrinking the census's frozen
 * EXPECTED_NON_CONFORMANT baseline for BOTH the new caller and any file that already imported it
 * transitively (lib/chairman/sms-channel-health.js, via sms-outbound-worker.js). Confirmed via
 * bisection: reverting only sms-outbound-worker.js's new gate import (keeping every other change)
 * restored the census to green.
 *
 * Originally authored under SD-LEO-INFRA-CHAIRMAN-DECISION-LANE-001 (FR-3). Replaces the previous
 * `message.chairmanUserId || process.env.CHAIRMAN_USER_ID` fallback -- CHAIRMAN_USER_ID is unset
 * repo-wide and no production caller supplied message.chairmanUserId, so that fallback always
 * evaluated to undefined and failed chairman_notifications.chairman_user_id NOT NULL deep in the
 * pipeline (23502), not at the point of resolution. An explicit message.chairmanUserId is still
 * honored as an override -- this is never a downgrade path, only a way to skip the RPC when the
 * caller already knows.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{chairmanUserId?: string}} message
 * @returns {Promise<string>} the resolved chairman_user_id -- never null. Throws (fail loud) if
 *   fn_resolve_chairman_user_id() errors or the RPC surfaces no id, so a caller sees a clear error
 *   instead of a downstream NOT NULL bounce.
 */
export async function resolveChairmanUserId(supabase, message = {}) {
  if (message.chairmanUserId) return message.chairmanUserId;
  const { data, error } = await supabase.rpc('fn_resolve_chairman_user_id');
  if (error) {
    throw new Error(`resolveChairmanUserId: fn_resolve_chairman_user_id RPC failed: ${error.message}`);
  }
  if (!data) {
    throw new Error('resolveChairmanUserId: fn_resolve_chairman_user_id returned no id -- chairman identity is unresolvable');
  }
  return data;
}
