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
