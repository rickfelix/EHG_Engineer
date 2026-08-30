/**
 * RCA_REQUIRED_AFTER_2_RETRIES gate — QF-20260830-657.
 *
 * MEASURED (7d, sd_phase_handoffs): 65 (sd_id, from_phase->to_phase) pairs with >2 attempts,
 * max 13, zero sub_agent_execution_results RCA rows for the max-attempt SD. CLAUDE.md's
 * "Canonical Pause Points" #3 ("Test failures after 2 retry attempts — auto-retry exhausted,
 * RCA sub-agent invoked before pause") exists only as prose: nothing in the handoff pipeline
 * counted attempts or checked for an RCA row.
 *
 * On the 3rd+ attempt at the SAME (sd_id, handoff_type) transition, this gate requires a
 * sub_agent_execution_results row (sub_agent_code='RCA') created AFTER the 2nd rejection.
 * Absent that row, it refuses with a named reason listing the two prior rejection reasons —
 * the permitted path is one RCA sub-agent call, not a hard block of the seat.
 *
 * Rollout (mirrors rca-feedback-loop-gate.js's app_config cutover convention — no redeploy
 * needed to flip modes): app_config key 'rca.required_after_retries.enforcement_mode'.
 *   advisory (default) — count + surface issues, never fails the gate.
 *   blocking            — refuses with RCA_REQUIRED_AFTER_2_RETRIES when the row is absent.
 *   disabled            — no-op, always passes.
 */
import { buildFailResult } from '../../../../lib/handoff/wait-verdict.js';

const GATE_NAME = 'RCA_REQUIRED_AFTER_2_RETRIES';
const CONFIG_KEY = 'rca.required_after_retries.enforcement_mode';

export async function readEnforcementMode(supabase) {
  if (!supabase) return 'advisory';
  try {
    const { data, error } = await supabase.from('app_config').select('value').eq('key', CONFIG_KEY).maybeSingle();
    if (error || !data || data.value == null) return 'advisory';
    let v = data.value;
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch { /* keep string */ } }
    return typeof v === 'string' && ['advisory', 'blocking', 'disabled'].includes(v.toLowerCase())
      ? v.toLowerCase() : 'advisory';
  } catch {
    return 'advisory';
  }
}

export function createRcaRequiredAfterRetriesGate(supabase) {
  return {
    name: GATE_NAME,
    validator: async (ctx) => {
      const sdId = ctx?.sd_id ?? ctx?.sdId;
      const handoffType = ctx?.handoffType;
      const mode = await readEnforcementMode(supabase);

      if (mode === 'disabled' || !supabase || !sdId || !handoffType) {
        return { passed: true, score: 100, issues: [], details: { mode, skipped: !sdId || !handoffType ? 'no-sd-or-type' : true } };
      }

      const { data: rejections, error } = await supabase
        .from('sd_phase_handoffs')
        .select('rejection_reason, created_at')
        .eq('sd_id', sdId)
        .eq('handoff_type', handoffType)
        .eq('status', 'rejected')
        .order('created_at', { ascending: true });
      if (error) {
        return { passed: true, score: 100, issues: [`rejection-read-error: ${error.message}`], details: { mode } };
      }

      const attemptIndex = (rejections?.length || 0) + 1;
      if (attemptIndex < 3) {
        return { passed: true, score: 100, issues: [], details: { mode, attempt_index: attemptIndex } };
      }

      // VALIDATION evidence 2013c6ad: anchor to the MOST RECENT rejection (not rejections[1],
      // the 2nd-ever) so a fresh retry cycle re-arms the requirement -- on attempt 3 this is
      // identical to the old anchor (only 2 rejections exist), but on attempt 5+ it correctly
      // requires a diagnosis of the LATEST failure instead of letting one RCA run satisfy the
      // gate forever after the 2nd rejection ever occurred.
      const mostRecentRejection = rejections[rejections.length - 1];
      const { data: rcaRows, error: rcaError } = await supabase
        .from('sub_agent_execution_results')
        .select('id, created_at')
        .eq('sd_id', sdId)
        .eq('sub_agent_code', 'RCA')
        .gt('created_at', mostRecentRejection.created_at);
      if (rcaError) {
        return { passed: true, score: 100, issues: [`rca-read-error: ${rcaError.message}`], details: { mode, attempt_index: attemptIndex } };
      }

      const details = { mode, attempt_index: attemptIndex, rca_evidence: rcaRows?.map((r) => r.id) || [] };
      if (rcaRows?.length > 0 || mode !== 'blocking') {
        return { passed: true, score: 100, issues: [], details };
      }

      const priorReasons = rejections.slice(-2).map((r) => r.rejection_reason || '(no reason recorded)');
      return buildFailResult({
        score: 0,
        max_score: 100,
        issues: [`RCA_REQUIRED_AFTER_2_RETRIES: attempt ${attemptIndex} on ${handoffType} — prior rejections: ${priorReasons.join(' | ')}`],
        remediation: `Run the RCA sub-agent (subagent_type="rca-agent") for this SD, then retry the ${handoffType} handoff.`,
        details: { ...details, reason: 'RCA_REQUIRED_AFTER_2_RETRIES', prior_rejection_reasons: priorReasons },
      });
    },
  };
}

export { GATE_NAME };
