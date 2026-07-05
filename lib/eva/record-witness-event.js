/**
 * SD-LEO-INFRA-INDEPENDENT-GATE-WITNESS-001-C: records a gate_witness_events row via
 * the service-role client, rejecting self-judged events at the application layer
 * before the DB CHECK constraint (chk_witness_not_self_judged) is even reached.
 */
export async function recordWitnessEvent(supabase, { gateId, witnessSessionId, judgedSessionId, verdict, notes }) {
  if (witnessSessionId === judgedSessionId) {
    throw new Error(
      `recordWitnessEvent: witness_session_id and judged_session_id must differ (both were "${witnessSessionId}") -- a session cannot witness its own work`
    );
  }
  if (!['witnessed', 'rejected'].includes(verdict)) {
    throw new Error(`recordWitnessEvent: verdict must be 'witnessed' or 'rejected', got "${verdict}"`);
  }

  const { data, error } = await supabase
    .from('gate_witness_events')
    .insert({
      gate_id: gateId,
      witness_session_id: witnessSessionId,
      judged_session_id: judgedSessionId,
      verdict,
      notes: notes || null,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`recordWitnessEvent: insert failed: ${error.message}`);
  }
  return data;
}
