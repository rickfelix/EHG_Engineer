/**
 * Handler: sd.completed
 * SD: SD-EVA-FEAT-RETURN-PATH-001
 *
 * When a LEO SD completes, update Stage 19 (Build Execution) progress.
 * Maps SD completion status to build task status and evaluates
 * sprint completion when all SDs resolve.
 *
 * Handles three user stories:
 * 1. SD completion triggers Stage 19 task status update (idempotent)
 * 2. Partial completion updates progress percentage
 * 3. Failed SDs create issues with severity classification
 */

import { createLogger } from '../../../logger.js';

const log = createLogger('SdCompleted');

// SD types that trigger HIGH severity when they fail
const HIGH_SEVERITY_TYPES = ['security', 'fix', 'infrastructure'];

/**
 * Handle an sd.completed event.
 *
 * @param {object} payload - { sdKey, ventureId, parentSdId, parentSdKey, sdType, title }
 * @param {object} context - { supabase, ventureId }
 * @returns {Promise<{ outcome: string, tasksUpdated?: number, sprintComplete?: boolean }>}
 */
export async function handleSdCompleted(payload, context) {
  const { supabase } = context;
  const { sdKey, ventureId, parentSdId, parentSdKey } = payload;

  if (!ventureId) {
    const err = new Error('Missing ventureId in sd.completed payload');
    err.retryable = false;
    throw err;
  }

  if (!sdKey) {
    const err = new Error('Missing sdKey in sd.completed payload');
    err.retryable = false;
    throw err;
  }

  // Only process child SDs (children of orchestrators map to sprint tasks)
  if (!parentSdId) {
    log.info('SD has no parent - orchestrator-level completion, skipping task update', { sdKey });
    return { outcome: 'no_parent', sdKey };
  }

  // Find the Stage 19 work record for this venture
  const { data: stageWork, error: stageError } = await supabase
    .from('venture_stage_work')
    .select('id, stage_status, sd_id')
    .eq('venture_id', ventureId)
    .eq('lifecycle_stage', 19)
    .maybeSingle();

  if (stageError) {
    throw new Error(`Failed to query venture_stage_work: ${stageError.message}`);
  }

  if (!stageWork) {
    log.info('No Stage 19 record - creating one', { ventureId });
    const { error: insertError } = await supabase
      .from('venture_stage_work')
      .insert({
        venture_id: ventureId,
        lifecycle_stage: 19,
        stage_status: 'in_progress',
        work_type: 'sd_required',
        sd_id: parentSdKey,
        started_at: new Date().toISOString(),
        health_score: 'green',
        advisory_data: {
          tasks: [],
          issues: [],
          total_tasks: 0,
          completed_tasks: 0,
          blocked_tasks: 0,
          completion_pct: 0,
          tasks_by_status: {},
        },
      });

    if (insertError && insertError.code !== '23505') {
      throw new Error(`Failed to create Stage 19 record: ${insertError.message}`);
    }
  }

  // Fetch all sibling SDs (children of the same parent) to assess sprint completion
  const { data: siblings, error: sibError } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, title, status, sd_type, progress')
    .eq('parent_sd_id', parentSdId)
    .order('sd_key', { ascending: true });

  if (sibError) {
    throw new Error(`Failed to query sibling SDs: ${sibError.message}`);
  }

  // Build tasks array from sibling SD statuses
  const tasks = (siblings || []).map(s => ({
    name: s.title,
    status: mapSdStatusToTaskStatus(s.status),
    assignee: 'leo-protocol',
    sprint_item_ref: s.sd_key,
  }));

  // Compute derived fields (matching stage-19 template)
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === 'done').length;
  const blockedTasks = tasks.filter(t => t.status === 'blocked').length;
  const completionPct = totalTasks > 0
    ? Math.round((completedTasks / totalTasks) * 10000) / 100
    : 0;

  const tasksByStatus = {
    todo: tasks.filter(t => t.status === 'todo').length,
    in_progress: tasks.filter(t => t.status === 'in_progress').length,
    done: completedTasks,
    blocked: blockedTasks,
  };

  // All terminal = all SDs in done or blocked
  const allTerminal = tasks.every(t => t.status === 'done' || t.status === 'blocked');
  const sprintComplete = completedTasks === totalTasks && totalTasks > 0;

  // Build advisory data
  const advisoryData = {
    tasks,
    issues: [],
    total_tasks: totalTasks,
    completed_tasks: completedTasks,
    blocked_tasks: blockedTasks,
    completion_pct: completionPct,
    tasks_by_status: tasksByStatus,
    last_sd_completed: sdKey,
    last_updated: new Date().toISOString(),
  };

  // Story 3: Failed SDs create issues with severity classification
  const failedSiblings = (siblings || []).filter(s =>
    s.status === 'cancelled' || s.status === 'on_hold',
  );

  if (failedSiblings.length > 0) {
    advisoryData.issues = failedSiblings.map(s => ({
      description: `SD ${s.sd_key} (${s.title}) has status: ${s.status}`,
      severity: classifyIssueSeverity(s),
      status: 'open',
      sd_type: s.sd_type,
    }));
  }

  // Determine stage status and health
  let stageStatus = 'in_progress';
  let healthScore = 'green';

  if (sprintComplete) {
    stageStatus = 'completed';
  } else if (allTerminal && !sprintComplete) {
    // All SDs resolved but some failed — sprint complete with issues
    stageStatus = 'completed';
  }

  if (blockedTasks > 0) {
    healthScore = 'yellow';
  }
  if (failedSiblings.some(s => classifyIssueSeverity(s) === 'high')) {
    healthScore = 'red';
  } else if (failedSiblings.length > 0) {
    healthScore = 'yellow';
  }

  // Sprint completion evaluation
  if (allTerminal && totalTasks > 0) {
    advisoryData.sprint_evaluation = {
      result: failedSiblings.length === 0 ? 'PASS' : 'FAIL',
      total: totalTasks,
      completed: completedTasks,
      failed: failedSiblings.length,
      high_severity_failures: failedSiblings.filter(s => classifyIssueSeverity(s) === 'high').length,
      evaluated_at: new Date().toISOString(),
    };
  }

  // Update venture_stage_work
  const updatePayload = {
    stage_status: stageStatus,
    health_score: healthScore,
    advisory_data: advisoryData,
  };

  if (stageStatus === 'completed') {
    updatePayload.completed_at = new Date().toISOString();
  }

  const { error: updateError } = await supabase
    .from('venture_stage_work')
    .update(updatePayload)
    .eq('venture_id', ventureId)
    .eq('lifecycle_stage', 19);

  if (updateError) {
    throw new Error(`Failed to update Stage 19: ${updateError.message}`);
  }

  // Record in audit log
  await supabase.from('eva_audit_log').insert({
    eva_venture_id: ventureId,
    action_type: 'sd_completion_synced',
    action_data: {
      sdKey,
      parentSdKey,
      completionPct,
      totalTasks,
      completedTasks,
      sprintComplete: stageStatus === 'completed',
      issueCount: failedSiblings.length,
      syncedAt: new Date().toISOString(),
    },
  }).then(() => {}).catch(() => {}); // Best-effort audit logging

  log.info('Updated Stage 19', {
    ventureId, completedTasks, totalTasks, completionPct,
    sprintComplete: stageStatus === 'completed',
  });

  return {
    outcome: stageStatus === 'completed' ? 'sprint_complete' : 'task_updated',
    sdKey,
    tasksUpdated: 1,
    totalTasks,
    completedTasks,
    completionPct,
    sprintComplete: stageStatus === 'completed',
    issueCount: failedSiblings.length,
  };
}

/**
 * Classify issue severity based on SD type.
 * HIGH for security/infrastructure/fix types, MEDIUM for others.
 *
 * @param {object} sd - { sd_type, status }
 * @returns {'high'|'medium'}
 */
function classifyIssueSeverity(sd) {
  if (HIGH_SEVERITY_TYPES.includes(sd.sd_type)) return 'high';
  if (sd.status === 'cancelled') return 'high';
  return 'medium';
}

/**
 * Map strategic_directives_v2.status to Stage 19 task status.
 *
 * @param {string} sdStatus
 * @returns {'todo'|'in_progress'|'done'|'blocked'}
 */
function mapSdStatusToTaskStatus(sdStatus) {
  switch (sdStatus) {
    case 'completed':
      return 'done';
    case 'draft':
    case 'lead_review':
      return 'todo';
    case 'plan_active':
    case 'exec_active':
    case 'in_progress':
      return 'in_progress';
    case 'on_hold':
    case 'cancelled':
      return 'blocked';
    default:
      return 'todo';
  }
}
