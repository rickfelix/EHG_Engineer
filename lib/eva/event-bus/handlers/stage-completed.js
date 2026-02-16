/**
 * Handler: stage.completed
 * SD: SD-EVA-FEAT-EVENT-BUS-001
 *
 * When a stage completes, evaluate and transition to the next stage.
 * If no next stage exists or stage tables aren't configured, complete successfully with info outcome.
 */

import { createLogger } from '../../../logger.js';

const log = createLogger('StageCompleted');

/**
 * Handle a stage.completed event.
 * @param {object} payload - { ventureId, stageId, completedAt }
 * @param {object} context - { supabase, ventureId }
 * @returns {Promise<{ outcome: string, nextStageId?: string }>}
 */
export async function handleStageCompleted(payload, context) {
  const { supabase } = context;
  const { ventureId, stageId } = payload;

  // Look up the venture
  const { data: venture, error: ventureError } = await supabase
    .from('eva_ventures')
    .select('id, status')
    .eq('id', ventureId)
    .single();

  if (ventureError || !venture) {
    const err = new Error(`Venture not found: ${ventureId}`);
    err.retryable = false;
    throw err;
  }

  // Try to find stage configuration (tables may not exist yet)
  const stages = await findStages(supabase, ventureId);

  if (!stages || stages.length === 0) {
    log.info('No stages found - tables may not be configured yet', { ventureId });
    return { outcome: 'no_stages_configured', ventureId, stageId };
  }

  // Find current stage and next
  const currentIdx = stages.findIndex(s =>
    s.id === stageId || String(s.stageNumber) === String(stageId)
  );

  if (currentIdx === -1) {
    log.info('Stage not found in venture stages', { stageId, ventureId });
    return { outcome: 'stage_not_found', ventureId, stageId };
  }

  const nextStage = stages[currentIdx + 1];
  if (!nextStage) {
    log.info('No next stage - pipeline complete', { stageId, ventureId });
    return { outcome: 'no_next_stage', ventureId, stageId };
  }

  // Advance to next stage (update status to active; stage tracking via stage tables)
  await supabase
    .from('eva_ventures')
    .update({ status: 'active' })
    .eq('id', ventureId);

  log.info('Advanced venture to next stage', { ventureId, stageId, nextStage: nextStage.name });
  return { outcome: 'advanced', ventureId, stageId, nextStageId: nextStage.id, nextStageName: nextStage.name };
}

/**
 * Find stages from available tables. Handles tables not existing gracefully.
 */
async function findStages(supabase, ventureId) {
  // Try eva_stage_configs first
  try {
    const { data, error } = await supabase
      .from('eva_stage_configs')
      .select('stage_id, sequence_order, stage_name')
      .eq('pipeline_id', ventureId)
      .order('sequence_order', { ascending: true });

    if (!error && data && data.length > 0) {
      return data.map(s => ({ id: s.stage_id, stageNumber: s.sequence_order, name: s.stage_name }));
    }
  } catch { /* table may not exist */ }

  // Try venture_stages
  try {
    const { data, error } = await supabase
      .from('venture_stages')
      .select('id, stage_number, name, status')
      .eq('venture_id', ventureId)
      .order('stage_number', { ascending: true });

    if (!error && data && data.length > 0) {
      return data.map(s => ({ id: s.id, stageNumber: s.stage_number, name: s.name }));
    }
  } catch { /* table may not exist */ }

  return [];
}
