/**
 * Improvement Appliers for /learn command
 *
 * Handles applying different types of improvements to the database.
 * Extracted from executor.js for maintainability.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * Apply a single improvement
 */
export async function applyImprovement(improvement) {
  const result = {
    id: improvement.id,
    success: false,
    action: null,
    rollback_data: null,
    error: null
  };

  try {
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

    result.rollback_data = {
      improvement_id: improvement.id,
      improvement_type: improvement.improvement_type,
      target_table: improvement.target_table,
      original_payload: improvement.payload,
      applied_at: new Date().toISOString()
    };

    result.success = true;

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
 */
function transformToValidationRule(improvement) {
  const { payload, description } = improvement;

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
               '2C';

  const ruleName = (description || payload.improvement || 'unnamed_rule')
    .substring(0, 50)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

  const impactWeights = { 'critical': 0.95, 'high': 0.75, 'medium': 0.50, 'low': 0.25 };
  const impactKey = payload.impact ? payload.impact.toLowerCase() : '';
  const weight = impactWeights[impactKey] || 0.50;

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
 * Apply validation rule changes
 */
async function applyValidationRuleChange(improvement) {
  const { payload } = improvement;

  if (!payload || (!payload.improvement && !improvement.description)) {
    throw new Error('Missing improvement content in payload - cannot create validation rule');
  }

  const ruleData = transformToValidationRule(improvement);

  console.log('Transforming validation rule:', {
    from: Object.keys(payload),
    to: Object.keys(ruleData),
    gate: ruleData.gate,
    rule_name: ruleData.rule_name
  });

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
 */
function extractSubAgentCode(improvement) {
  const { description, payload } = improvement;
  const text = description || payload?.improvement || '';

  const subAgentCodes = [
    'TESTING', 'DATABASE', 'SECURITY', 'DESIGN', 'GITHUB', 'DOCMON',
    'PERFORMANCE', 'REGRESSION', 'VALIDATION', 'UAT', 'RISK', 'RETRO',
    'STORIES', 'API', 'DEPENDENCY', 'RCA', 'ANALYTICS', 'CRM', 'FINANCIAL',
    'LAUNCH', 'MARKETING', 'MONITORING', 'PRICING', 'SALES', 'VALUATION'
  ];

  const upperText = text.toUpperCase();
  for (const code of subAgentCodes) {
    if (upperText.includes(code)) {
      return code;
    }
  }

  const match = text.match(/(\w+)\s*[-_]?\s*(?:sub[-_]?agent|agent)/i);
  if (match) {
    return match[1].toUpperCase();
  }

  return null;
}

/**
 * Apply sub-agent config changes
 */
async function applySubAgentConfigChange(improvement) {
  const { payload, description } = improvement;

  let subAgentCode = payload?.sub_agent_code || extractSubAgentCode(improvement);

  console.log('Updating sub-agent config:', {
    code: subAgentCode || '(all sub-agents)',
    improvement: (payload?.improvement || description)?.substring(0, 50)
  });

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
      subAgentCode = null;
    }
  }

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
  const { payload, description } = improvement;
  const text = (description || payload?.improvement || '').toLowerCase();

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

  return { section_type: 'general_checklist', protocol_id: 'leo-v4-3-3-ui-parity' };
}

/**
 * Apply checklist item changes
 */
async function applyChecklistItemChange(improvement) {
  const { payload, description } = improvement;

  const checklistText = payload?.checklist_text || payload?.improvement || description;
  if (!checklistText) {
    throw new Error('Missing checklist text in payload - cannot create checklist item');
  }

  const target = determineChecklistTarget(improvement);

  console.log('Adding checklist item:', {
    section_type: target.section_type,
    text: checklistText.substring(0, 50)
  });

  const { data: existingItems } = await supabase
    .from('leo_protocol_sections')
    .select('order_index')
    .eq('protocol_id', target.protocol_id)
    .eq('section_type', target.section_type)
    .order('order_index', { ascending: false })
    .limit(1);

  const nextOrderIndex = (existingItems?.[0]?.order_index || 0) + 1;

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
export async function resolvePatterns(patternIds, improvementId) {
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
