/**
 * Precheck-packet attach — shadow-trial ratification sandbox.
 * SD-LEO-INFRA-SHADOW-TRIAL-RATIFICATION-001-A (FR-4).
 *
 * Records the precheck packet as a NON-ACTIONABLE, EVIDENCE-ONLY chairman decision row
 * (decision_type='ratification') via the canonical recordPendingDecision writer — never a
 * hand-rolled insert.
 *
 * SPOOF-SAFETY (PAT-PROVENANCE-SPOOF-VIA-SPREAD-ORDER-001): the packet is passed as
 * `context`, which recordPendingDecision assigns as a single NESTED key
 * (brief_data.context) UNDER its canonical fields (title, recorded_via, raised_by) — the
 * packet object is never spread into the brief_data root, so a hostile packet carrying
 * canonical-field keys structurally cannot override them. The packet lands at
 * brief_data.context.precheck_packet.
 *
 * EVIDENCE ONLY (CONST-002): blocking is hard-false (a ratification packet never
 * escalates or blocks anything); the row's decision/status stay 'pending' as written by
 * the canonical writer and are NEVER transitioned here; ratification rows are
 * deliberately absent from the get_pending_chairman_items actionable allow-list.
 */

import { recordPendingDecision } from '../../chairman/record-pending-decision.mjs';
import { TABLE, isMissingTableError } from './proposal-writer.mjs';

export const RATIFICATION_DECISION_TYPE = 'ratification';

/**
 * Attach a composed precheck packet to the chairman decision surface.
 * @param {Object} supabase - injected client
 * @param {Object} opts
 * @param {string} opts.proposalId - governed_change_proposals.id
 * @param {Object} opts.packet - output of composePrecheckPacket (must carry experimental:true)
 * @param {string} opts.title - short chairman-facing headline for the ratification request
 * @param {string} [opts.raisedBy] - who staged/ran the precheck
 * @returns {Promise<{attached: boolean, decisionId?: string, error?: string}>}
 */
export async function attachPrecheckPacket(supabase, { proposalId, packet, title, raisedBy } = {}) {
  if (!supabase) return { attached: false, error: 'supabase client is required' };
  if (!proposalId) return { attached: false, error: 'proposalId is required' };
  if (!title) return { attached: false, error: 'title is required' };
  if (!packet || typeof packet !== 'object' || packet.experimental !== true) {
    // Refuse packets that dropped the experimental watermark — the composer contract
    // guarantees it, so its absence means a non-composer (untrusted) object.
    return { attached: false, error: 'packet must be a composePrecheckPacket output (experimental watermark missing)' };
  }

  const res = await recordPendingDecision(supabase, {
    title,
    decisionType: RATIFICATION_DECISION_TYPE,
    blocking: false, // hard-false: evidence, never an escalating/blocking item
    raisedBy: raisedBy ?? null,
    context: { precheck_packet: packet, proposal_id: proposalId },
  });
  if (!res.recorded) return { attached: false, error: res.error };

  // Advance the SANDBOX'S OWN staging row (not a governed artifact) to packet_attached.
  // Soft-guarded: pre-ceremony (table unapplied) this is a silent no-op.
  const up = await supabase
    .from(TABLE)
    .update({ status: 'packet_attached', updated_at: new Date().toISOString() })
    .eq('id', proposalId);
  if (up.error && !isMissingTableError(up.error)) {
    // Non-fatal: the evidence row exists; staging-status drift is visible and repairable.
    return { attached: true, decisionId: res.id, error: `status update failed: ${up.error.message}` };
  }

  return { attached: true, decisionId: res.id };
}
