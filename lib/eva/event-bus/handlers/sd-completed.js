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
    console.log(`[SdCompleted] SD ${sdKey} has no parent - orchestrator-level completion, skipping task update`);
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
    console.log(`[SdCompleted] No Stage 19 record for venture ${ventureId} - creating one`);
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

  console.log(
    `[SdCompleted] Updated Stage 19 for venture ${ventureId}: ` +
    `${completedTasks}/${totalTasks} tasks done (${completionPct}%)` +
    (stageStatus === 'completed' ? ' - SPRINT COMPLETE' : ''),
  );

  // When all siblings reach terminal state, write Stage 20 (QA) and Stage 21 (Integration) data
  if (allTerminal && totalTasks > 0) {
    await writeStage20QAData(supabase, ventureId, tasks, failedSiblings, completedTasks, totalTasks, completionPct);
    await writeStage21IntegrationData(supabase, ventureId, tasks, siblings, failedSiblings, completedTasks, totalTasks);
  }

  return {
    outcome: stageStatus === 'completed' ? 'sprint_complete' : 'task_updated',
    sdKey,
    tasksUpdated: 1,
    totalTasks,
    completedTasks,
    completionPct,
    sprintComplete: stageStatus === 'completed',
    issueCount: failedSiblings.length,
    stage20Written: allTerminal && totalTasks > 0,
    stage21Written: allTerminal && totalTasks > 0,
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
 * Write Stage 20 (QA) advisory_data when all siblings reach terminal state.
 * Derives quality metrics from SD completion rates.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} ventureId - Venture UUID
 * @param {Array} tasks - Task array from sibling mapping
 * @param {Array} failedSiblings - Siblings with cancelled/on_hold status
 * @param {number} completedTasks - Count of done tasks
 * @param {number} totalTasks - Total task count
 * @param {number} completionPct - Completion percentage
 */
async function writeStage20QAData(supabase, ventureId, tasks, failedSiblings, completedTasks, totalTasks, completionPct) {
  try {
    const passRate = totalTasks > 0
      ? Math.round((completedTasks / totalTasks) * 10000) / 100
      : 0;

    let decision;
    if (passRate >= 95) decision = 'pass';
    else if (passRate >= 85) decision = 'conditional_pass';
    else decision = 'fail';

    const advisoryData = {
      test_suites: [{
        name: 'SD Completion Suite',
        type: 'integration',
        total_tests: totalTasks,
        passing_tests: completedTasks,
        coverage_pct: totalTasks > 0 ? 100 : 0,
      }],
      known_defects: failedSiblings.map(s => ({
        description: `SD ${s.sd_key} (${s.title}) has status: ${s.status}`,
        severity: classifyIssueSeverity(s) === 'high' ? 'critical' : 'medium',
        status: 'open',
      })),
      qualityDecision: {
        decision,
        rationale: `Real data: ${completedTasks}/${totalTasks} SDs completed (${passRate}% pass rate)`,
      },
      overall_pass_rate: passRate,
      coverage_pct: totalTasks > 0 ? 100 : 0,
      critical_failures: failedSiblings.length,
      total_tests: totalTasks,
      total_passing: completedTasks,
      quality_gate_passed: passRate === 100,
      last_updated: new Date().toISOString(),
    };

    // Upsert Stage 20 record
    const { data: existing } = await supabase
      .from('venture_stage_work')
      .select('id')
      .eq('venture_id', ventureId)
      .eq('lifecycle_stage', 20)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('venture_stage_work')
        .update({
          advisory_data: advisoryData,
          stage_status: 'completed',
          health_score: decision === 'pass' ? 'green' : decision === 'conditional_pass' ? 'yellow' : 'red',
          completed_at: new Date().toISOString(),
        })
        .eq('venture_id', ventureId)
        .eq('lifecycle_stage', 20);
    } else {
      await supabase
        .from('venture_stage_work')
        .insert({
          venture_id: ventureId,
          lifecycle_stage: 20,
          stage_status: 'completed',
          work_type: 'sd_required',
          health_score: decision === 'pass' ? 'green' : decision === 'conditional_pass' ? 'yellow' : 'red',
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          advisory_data: advisoryData,
        });
    }

    console.log(`[SdCompleted] Written Stage 20 QA data: ${decision} (${passRate}% pass rate)`);
  } catch (err) {
    console.warn(`[SdCompleted] Stage 20 write-back failed (non-blocking): ${err.message}`);
  }
}

/**
 * Write Stage 21 (Integration) advisory_data when all siblings reach terminal state.
 * Maps cross-SD dependencies as integration points.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} ventureId - Venture UUID
 * @param {Array} tasks - Task array from sibling mapping
 * @param {Array} siblings - All sibling SDs
 * @param {Array} failedSiblings - Siblings with cancelled/on_hold status
 * @param {number} completedTasks - Count of done tasks
 * @param {number} totalTasks - Total task count
 */
async function writeStage21IntegrationData(supabase, ventureId, tasks, siblings, failedSiblings, completedTasks, totalTasks) {
  try {
    // Map each sibling SD to an integration point
    const integrations = (siblings || []).map(s => {
      const status = mapSdStatusToTaskStatus(s.status);
      const isPassing = status === 'done';
      const isFailing = status === 'blocked';
      return {
        name: `${s.title} Integration`,
        source: s.sd_key,
        target: 'Build Pipeline',
        status: isPassing ? 'pass' : isFailing ? 'fail' : 'pending',
        severity: isFailing ? 'high' : 'medium',
        environment: 'development',
        errorMessage: isFailing ? `SD ${s.sd_key} has status: ${s.status}` : null,
      };
    });

    const passingCount = integrations.filter(ig => ig.status === 'pass').length;
    const failingIntegrations = integrations
      .filter(ig => ig.status === 'fail')
      .map(ig => ({ name: ig.name, source: ig.source, target: ig.target, error_message: ig.errorMessage }));

    const hasCriticalFailure = failedSiblings.some(s => classifyIssueSeverity(s) === 'high');
    let decision;
    if (hasCriticalFailure) decision = 'reject';
    else if (failingIntegrations.length === 0 && integrations.length > 0) decision = 'approve';
    else decision = 'conditional';

    const advisoryData = {
      integrations,
      environment: 'development',
      reviewDecision: {
        decision,
        rationale: `Real data: ${passingCount}/${integrations.length} integrations passing`,
        conditions: decision === 'conditional' ? failingIntegrations.map(f => `Resolve: ${f.name}`) : [],
      },
      total_integrations: integrations.length,
      passing_integrations: passingCount,
      failing_integrations: failingIntegrations,
      pass_rate: integrations.length > 0 ? Math.round((passingCount / integrations.length) * 10000) / 100 : 0,
      all_passing: failingIntegrations.length === 0 && integrations.length > 0,
      last_updated: new Date().toISOString(),
    };

    // Upsert Stage 21 record
    const { data: existing } = await supabase
      .from('venture_stage_work')
      .select('id')
      .eq('venture_id', ventureId)
      .eq('lifecycle_stage', 21)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('venture_stage_work')
        .update({
          advisory_data: advisoryData,
          stage_status: 'completed',
          health_score: decision === 'approve' ? 'green' : decision === 'conditional' ? 'yellow' : 'red',
          completed_at: new Date().toISOString(),
        })
        .eq('venture_id', ventureId)
        .eq('lifecycle_stage', 21);
    } else {
      await supabase
        .from('venture_stage_work')
        .insert({
          venture_id: ventureId,
          lifecycle_stage: 21,
          stage_status: 'completed',
          work_type: 'sd_required',
          health_score: decision === 'approve' ? 'green' : decision === 'conditional' ? 'yellow' : 'red',
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          advisory_data: advisoryData,
        });
    }

    console.log(`[SdCompleted] Written Stage 21 integration data: ${decision} (${passingCount}/${integrations.length} passing)`);
  } catch (err) {
    console.warn(`[SdCompleted] Stage 21 write-back failed (non-blocking): ${err.message}`);
  }
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
