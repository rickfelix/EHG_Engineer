/**
 * Handler: gate.evaluated
 * SD: SD-EVA-FEAT-EVENT-BUS-001
 *
 * When a gate evaluation completes, execute the appropriate action:
 * - proceed: trigger stage progression
 * - block: block the venture with reason
 * - kill: terminate the venture
 */

/**
 * Handle a gate.evaluated event.
 * @param {object} payload - { ventureId, gateId, outcome, reason? }
 * @param {object} context - { supabase, ventureId }
 * @returns {Promise<{ outcome: string, action: string }>}
 */
export async function handleGateEvaluated(payload, context) {
  const { supabase } = context;
  const { ventureId, gateId, outcome, reason } = payload;

  switch (outcome) {
    case 'proceed':
      return await handleProceed(supabase, ventureId, gateId);

    case 'block':
      return await handleBlock(supabase, ventureId, gateId, reason);

    case 'kill':
      return await handleKill(supabase, ventureId, gateId);

    default: {
      const err = new Error(`Invalid gate outcome: ${outcome}`);
      err.retryable = false;
      throw err;
    }
  }
}

async function handleProceed(supabase, ventureId, gateId) {
  // Look up the current venture
  const { data: venture, error } = await supabase
    .from('eva_ventures')
    .select('id, status')
    .eq('id', ventureId)
    .single();

  if (error || !venture) {
    const err = new Error(`Venture not found: ${ventureId}`);
    err.retryable = false;
    throw err;
  }

  // Try to find next stage (tables may not exist yet)
  // eva_ventures has no stage column, so pass null
  const nextStage = await findNextStage(supabase, ventureId, null);

  if (!nextStage) {
    console.log(`[GateEvaluated] Gate ${gateId} passed, but no next stage for venture ${ventureId}`);
    return { outcome: 'proceed', action: 'pipeline_complete', ventureId, gateId };
  }

  await supabase
    .from('eva_ventures')
    .update({ status: 'active' })
    .eq('id', ventureId);

  console.log(`[GateEvaluated] Gate ${gateId} passed - advancing venture ${ventureId} to stage ${nextStage.name}`);
  return { outcome: 'proceed', action: 'advanced', ventureId, gateId, nextStageId: nextStage.id };
}

async function handleBlock(supabase, ventureId, gateId, reason) {
  await supabase
    .from('eva_ventures')
    .update({ status: 'blocked' })
    .eq('id', ventureId);

  // Record the block reason in audit log
  await supabase.from('eva_audit_log').insert({
    eva_venture_id: ventureId,
    action_type: 'venture_blocked',
    action_data: {
      gateId,
      reason: reason || 'Gate evaluation failed',
      blockedAt: new Date().toISOString(),
    },
  });

  console.log(`[GateEvaluated] Gate ${gateId} blocked venture ${ventureId}: ${reason || 'no reason'}`);
  return { outcome: 'block', action: 'blocked', ventureId, gateId, reason: reason || 'Gate evaluation failed' };
}

async function handleKill(supabase, ventureId, gateId) {
  await supabase
    .from('eva_ventures')
    .update({ status: 'terminated' })
    .eq('id', ventureId);

  // Record termination in audit log
  await supabase.from('eva_audit_log').insert({
    eva_venture_id: ventureId,
    action_type: 'venture_terminated',
    action_data: {
      gateId,
      terminatedAt: new Date().toISOString(),
      trigger: 'gate_evaluation_kill',
    },
  });

  console.log(`[GateEvaluated] Gate ${gateId} KILLED venture ${ventureId}`);
  return { outcome: 'kill', action: 'terminated', ventureId, gateId };
}

/**
 * Find the next stage after the current one. Handles missing tables gracefully.
 */
async function findNextStage(supabase, ventureId, currentStage) {
  // Try venture_stages table
  try {
    const { data, error } = await supabase
      .from('venture_stages')
      .select('id, stage_number, name')
      .eq('venture_id', ventureId)
      .order('stage_number', { ascending: true });

    if (!error && data && data.length > 0) {
      const currentIdx = data.findIndex(s => s.stage_number === currentStage);
      const next = currentIdx >= 0 ? data[currentIdx + 1] : null;
      if (next) return { id: next.id, stageNumber: next.stage_number, name: next.name };
    }
  } catch { /* table may not exist */ }

  // Try eva_stage_configs
  try {
    const { data, error } = await supabase
      .from('eva_stage_configs')
      .select('stage_id, sequence_order, stage_name')
      .eq('pipeline_id', ventureId)
      .order('sequence_order', { ascending: true });

    if (!error && data && data.length > 0) {
      const currentIdx = data.findIndex(s => s.sequence_order === currentStage);
      const next = currentIdx >= 0 ? data[currentIdx + 1] : null;
      if (next) return { id: next.stage_id, stageNumber: next.sequence_order, name: next.stage_name };
    }
  } catch { /* table may not exist */ }

  return null;
}
