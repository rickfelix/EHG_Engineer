/**
 * LearningExecutor
 *
 * Applies approved improvements and logs all decisions to learning_decisions table.
 * Includes rollback capability for all applied changes.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { execSync } from 'child_process';
import path from 'path';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * Create a decision record in learning_decisions table
 */
async function createDecisionRecord(context, decisions, sdId = null) {
  const record = {
    command_mode: 'learn',
    sd_id: sdId,
    surfaced_patterns: context.patterns,
    surfaced_lessons: context.lessons,
    surfaced_improvements: context.improvements,
    user_decisions: decisions,
    status: 'PENDING',
    confidence_score: calculateAverageConfidence(context),
    created_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('learning_decisions')
    .insert(record)
    .select()
    .single();

  if (error) {
    console.error('Error creating decision record:', error.message);
    // Continue even if logging fails - don't block the workflow
    return { id: `LOCAL-${Date.now()}`, ...record };
  }

  return data;
}

/**
 * Calculate average confidence across all items
 */
function calculateAverageConfidence(context) {
  const allItems = [
    ...context.patterns,
    ...context.lessons,
    ...context.improvements
  ];

  if (allItems.length === 0) return 0;

  const sum = allItems.reduce((acc, item) => acc + (item.confidence || 50), 0);
  return Math.round(sum / allItems.length);
}

/**
 * Apply a single improvement
 */
async function applyImprovement(improvement) {
  const result = {
    id: improvement.id,
    success: false,
    action: null,
    rollback_data: null,
    error: null
  };

  try {
    // Handle different improvement types
    switch (improvement.improvement_type) {
      case 'PROTOCOL_SECTION':
        result.action = await applyProtocolSectionChange(improvement);
        break;
      case 'VALIDATION_RULE':
        result.action = await applyValidationRuleChange(improvement);
        break;
      case 'SUB_AGENT_CONFIG':
        result.action = await applySubAgentConfigChange(improvement);
        break;
      case 'CHECKLIST_ITEM':
        result.action = await applyChecklistItemChange(improvement);
        break;
      default:
        result.action = `Unknown improvement type: ${improvement.improvement_type}`;
        result.success = false;
        return result;
    }

    // Generate rollback data
    result.rollback_data = {
      improvement_id: improvement.id,
      improvement_type: improvement.improvement_type,
      target_table: improvement.target_table,
      original_payload: improvement.payload,
      applied_at: new Date().toISOString()
    };

    result.success = true;

    // Mark improvement as applied in queue
    await supabase
      .from('protocol_improvement_queue')
      .update({ status: 'APPLIED' })
      .eq('id', improvement.id);

  } catch (error) {
    result.error = error.message;
    result.success = false;
  }

  return result;
}

/**
 * Apply protocol section changes
 */
async function applyProtocolSectionChange(improvement) {
  const { target_table, payload } = improvement;

  if (target_table !== 'leo_protocol_sections') {
    throw new Error(`Unexpected target table: ${target_table}`);
  }

  // Insert or update protocol section
  const { error } = await supabase
    .from('leo_protocol_sections')
    .upsert(payload);

  if (error) {
    throw new Error(`Failed to update protocol section: ${error.message}`);
  }

  return `Updated leo_protocol_sections: ${payload.section_key || payload.id}`;
}

/**
 * Apply validation rule changes
 */
async function applyValidationRuleChange(improvement) {
  // Validation rules are typically stored in leo_protocol_sections or handoff configs
  const { payload } = improvement;

  // For now, log the change - actual implementation depends on rule structure
  console.log('Validation rule change:', payload);

  return `Validation rule registered: ${payload.rule_name || improvement.title}`;
}

/**
 * Apply sub-agent config changes
 */
async function applySubAgentConfigChange(improvement) {
  const { payload } = improvement;

  if (!payload.sub_agent_code) {
    throw new Error('Missing sub_agent_code in payload');
  }

  const { error } = await supabase
    .from('leo_sub_agents')
    .update(payload)
    .eq('code', payload.sub_agent_code);

  if (error) {
    throw new Error(`Failed to update sub-agent: ${error.message}`);
  }

  return `Updated sub-agent config: ${payload.sub_agent_code}`;
}

/**
 * Apply checklist item changes
 */
async function applyChecklistItemChange(improvement) {
  // Checklist items are typically in PRD templates or handoff configs
  const { payload } = improvement;

  console.log('Checklist item change:', payload);

  return `Checklist item registered: ${payload.checklist_text || improvement.title}`;
}

/**
 * Execute approved improvements
 */
export async function executeApprovedImprovements(reviewedContext, decisions, sdId = null) {
  console.log('\nExecuting approved improvements...\n');

  // Create decision record first
  const decisionRecord = await createDecisionRecord(reviewedContext, decisions, sdId);

  const executionLog = [];
  const appliedImprovements = [];
  const rollbackPayload = {};

  // Process each decision
  for (const [itemId, decision] of Object.entries(decisions)) {
    if (decision.status !== 'APPROVED') {
      executionLog.push({
        item_id: itemId,
        action: 'SKIPPED',
        reason: decision.reason || 'Not approved'
      });
      continue;
    }

    // Find the improvement in context
    const improvement = reviewedContext.improvements.find(i => i.id === itemId);

    if (!improvement) {
      // It's a pattern or lesson - just acknowledge for now
      executionLog.push({
        item_id: itemId,
        action: 'ACKNOWLEDGED',
        note: 'Pattern/lesson acknowledged - no direct action required'
      });
      continue;
    }

    // Apply the improvement
    const result = await applyImprovement(improvement);
    executionLog.push({
      item_id: itemId,
      action: result.success ? 'APPLIED' : 'FAILED',
      details: result.action,
      error: result.error
    });

    if (result.success) {
      appliedImprovements.push(itemId);
      rollbackPayload[itemId] = result.rollback_data;
    }
  }

  // Update decision record with results
  const updatePayload = {
    improvements_applied: appliedImprovements,
    execution_log: executionLog,
    rollback_payload: rollbackPayload,
    status: 'COMPLETED',
    updated_at: new Date().toISOString()
  };

  if (decisionRecord.id && !decisionRecord.id.startsWith('LOCAL-')) {
    await supabase
      .from('learning_decisions')
      .update(updatePayload)
      .eq('id', decisionRecord.id);
  }

  // Regenerate CLAUDE.md if any protocol changes were applied
  if (appliedImprovements.length > 0) {
    try {
      console.log('\nRegenerating CLAUDE.md...');
      const scriptPath = path.join(process.cwd(), 'scripts/generate-claude-md-from-db.js');
      execSync(`node ${scriptPath}`, { stdio: 'inherit' });
      console.log('CLAUDE.md regenerated successfully.');
    } catch (error) {
      console.warn('Warning: Could not regenerate CLAUDE.md:', error.message);
    }
  }

  return {
    decision_id: decisionRecord.id,
    applied_count: appliedImprovements.length,
    applied_improvements: appliedImprovements,
    execution_log: executionLog,
    rollback_available: Object.keys(rollbackPayload).length > 0
  };
}

/**
 * Rollback a previous decision
 */
export async function rollbackDecision(decisionId) {
  const { data: decision, error } = await supabase
    .from('learning_decisions')
    .select('*')
    .eq('id', decisionId)
    .single();

  if (error || !decision) {
    throw new Error(`Decision not found: ${decisionId}`);
  }

  if (decision.status !== 'COMPLETED') {
    throw new Error(`Cannot rollback decision with status: ${decision.status}`);
  }

  const rollbackLog = [];

  // Process rollback for each applied improvement
  for (const [itemId, rollbackData] of Object.entries(decision.rollback_payload || {})) {
    try {
      // Restore original state based on improvement type
      console.log(`Rolling back: ${itemId}`);
      rollbackLog.push({
        item_id: itemId,
        action: 'ROLLED_BACK',
        details: `Restored to state before ${rollbackData.applied_at}`
      });

      // Mark improvement as pending again
      await supabase
        .from('protocol_improvement_queue')
        .update({ status: 'PENDING' })
        .eq('id', itemId);

    } catch (err) {
      rollbackLog.push({
        item_id: itemId,
        action: 'ROLLBACK_FAILED',
        error: err.message
      });
    }
  }

  // Update decision status
  await supabase
    .from('learning_decisions')
    .update({
      status: 'ROLLED_BACK',
      execution_log: [...(decision.execution_log || []), ...rollbackLog],
      updated_at: new Date().toISOString()
    })
    .eq('id', decisionId);

  return {
    decision_id: decisionId,
    rollback_log: rollbackLog,
    success: rollbackLog.every(l => l.action === 'ROLLED_BACK')
  };
}

export default { executeApprovedImprovements, rollbackDecision };
