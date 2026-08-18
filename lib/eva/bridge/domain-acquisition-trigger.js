/**
 * Domain-Acquisition Post-Approval Trigger — SD-MAN-INFRA-VENTURE-CRACK-GATE-001 FR-10 (class j).
 *
 * composeAcquisitionPacket()/executeAcquisition() (lib/venture-acquisition/) had ZERO production
 * callers -- reachable only from their own tests. FR-10's first half wires composeAcquisitionPacket
 * into Stage-11 completion (lib/eva/stage-templates/analysis-steps/stage-11-visual-identity.js).
 * This module is the second half: runPostApprovalPipeline() (lib/venture-acquisition/dns-wiring.js)
 * is explicitly documented as "the zero-further-human-steps pipeline after fn_chairman_decide
 * (approved)" -- its own doc comment names the exact trigger event this module hooks.
 *
 * SAFE BY DEFAULT, not by a new guard this module adds: executeAcquisition() (which
 * runPostApprovalPipeline wraps) already refuses to make any live registrar call or spend money
 * unless BOTH a real registrar adapter AND execute:true are passed in deps -- its own TR-1
 * plan-mode default returns {status:'blocked_on_credentials', plan:[...]} otherwise. This module
 * deliberately never passes either, mirroring FR-4's "production always plan-mode-only" precedent:
 * wiring the TRIGGER is this FR's job; making a live purchase is blocked anyway on an external,
 * out-of-scope dependency (the invalid Cloudflare registrar token, feedback row 646d0658).
 */

export const ACQUISITION_PACKET_KIND = 'domain_acquisition';

/**
 * Pure: decide whether this approved decision should run the post-approval pipeline.
 * @param {object} decisionRow - a chairman_decisions row (brief_data, status)
 * @param {string} action - 'approved' | 'rejected'
 * @returns {{shouldTrigger: boolean, reason?: string}}
 */
export function shouldTriggerAcquisitionPipeline(decisionRow, action) {
  if (!decisionRow) return { shouldTrigger: false, reason: 'decision row not found' };
  if (decisionRow.brief_data?.packet_kind !== ACQUISITION_PACKET_KIND) {
    return { shouldTrigger: false, reason: `brief_data.packet_kind '${decisionRow.brief_data?.packet_kind}' is not ${ACQUISITION_PACKET_KIND}` };
  }
  if (action !== 'approved') return { shouldTrigger: false, reason: `action '${action}' is not approved -- rejection needs no pipeline run` };
  return { shouldTrigger: true };
}

/**
 * I/O: fetch the real chairman_decisions row, decide, and run the post-approval pipeline
 * (plan-mode only -- see module header) if warranted. Never throws on "not applicable"
 * (returns {ran:false, reason}); DOES throw on a genuine pipeline failure so the caller can
 * surface it loudly without blocking the primary chairman_decisions write it already committed.
 * @param {object} supabase
 * @param {object} params
 * @param {string} params.decisionId
 * @param {string} params.action - 'approved' | 'rejected'
 * @param {Function} [params.runPostApprovalPipelineFn] - test injection seam
 * @returns {Promise<{ran: boolean, reason?: string, result?: object}>}
 */
export async function resolveAndRunAcquisitionPipeline(supabase, { decisionId, action, runPostApprovalPipelineFn = null }) {
  const { data: decisionRow, error: fetchError } = await supabase
    .from('chairman_decisions')
    .select('brief_data, status')
    .eq('id', decisionId)
    .maybeSingle();
  if (fetchError) throw new Error(`chairman_decisions fetch failed: ${fetchError.message}`);

  const gate = shouldTriggerAcquisitionPipeline(decisionRow, action);
  if (!gate.shouldTrigger) return { ran: false, reason: gate.reason };

  const runPipeline = runPostApprovalPipelineFn
    || (await import('../../venture-acquisition/dns-wiring.js')).runPostApprovalPipeline;
  // Deliberately no registrar/execute deps -- see module header. TR-1's own plan-mode default
  // means this never makes a live registrar call or spends money.
  const result = await runPipeline(supabase, decisionId, {});
  return { ran: true, result };
}
