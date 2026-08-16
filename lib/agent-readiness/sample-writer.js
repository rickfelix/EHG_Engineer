/**
 * lib/agent-readiness/sample-writer.js
 * SD-LEO-FEAT-AGENT-READINESS-SERVICE-001 FR-1 / US-003.
 *
 * Writes public.agent_readiness_audit_sample from the ACTUAL adapter call result. The two integrity
 * CHECKs (no_fallback: actual_responder_model = requested_model; no_cache: cache_hit = false) are
 * measurement invariants, not input validation — this writer must never "fix" a refusal by writing
 * actual_responder_model = requested_model unconditionally. That would reconstruct exactly the
 * silent corruption the constraint exists to catch (AC-003-2). A refused/failed sample is written
 * NOT AT ALL (see writeSampleOrSkip) so v_agent_readiness_audit_run_integrity.is_complete detects the gap.
 */

import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * @param {object} params
 * @param {string} params.auditRunId
 * @param {string} params.prompt
 * @param {string} params.requestedModel
 * @param {string} params.actualResponderModel - MUST come from the real call result, never assumed
 * @param {boolean} params.cacheHit - MUST come from the real call result, never assumed
 * @param {number} params.sampleIndex - 1-based
 * @param {boolean} params.found
 * @param {boolean} params.recommended
 * @param {string} params.rawResponse
 * @returns {Promise<{written:true, id:string}|{written:false, reason:string}>}
 *   written:false means the CHECK refused the row (a real integrity violation happened upstream) — this
 *   is the expected outcome for AC-002-4/AC-003-3, not an error to retry-with-different-values.
 */
export async function writeSample({
  auditRunId,
  prompt,
  requestedModel,
  actualResponderModel,
  cacheHit,
  sampleIndex,
  found,
  recommended,
  rawResponse
}) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('agent_readiness_audit_sample')
    .insert({
      audit_run_id: auditRunId,
      prompt,
      requested_model: requestedModel,
      actual_responder_model: actualResponderModel,
      cache_hit: cacheHit,
      sample_index: sampleIndex,
      found,
      recommended,
      raw_response: rawResponse
    })
    .select('id')
    .single();

  if (error) {
    // 23514 = check_violation. Any other error (e.g. FK violation, connectivity) should surface loudly.
    if (error.code === '23514') {
      return { written: false, reason: `integrity CHECK refused sample (prompt#${sampleIndex}, model=${requestedModel}): ${error.message}` };
    }
    throw new Error(`agent_readiness_audit_sample insert failed (not a CHECK refusal): ${error.message}`);
  }
  return { written: true, id: data.id };
}
