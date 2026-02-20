/**
 * CEO Message Handlers
 * Handles task delegation, completion, status reports, escalation, queries
 *
 * Extracted from venture-ceo-runtime.js for modularity
 * SD-LEO-REFACTOR-VENTURE-CEO-001
 */

import { STAGE_TO_VP } from './constants.js';

/**
 * Handler: Task Delegation
 * CEO delegates tasks to appropriate VPs based on stage ownership
 *
 * @param {Object} context - Runtime context (supabase, agentId, ventureId, agentContext)
 * @param {Object} message - Incoming message
 * @returns {Promise<Object>} Handler result
 */
export async function handleCEOTaskDelegation(context, message) {
  const { supabase, agentContext } = context;
  console.log('   Processing task delegation...');

  const { task_type, stage, description, priority = 'normal' } = message.body || {};

  // Determine which VP should handle this
  const vpAssignment = _determineVpForStage(stage, agentContext);

  if (!vpAssignment) {
    console.warn(`   No VP found for stage ${stage}`);
    return {
      status: 'failed',
      error: `No VP assigned for stage ${stage}`
    };
  }

  // Get VP agent ID
  const { data: vpAgent } = await supabase
    .from('agent_registry')
    .select('id')
    .eq('agent_role', vpAssignment.vp_role)
    .eq('venture_id', context.ventureId)
    .single();

  if (!vpAgent) {
    return {
      status: 'failed',
      error: `VP ${vpAssignment.vp_role} not registered for this venture`
    };
  }

  return {
    status: 'completed',
    delegated_to: vpAssignment.vp_role,
    outbound_messages: [{
      message_type: 'task_delegation',
      to_agent_id: vpAgent.id,
      subject: `[DELEGATED] ${task_type}: ${description?.substring(0, 50)}`,
      body: {
        task_type,
        stage,
        description,
        delegated_by: 'CEO',
        original_message_id: message.id
      },
      priority
    }]
  };
}

/**
 * Handler: Task Completion
 * Process VP task completion reports
 *
 * @param {Object} context - Runtime context
 * @param {Object} message - Incoming message
 * @returns {Promise<Object>} Handler result
 */
export async function handleCEOTaskCompletion(context, message) {
  console.log('   Processing task completion...');

  const { task_id, status, deliverables, metrics } = message.body || {};

  // Update venture progress if applicable
  if (status === 'completed' && metrics?.stage_completed) {
    await _updateVentureProgress(context, metrics.stage_completed);
  }

  return {
    status: 'completed',
    memory_update: {
      type: 'task_completion',
      content: {
        task_id,
        completed_by: message.from_agent_id,
        status,
        deliverables_count: deliverables?.length || 0,
        metrics,
        timestamp: new Date().toISOString()
      }
    }
  };
}

/**
 * Handler: Status Report
 * Process VP status reports and aggregate for EVA
 *
 * @param {Object} context - Runtime context
 * @param {Object} message - Incoming message
 * @returns {Promise<Object>} Handler result
 */
export async function handleCEOStatusReport(context, message) {
  console.log('   Processing status report...');

  const { department, status, blockers = [], progress } = message.body || {};

  // Check for critical blockers requiring escalation
  const criticalBlockers = blockers.filter(b => b.severity === 'critical');

  let result = {
    status: 'completed',
    memory_update: {
      type: 'status_report',
      content: {
        department,
        status,
        blockers_count: blockers.length,
        critical_blockers: criticalBlockers.length,
        progress,
        reported_by: message.from_agent_id,
        timestamp: new Date().toISOString()
      }
    }
  };

  // Auto-escalate critical blockers
  if (criticalBlockers.length > 0) {
    console.log(`   Critical blockers detected: ${criticalBlockers.length}`);
    result.escalation_required = true;
    result.critical_blockers = criticalBlockers;
  }

  return result;
}

/**
 * Handler: Escalation
 * Handle escalated issues from VPs
 *
 * @param {Object} context - Runtime context
 * @param {Object} message - Incoming message
 * @returns {Promise<Object>} Handler result
 */
export async function handleCEOEscalation(context, message) {
  const { supabase } = context;
  console.log('   Processing escalation...');

  const { issue, severity = 'medium', recommended_action: _recommended_action } = message.body || {};

  // CEO decision based on severity
  if (severity === 'low' || severity === 'medium') {
    // CEO can handle these
    console.log('   CEO handling escalation directly');
    return {
      status: 'completed',
      ceo_action: 'direct_handling',
      memory_update: {
        type: 'escalation',
        content: {
          action: 'escalation_handled',
          issue: issue,
          resolution_pending: true,
          timestamp: new Date().toISOString()
        }
      }
    };
  }

  // Forward to EVA for high/critical
  console.log('   Forwarding to EVA');
  const { data: eva } = await _getEvaAgent(supabase);

  return {
    status: 'completed',
    forwarded_to: 'EVA',
    outbound_messages: [{
      message_type: 'escalation',
      to_agent_id: eva?.id,
      subject: `[ESCALATED FROM CEO] ${message.subject}`,
      body: {
        original_from: message.from_agent_id,
        original_issue: issue,
        severity: severity,
        ceo_notes: 'Beyond CEO authority, forwarding to EVA'
      },
      priority: 'critical'
    }]
  };
}

/**
 * Handler: Query
 * Respond to information requests
 *
 * @param {Object} context - Runtime context
 * @param {Object} message - Incoming message
 * @returns {Promise<Object>} Handler result
 */
export async function handleCEOQuery(context, message) {
  const { supabase, ventureId } = context;
  console.log('   Processing query...');

  const { query_type } = message.body || {};

  // Build response based on query type
  let response_data = {};

  switch (query_type) {
    case 'venture_status':
      response_data = await _getVentureStatus(supabase, ventureId);
      break;
    case 'vp_status':
      response_data = await _getVpStatuses(supabase, ventureId);
      break;
    default:
      response_data = { error: `Unknown query type: ${query_type}` };
  }

  return {
    status: 'completed',
    outbound_messages: [{
      message_type: 'response',
      to_agent_id: message.from_agent_id,
      correlation_id: message.correlation_id,
      subject: `[RESPONSE] ${message.subject}`,
      body: response_data,
      priority: 'normal'
    }]
  };
}

/**
 * Handler: Response
 * Process response to previous query
 *
 * @param {Object} context - Runtime context
 * @param {Object} message - Incoming message
 * @returns {Promise<Object>} Handler result
 */
export async function handleCEOResponse(context, message) {
  console.log('   Processing response...');

  return {
    status: 'completed',
    memory_update: {
      type: 'context',
      content: {
        action: 'response_received',
        correlation_id: message.correlation_id,
        response_summary: message.subject,
        timestamp: new Date().toISOString()
      }
    }
  };
}

/**
 * Handler: Mission Draft
 * CEO proposes a mission revision for chairman review
 *
 * @param {Object} context - Runtime context (supabase, ventureId)
 * @param {Object} message - Incoming message with body.mission_text and body.reasoning
 * @returns {Promise<Object>} Handler result
 */
export async function handleCEOMissionDraft(context, message) {
  const { supabase, ventureId } = context;
  console.log('   Processing mission draft...');

  const { mission_text, reasoning } = message.body || {};

  if (!mission_text) {
    return {
      status: 'failed',
      error: 'mission_text is required in message body'
    };
  }

  // Get current max version for this venture
  const { data: currentMissions } = await supabase
    .from('missions')
    .select('version')
    .eq('venture_id', ventureId)
    .order('version', { ascending: false })
    .limit(1);

  const nextVersion = (currentMissions?.[0]?.version || 0) + 1;

  // Insert draft mission
  const { data: draft, error } = await supabase
    .from('missions')
    .insert({
      venture_id: ventureId,
      mission_text,
      version: nextVersion,
      status: 'draft',
      proposed_by: 'ceo_agent',
      reasoning: reasoning || null
    })
    .select('id, version, status')
    .single();

  if (error) {
    console.warn(`   Failed to create mission draft: ${error.message}`);
    return {
      status: 'failed',
      error: `Mission draft creation failed: ${error.message}`
    };
  }

  // Emit event for audit trail
  try {
    await supabase
      .from('eva_event_log')
      .insert({
        event_type: 'ceo.mission.drafted',
        payload: {
          mission_id: draft.id,
          venture_id: ventureId,
          version: draft.version,
          _service: 'venture-ceo'
        },
        trigger_source: 'manual',
        correlation_id: message.id || `mission-draft-v${draft.version}`,
        status: 'completed',
        created_at: new Date().toISOString()
      });
  } catch (emitErr) {
    console.warn(`   Event emit failed (non-blocking): ${emitErr.message}`);
  }

  console.log(`   Mission draft v${draft.version} created: ${draft.id}`);

  return {
    status: 'completed',
    result: {
      mission_id: draft.id,
      version: draft.version,
      status: 'draft'
    },
    memory_update: {
      type: 'context',
      content: {
        action: 'mission_drafted',
        mission_id: draft.id,
        version: draft.version,
        timestamp: new Date().toISOString()
      }
    }
  };
}

/**
 * Handler: OKR Tracking
 * Queries OKR objectives and key results for the venture, computes scores
 * Supports action=generate to trigger monthly OKR generation
 *
 * @param {Object} context - Runtime context (supabase, ventureId)
 * @param {Object} message - Incoming message with optional body.action
 * @returns {Promise<Object>} Handler result
 */
export async function handleCEOOKRTracking(context, message) {
  const { supabase, ventureId } = context;
  console.log('   Processing OKR tracking...');

  const { action } = message.body || {};

  // Sub-command: trigger monthly OKR generation
  if (action === 'generate') {
    try {
      const { runOkrMonthlyGeneration } = await import('../../eva/jobs/okr-monthly-generator.js');
      const result = await runOkrMonthlyGeneration({ supabase, logger: console, dryRun: false });
      return {
        status: 'completed',
        result: { action: 'generate', ...result },
        memory_update: {
          type: 'context',
          content: {
            action: 'okr_generation_triggered',
            timestamp: new Date().toISOString()
          }
        }
      };
    } catch (err) {
      return { status: 'failed', error: `OKR generation failed: ${err.message}` };
    }
  }

  // Default: return OKR summary
  const { data: objectives, error: objErr } = await supabase
    .from('okr_objectives')
    .select('id, code, title, is_active')
    .eq('is_active', true);

  if (objErr) {
    return { status: 'failed', error: `Failed to fetch objectives: ${objErr.message}` };
  }

  if (!objectives || objectives.length === 0) {
    return {
      status: 'completed',
      result: { objective_count: 0, kr_count: 0, overall_score: 0, objectives: [] }
    };
  }

  const objIds = objectives.map(o => o.id);
  const { data: keyResults, error: krErr } = await supabase
    .from('key_results')
    .select('id, objective_id, title, current_value, target_value, baseline_value, direction')
    .in('objective_id', objIds)
    .eq('is_active', true);

  if (krErr) {
    return { status: 'failed', error: `Failed to fetch key results: ${krErr.message}` };
  }

  // Compute per-objective scores using existing utility
  const { computeObjectiveScore } = await import('../../eva/jobs/okr-monthly-handler.js');
  const scoredObjectives = objectives.map(obj => {
    const objKRs = (keyResults || []).filter(kr => kr.objective_id === obj.id);
    return {
      code: obj.code,
      title: obj.title,
      score: computeObjectiveScore(objKRs),
      kr_count: objKRs.length,
      key_results: objKRs.map(kr => ({
        title: kr.title,
        current_value: kr.current_value,
        target_value: kr.target_value
      }))
    };
  });

  const totalScore = scoredObjectives.length > 0
    ? Math.round(scoredObjectives.reduce((sum, o) => sum + o.score, 0) / scoredObjectives.length)
    : 0;

  return {
    status: 'completed',
    result: {
      objective_count: objectives.length,
      kr_count: (keyResults || []).length,
      overall_score: totalScore,
      objectives: scoredObjectives
    },
    memory_update: {
      type: 'context',
      content: {
        action: 'okr_tracking_queried',
        overall_score: totalScore,
        objective_count: objectives.length,
        timestamp: new Date().toISOString()
      }
    }
  };
}

/**
 * Handler: Monthly CEO Report
 * Aggregates OKR summary, mission status, task metrics, and budget utilization
 * Stores report in monthly_ceo_reports table
 *
 * @param {Object} context - Runtime context (supabase, ventureId)
 * @param {Object} message - Incoming message with optional body.period (YYYY-MM)
 * @returns {Promise<Object>} Handler result
 */
export async function handleCEOMonthlyReport(context, message) {
  const { supabase, ventureId } = context;
  console.log('   Processing monthly report...');

  const now = new Date();
  const period = message.body?.period || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // 1. OKR Summary
  let okr_summary = { objective_count: 0, kr_count: 0, overall_score: 0 };
  try {
    const okrResult = await handleCEOOKRTracking(context, { body: {} });
    if (okrResult.status === 'completed') {
      okr_summary = {
        objective_count: okrResult.result.objective_count,
        kr_count: okrResult.result.kr_count,
        overall_score: okrResult.result.overall_score
      };
    }
  } catch { /* non-blocking */ }

  // 2. Mission Status
  let mission_status = { active_mission: null, total_versions: 0 };
  try {
    const { data: missions } = await supabase
      .from('missions')
      .select('id, mission_text, version, status')
      .eq('venture_id', ventureId)
      .order('version', { ascending: false })
      .limit(5);

    const active = missions?.find(m => m.status === 'active');
    mission_status = {
      active_mission: active ? { text: active.mission_text, version: active.version } : null,
      total_versions: missions?.length || 0,
      latest_status: missions?.[0]?.status || 'none'
    };
  } catch { /* non-blocking */ }

  // 3. Task Metrics (from agent_messages)
  let task_metrics = { total: 0, completed: 0, failed: 0, completion_rate: 0 };
  try {
    const { data: msgs } = await supabase
      .from('agent_messages')
      .select('status')
      .eq('to_agent_id', context.agentId)
      .gte('created_at', `${period}-01`);

    if (msgs && msgs.length > 0) {
      const completed = msgs.filter(m => m.status === 'completed').length;
      const failed = msgs.filter(m => m.status === 'failed').length;
      task_metrics = {
        total: msgs.length,
        completed,
        failed,
        completion_rate: Math.round((completed / msgs.length) * 100)
      };
    }
  } catch { /* non-blocking */ }

  // 4. Budget Summary (from agent_registry token consumption)
  let budget_summary = { available: false };
  try {
    const { data: agent } = await supabase
      .from('agent_registry')
      .select('token_consumed, token_budget')
      .eq('id', context.agentId)
      .single();

    if (agent) {
      const consumed = agent.token_consumed || 0;
      const budget = agent.token_budget || 0;
      budget_summary = {
        available: true,
        consumed: consumed,
        budget: budget,
        consumed_percent: budget > 0 ? Math.round((consumed / budget) * 100) : 0
      };
    }
  } catch { /* non-blocking */ }

  const content = { okr_summary, mission_status, task_metrics, budget_summary };

  // Store in monthly_ceo_reports
  const { data: report, error } = await supabase
    .from('monthly_ceo_reports')
    .upsert({
      venture_id: ventureId,
      period,
      content,
      generated_by: 'ceo_agent'
    }, { onConflict: 'venture_id,period' })
    .select('id, period')
    .single();

  if (error) {
    console.warn(`   Monthly report storage failed: ${error.message}`);
    // Return the report content even if storage fails
    return {
      status: 'completed',
      result: { period, content, stored: false, error: error.message }
    };
  }

  // Emit event
  try {
    await supabase.from('eva_event_log').insert({
      event_type: 'ceo.monthly_report.generated',
      payload: {
        report_id: report.id,
        venture_id: ventureId,
        period,
        _service: 'venture-ceo'
      },
      trigger_source: 'manual',
      correlation_id: message.id || `report-${period}`,
      status: 'completed',
      created_at: new Date().toISOString()
    });
  } catch { /* non-blocking */ }

  console.log(`   Monthly report generated for ${period}: ${report.id}`);

  return {
    status: 'completed',
    result: {
      report_id: report.id,
      period,
      content,
      stored: true
    },
    memory_update: {
      type: 'context',
      content: {
        action: 'monthly_report_generated',
        report_id: report.id,
        period,
        timestamp: new Date().toISOString()
      }
    }
  };
}

// ============ Private Helper Functions ============

/**
 * Determine which VP should handle a stage
 * @private
 */
function _determineVpForStage(stage, agentContext) {
  for (const [vpRole, stages] of Object.entries(STAGE_TO_VP)) {
    if (stages.includes(stage)) {
      return {
        vp_role: vpRole,
        vp_id: agentContext?.vp_ids?.[vpRole] || null
      };
    }
  }
  return null;
}

/**
 * Update venture progress
 * @private
 */
async function _updateVentureProgress(context, completedStage) {
  const { supabase, ventureId } = context;
  try {
    await supabase
      .from('ventures')
      .update({
        current_lifecycle_stage: completedStage + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', ventureId);
    console.log(`   Venture progress updated to stage ${completedStage + 1}`);
  } catch (err) {
    console.warn(`   Failed to update venture progress: ${err.message}`);
  }
}

/**
 * Get EVA agent
 * @private
 */
async function _getEvaAgent(supabase) {
  return supabase
    .from('agent_registry')
    .select('id')
    .eq('agent_type', 'eva')
    .single();
}

/**
 * Get venture status
 * @private
 */
async function _getVentureStatus(supabase, ventureId) {
  const { data } = await supabase
    .from('ventures')
    .select('id, name, current_lifecycle_stage, status')
    .eq('id', ventureId)
    .single();

  return data || { error: 'Venture not found' };
}

/**
 * Get VP statuses
 * @private
 */
async function _getVpStatuses(supabase, ventureId) {
  const { data } = await supabase
    .from('agent_registry')
    .select('id, agent_role, status, token_consumed')
    .eq('venture_id', ventureId)
    .eq('agent_type', 'executive');

  return data || [];
}
