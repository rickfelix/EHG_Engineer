/**
 * SD-LEO-INFRA-INDEPENDENT-GATE-WITNESS-001-C: records a gate_witness_events row via
 * the service-role client, rejecting self-judged events at the application layer
 * before the DB CHECK constraint (chk_witness_not_self_judged) is even reached.
 *
 * SD-LEO-INFRA-GATE-WITNESS-STRENGTH-001: also looks up gate_witness_registry by
 * gate_id and stamps enforcement_strength/witness_mechanism/is_downgrade onto the
 * event -- first-class, queryable evidence of what strength this gate actually ran
 * at, rather than something inferred by a separate cross-reference. A lookup miss
 * (unregistered gate_id) or lookup error stamps all 3 as null/false rather than
 * failing the insert -- this must never turn a working witness-recording call into
 * a thrown error for a gate not yet classified in the registry.
 */
async function lookupGateStrength(supabase, gateId) {
  try {
    const { data } = await supabase
      .from('gate_witness_registry')
      .select('enforcement_strength, witness_mechanism')
      .eq('gate_id', gateId)
      .single();
    const enforcementStrength = data?.enforcement_strength ?? null;
    return {
      enforcementStrength,
      witnessMechanism: data?.witness_mechanism ?? null,
      isDowngrade: enforcementStrength === 'convention',
    };
  } catch {
    return { enforcementStrength: null, witnessMechanism: null, isDowngrade: false };
  }
}

export async function recordWitnessEvent(supabase, { gateId, witnessSessionId, judgedSessionId, verdict, notes }) {
  if (witnessSessionId === judgedSessionId) {
    throw new Error(
      `recordWitnessEvent: witness_session_id and judged_session_id must differ (both were "${witnessSessionId}") -- a session cannot witness its own work`
    );
  }
  if (!['witnessed', 'rejected'].includes(verdict)) {
    throw new Error(`recordWitnessEvent: verdict must be 'witnessed' or 'rejected', got "${verdict}"`);
  }

  const { enforcementStrength, witnessMechanism, isDowngrade } = await lookupGateStrength(supabase, gateId);

  const { data, error } = await supabase
    .from('gate_witness_events')
    .insert({
      gate_id: gateId,
      witness_session_id: witnessSessionId,
      judged_session_id: judgedSessionId,
      verdict,
      notes: notes || null,
      enforcement_strength: enforcementStrength,
      witness_mechanism: witnessMechanism,
      is_downgrade: isDowngrade,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`recordWitnessEvent: insert failed: ${error.message}`);
  }
  return data;
}
