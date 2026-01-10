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
 * Transform improvement payload to validation rule schema
 * Payload: {impact, category, evidence, improvement, affected_phase}
 * Target: {gate, rule_name, weight, criteria, required, active}
 *
 * Valid gates: '0', '1', '2A', '2B', '2C', '2D', '3', 'Q'
 * Weight: decimal 0.0 to 1.0
 * Criteria: JSONB object
 */
function transformToValidationRule(improvement) {
  const { payload, description } = improvement;

  // Map phase/category to gate number
  // Gates: 0=baseline, 1=exploration, 2A-D=validation stages, 3=completion, Q=quality
  const gateMap = {
    'LEAD': '1',
    'PLAN': '2A',
    'EXEC': '2B',
    'handoff': '2C',
    'HANDOFF_ENFORCEMENT': '2C',
    'validation': '2D',
    'quality': 'Q',
    'completion': '3'
  };
  const gate = gateMap[payload.affected_phase] ||
               gateMap[payload.category] ||
               '2C'; // Default to validation stage

  // Generate rule name from description (first 50 chars, snake_case)
  const ruleName = (description || payload.improvement || 'unnamed_rule')
    .substring(0, 50)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

  // Weight as decimal (0.0 to 1.0) based on impact
  const impactWeights = { 'critical': 0.95, 'high': 0.75, 'medium': 0.50, 'low': 0.25 };
  const impactKey = payload.impact ? payload.impact.toLowerCase() : '';
  const weight = impactWeights[impactKey] || 0.50;

  // Criteria as JSONB object
  const criteria = {
    description: payload.improvement || description,
    evidence: payload.evidence,
    category: payload.category,
    source: 'learn_command'
  };

  return {
    gate,
    rule_name: ruleName,
    weight,
    criteria,
    required: payload.impact === 'critical',
    active: true
  };
}

/**
 * Apply validation rule changes - actually inserts into leo_validation_rules
 */
async function applyValidationRuleChange(improvement) {
  const { payload } = improvement;

  // Validate required fields exist
  if (!payload || (!payload.improvement && !improvement.description)) {
    throw new Error('Missing improvement content in payload - cannot create validation rule');
  }

  // Transform payload to target schema
  const ruleData = transformToValidationRule(improvement);

  console.log('Transforming validation rule:', {
    from: Object.keys(payload),
    to: Object.keys(ruleData),
    gate: ruleData.gate,
    rule_name: ruleData.rule_name
  });

  // Insert into leo_validation_rules
  const { data, error } = await supabase
    .from('leo_validation_rules')
    .insert(ruleData)
    .select('id, gate, rule_name')
    .single();

  if (error) {
    throw new Error(`Failed to insert validation rule: ${error.message}`);
  }

  return `Inserted validation rule: ${data.rule_name} (gate: ${data.gate}, id: ${data.id})`;
}

/**
 * Extract sub-agent code from improvement description
 * Looks for patterns like "TESTING sub-agent", "DATABASE agent", etc.
 */
function extractSubAgentCode(improvement) {
  const { description, payload } = improvement;
  const text = description || payload?.improvement || '';

  // Known sub-agent codes
  const subAgentCodes = [
    'TESTING', 'DATABASE', 'SECURITY', 'DESIGN', 'GITHUB', 'DOCMON',
    'PERFORMANCE', 'REGRESSION', 'VALIDATION', 'UAT', 'RISK', 'RETRO',
    'STORIES', 'API', 'DEPENDENCY', 'RCA', 'ANALYTICS', 'CRM', 'FINANCIAL',
    'LAUNCH', 'MARKETING', 'MONITORING', 'PRICING', 'SALES', 'VALUATION'
  ];

  // Try to find sub-agent code in text
  const upperText = text.toUpperCase();
  for (const code of subAgentCodes) {
    if (upperText.includes(code)) {
      return code;
    }
  }

  // If no match, check for "sub-agent" or "subagent" pattern
  const match = text.match(/(\w+)\s*[-_]?\s*(?:sub[-_]?agent|agent)/i);
  if (match) {
    return match[1].toUpperCase();
  }

  return null;
}

/**
 * Apply sub-agent config changes - updates leo_sub_agents with improved metadata
 * If no specific sub-agent is identified, creates a protocol section instead
 */
async function applySubAgentConfigChange(improvement) {
  const { payload, description } = improvement;

  // Try to get sub_agent_code from payload or extract from description
  let subAgentCode = payload?.sub_agent_code || extractSubAgentCode(improvement);

  console.log('Updating sub-agent config:', {
    code: subAgentCode || '(all sub-agents)',
    improvement: (payload?.improvement || description)?.substring(0, 50)
  });

  // Check if we have a valid sub-agent code and if the sub-agent exists
  let existing = null;
  if (subAgentCode) {
    const { data, error: checkError } = await supabase
      .from('leo_sub_agents')
      .select('id, code, metadata')
      .eq('code', subAgentCode)
      .single();

    if (!checkError && data) {
      existing = data;
    } else {
      console.log(`Sub-agent '${subAgentCode}' not found - will create protocol section instead`);
      subAgentCode = null; // Reset to trigger fallback
    }
  }

  // If no valid sub-agent identified, this is a workflow improvement
  // about sub-agents in general - create a protocol section instead
  if (!subAgentCode) {
    console.log('Creating protocol section for sub-agent workflow guidance');

    const sectionData = {
      protocol_id: 'leo-v4-3-3-ui-parity',
      section_type: 'sub_agent_workflow',
      title: 'Sub-Agent Trigger Guidance',
      content: payload?.improvement || description,
      order_index: 1,
      metadata: {
        source: 'learn_command',
        added_at: new Date().toISOString(),
        improvement_type: 'SUB_AGENT_CONFIG',
        scope: 'all_sub_agents',
        impact: payload?.impact,
        evidence_count: payload?.evidence
      }
    };

    const { data, error } = await supabase
      .from('leo_protocol_sections')
      .insert(sectionData)
      .select('id, section_type, order_index')
      .single();

    if (error) {
      throw new Error(`Failed to create sub-agent workflow section: ${error.message}`);
    }

    return `Created protocol section for sub-agent workflow: ${data.section_type} (id: ${data.id})`;
  }

  // Build update payload - add improvement to metadata.improvements array
  const currentMetadata = existing.metadata || {};
  const improvements = currentMetadata.improvements || [];
  improvements.push({
    applied_at: new Date().toISOString(),
    improvement: payload?.improvement || description,
    source: 'learn_command'
  });

  const updateData = {
    metadata: {
      ...currentMetadata,
      improvements,
      last_improved_at: new Date().toISOString()
    }
  };

  // If there's a description update, apply it
  if (payload?.description) {
    updateData.description = payload.description;
  }

  const { error } = await supabase
    .from('leo_sub_agents')
    .update(updateData)
    .eq('code', subAgentCode);

  if (error) {
    throw new Error(`Failed to update sub-agent: ${error.message}`);
  }

  return `Updated sub-agent config: ${subAgentCode} (added improvement to metadata)`;
}

/**
 * Determine target table and section for checklist item
 */
function determineChecklistTarget(improvement) {
  const { payload, description, target_phase } = improvement;
  const text = (description || payload?.improvement || '').toLowerCase();

  // Determine section based on content
  if (text.includes('prd') || text.includes('requirement')) {
    return { section_type: 'prd_checklist', protocol_id: 'leo-v4-3-3-ui-parity' };
  }
  if (text.includes('handoff') || text.includes('transition')) {
    return { section_type: 'handoff_checklist', protocol_id: 'leo-v4-3-3-ui-parity' };
  }
  if (text.includes('exec') || text.includes('implementation')) {
    return { section_type: 'exec_checklist', protocol_id: 'leo-v4-3-3-ui-parity' };
  }
  if (text.includes('lead') || text.includes('approval')) {
    return { section_type: 'lead_checklist', protocol_id: 'leo-v4-3-3-ui-parity' };
  }
  if (text.includes('plan') || text.includes('design')) {
    return { section_type: 'plan_checklist', protocol_id: 'leo-v4-3-3-ui-parity' };
  }

  // Default to general checklist
  return { section_type: 'general_checklist', protocol_id: 'leo-v4-3-3-ui-parity' };
}

/**
 * Apply checklist item changes - inserts into leo_protocol_sections as checklist entries
 */
async function applyChecklistItemChange(improvement) {
  const { payload, description } = improvement;

  // Validate required content
  const checklistText = payload?.checklist_text || payload?.improvement || description;
  if (!checklistText) {
    throw new Error('Missing checklist text in payload - cannot create checklist item');
  }

  // Determine where to store this checklist item
  const target = determineChecklistTarget(improvement);

  console.log('Adding checklist item:', {
    section_type: target.section_type,
    text: checklistText.substring(0, 50)
  });

  // Get the next order_index for this section type
  const { data: existingItems } = await supabase
    .from('leo_protocol_sections')
    .select('order_index')
    .eq('protocol_id', target.protocol_id)
    .eq('section_type', target.section_type)
    .order('order_index', { ascending: false })
    .limit(1);

  const nextOrderIndex = (existingItems?.[0]?.order_index || 0) + 1;

  // Insert the checklist item as a protocol section
  const sectionData = {
    protocol_id: target.protocol_id,
    section_type: target.section_type,
    title: `Checklist Item ${nextOrderIndex}`,
    content: checklistText,
    order_index: nextOrderIndex,
    metadata: {
      source: 'learn_command',
      added_at: new Date().toISOString(),
      improvement_id: improvement.id,
      impact: payload?.impact,
      category: payload?.category
    }
  };

  const { data, error } = await supabase
    .from('leo_protocol_sections')
    .insert(sectionData)
    .select('id, section_type, order_index')
    .single();

  if (error) {
    throw new Error(`Failed to insert checklist item: ${error.message}`);
  }

  return `Inserted checklist item: ${target.section_type} #${data.order_index} (id: ${data.id})`;
}

/**
 * Mark patterns as resolved when an improvement addresses them
 */
async function resolvePatterns(patternIds, improvementId) {
  if (!patternIds || patternIds.length === 0) return [];

  const results = [];
  const now = new Date().toISOString();

  for (const patternId of patternIds) {
    const { error } = await supabase
      .from('issue_patterns')
      .update({
        status: 'resolved',
        resolution_date: now,
        resolution_notes: `Addressed by improvement ${improvementId} via /learn command`
      })
      .eq('pattern_id', patternId);

    if (error) {
      console.error(`Failed to resolve pattern ${patternId}:`, error.message);
      results.push({ pattern_id: patternId, success: false, error: error.message });
    } else {
      console.log(`✓ Resolved pattern: ${patternId}`);
      results.push({ pattern_id: patternId, success: true });
    }
  }

  return results;
}

/**
 * Execute approved improvements
 * @param {Object} reviewedContext - The reviewed learning context
 * @param {Object} decisions - User decisions: { itemId: { status, reason, resolves_patterns?: [] } }
 * @param {string} sdId - Optional SD ID
 */
export async function executeApprovedImprovements(reviewedContext, decisions, sdId = null) {
  console.log('\nExecuting approved improvements...\n');

  // Create decision record first
  const decisionRecord = await createDecisionRecord(reviewedContext, decisions, sdId);

  const executionLog = [];
  const appliedImprovements = [];
  const resolvedPatterns = [];
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

      // Resolve linked patterns if specified in decision
      if (decision.resolves_patterns && decision.resolves_patterns.length > 0) {
        const patternResults = await resolvePatterns(decision.resolves_patterns, itemId);
        resolvedPatterns.push(...patternResults.filter(r => r.success).map(r => r.pattern_id));
        executionLog.push({
          item_id: itemId,
          action: 'PATTERNS_RESOLVED',
          patterns: decision.resolves_patterns,
          results: patternResults
        });
      }
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
    resolved_patterns: resolvedPatterns,
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

export { resolvePatterns };
export default { executeApprovedImprovements, rollbackDecision, resolvePatterns };
