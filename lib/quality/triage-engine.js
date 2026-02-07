/**
 * Triage Engine for Quality Lifecycle System
 *
 * Central orchestrator that coordinates all triage operations:
 * - Priority calculation
 * - Burst detection and grouping
 * - Ignore pattern matching
 * - Auto-assignment rules
 * - AI triage suggestions
 *
 * Part of SD-QUALITY-TRIAGE-001: Triage & Prioritization Engine
 *
 * @module lib/quality/triage-engine
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { calculatePriority } from './priority-calculator.js';
import { findExistingBurstGroup, addToBurstGroup } from './burst-detector.js';
// generateFingerprint available in ./burst-detector.js if needed
import { matchesIgnorePattern, processFeedbackForIgnore } from './ignore-patterns.js';
import { getLLMClient } from '../llm/client-factory.js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Auto-assignment rules configuration
 * Maps source_type and severity combinations to assignees
 */
const ASSIGNMENT_RULES = {
  // Critical security issues go to security team
  'security_critical': { assignee: 'security-team', reason: 'Critical security issue' },
  // UAT failures go to QA team
  'uat_failure': { assignee: 'qa-team', reason: 'UAT test failure' },
  // Production errors go to on-call
  'production_error': { assignee: 'on-call', reason: 'Production error' },
  // Default: unassigned
  'default': { assignee: null, reason: null }
};

/**
 * Triage result structure
 * @typedef {Object} TriageResult
 * @property {boolean} success - Whether triage completed successfully
 * @property {string} feedbackId - The feedback item ID
 * @property {Object} priority - Priority calculation result
 * @property {Object|null} burstGroup - Burst group if matched
 * @property {Object|null} ignorePattern - Ignore pattern if matched
 * @property {Object|null} assignment - Auto-assignment result
 * @property {string|null} aiSuggestion - AI-generated triage suggestion
 * @property {string[]} actions - List of actions taken
 */

/**
 * Run full triage on a feedback item
 *
 * @param {Object} feedback - The feedback item to triage
 * @param {Object} [options] - Triage options
 * @param {boolean} [options.skipIgnoreCheck] - Skip ignore pattern check
 * @param {boolean} [options.skipBurstCheck] - Skip burst detection
 * @param {boolean} [options.skipAssignment] - Skip auto-assignment
 * @param {boolean} [options.generateAiSuggestion] - Generate AI triage suggestion
 * @returns {Promise<TriageResult>} Triage result
 */
export async function triageFeedback(feedback, options = {}) {
  const actions = [];
  const result = {
    success: false,
    feedbackId: feedback.id,
    priority: null,
    burstGroup: null,
    ignorePattern: null,
    assignment: null,
    aiSuggestion: null,
    actions
  };

  try {
    // Step 1: Check ignore patterns (unless skipped)
    if (!options.skipIgnoreCheck) {
      const matchedPattern = await matchesIgnorePattern(feedback);
      if (matchedPattern) {
        result.ignorePattern = matchedPattern;
        actions.push(`Matched ignore pattern: ${matchedPattern.pattern_value}`);

        // Auto-ignore the feedback
        await processFeedbackForIgnore(feedback);
        actions.push('Auto-ignored feedback');

        result.success = true;
        return result;
      }
    }

    // Step 2: Calculate priority
    result.priority = calculatePriority(feedback);
    actions.push(`Calculated priority: ${result.priority.priority}`);

    // Step 3: Check for burst grouping (unless skipped)
    if (!options.skipBurstCheck) {
      try {
        const burstGroup = await findExistingBurstGroup(feedback);
        if (burstGroup) {
          result.burstGroup = burstGroup;
          await addToBurstGroup(feedback, burstGroup);
          actions.push(`Added to burst group: ${burstGroup.id}`);
        }
      } catch (burstError) {
        // Non-critical, continue
        console.log('[TriageEngine] Burst check skipped:', burstError.message);
      }
    }

    // Step 4: Auto-assignment (unless skipped)
    if (!options.skipAssignment) {
      result.assignment = await autoAssign(feedback, result.priority);
      if (result.assignment.assignee) {
        actions.push(`Auto-assigned to: ${result.assignment.assignee}`);
      }
    }

    // Step 5: Generate AI suggestion (if requested)
    if (options.generateAiSuggestion) {
      result.aiSuggestion = await generateAiTriageSuggestion(feedback, result);
      if (result.aiSuggestion) {
        actions.push('Generated AI triage suggestion');
      }
    }

    // Step 6: Update feedback with triage results
    await updateFeedbackWithTriage(feedback.id, result);
    actions.push('Updated feedback with triage results');

    result.success = true;
    return result;

  } catch (error) {
    console.error('[TriageEngine] Triage failed:', error.message);
    result.actions.push(`Error: ${error.message}`);
    return result;
  }
}

/**
 * Auto-assign feedback based on rules
 *
 * @param {Object} feedback - The feedback item
 * @param {Object} priorityResult - Priority calculation result
 * @returns {Promise<Object>} Assignment result
 */
async function autoAssign(feedback, priorityResult) {
  const sourceType = feedback.source_type || 'unknown';
  const severity = feedback.severity || 'medium';
  const priority = priorityResult?.priority || 'P2';

  // Build rule key
  let ruleKey = `${sourceType}_${severity}`;

  // Check for specific rule
  let rule = ASSIGNMENT_RULES[ruleKey];

  // Fallback to source type only
  if (!rule) {
    rule = ASSIGNMENT_RULES[sourceType];
  }

  // Fallback to default
  if (!rule) {
    rule = ASSIGNMENT_RULES['default'];
  }

  // P0 items always go to on-call if not already assigned
  if (priority === 'P0' && !rule.assignee) {
    rule = { assignee: 'on-call', reason: 'P0 critical priority' };
  }

  if (rule.assignee) {
    // Update feedback with assignment
    await supabase
      .from('feedback')
      .update({
        assigned_to: rule.assignee,
        assigned_at: new Date().toISOString(),
        assignment_reason: rule.reason,
        updated_at: new Date().toISOString()
      })
      .eq('id', feedback.id);
  }

  return rule;
}

/**
 * Generate AI triage suggestion using LLM (US-003)
 *
 * Uses cloud or local LLM to classify feedback items with a confidence score.
 * Falls back to rule-based classification on LLM failure.
 *
 * @param {Object} feedback - The feedback item
 * @param {Object} triageResult - Current triage result
 * @returns {Promise<Object|null>} Triage result with suggestion and confidence
 */
async function generateAiTriageSuggestion(feedback, triageResult) {
  try {
    const llmClient = getLLMClient({ purpose: 'triage' });

    const systemPrompt = `You are a software issue triage specialist. Classify feedback items and provide actionable recommendations.

Respond ONLY with valid JSON in this exact format:
{
  "classification": "bug|enhancement|question|duplicate|invalid",
  "severity": "critical|high|medium|low",
  "confidence": <integer 0-100>,
  "suggestion": "<one-line actionable recommendation>",
  "category": "<affected area: auth|database|ui|api|performance|config|other>"
}`;

    const userPrompt = `Classify this feedback item:

Title: ${feedback.title || 'No title'}
Type: ${feedback.type || 'unknown'}
Source: ${feedback.source_type || 'unknown'}
Error Type: ${feedback.error_type || 'none'}
Current Priority: ${triageResult.priority?.priority || 'unset'}
Description: ${(feedback.description || '').substring(0, 500)}
${triageResult.burstGroup ? `Note: Part of a burst group with ${triageResult.burstGroup.count || 'multiple'} similar items.` : ''}`;

    const response = await llmClient.complete(systemPrompt, userPrompt, {
      temperature: 0.1,
      maxTokens: 200
    });

    const text = (response?.text || response?.content || '').trim();

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[TriageEngine] LLM returned non-JSON, falling back to rules');
      return generateRuleBasedSuggestion(feedback, triageResult);
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate confidence is an integer 0-100
    const confidence = Math.max(0, Math.min(100, Math.round(Number(parsed.confidence) || 50)));

    return {
      suggestion: parsed.suggestion || null,
      classification: parsed.classification || feedback.type || 'unknown',
      severity: parsed.severity || 'medium',
      confidence,
      category: parsed.category || 'other',
      source: 'llm'
    };
  } catch (llmError) {
    console.warn(`[TriageEngine] LLM triage failed, using rule-based fallback: ${llmError.message}`);
    return generateRuleBasedSuggestion(feedback, triageResult);
  }
}

/**
 * Rule-based triage suggestion (fallback when LLM is unavailable)
 *
 * @param {Object} feedback - The feedback item
 * @param {Object} triageResult - Current triage result
 * @returns {Object|null} Triage suggestion with confidence
 */
function generateRuleBasedSuggestion(feedback, triageResult) {
  const suggestions = [];
  let confidence = 40; // Base confidence for rule-based

  if (triageResult.priority?.priority === 'P0') {
    suggestions.push('URGENT: Requires immediate attention.');
    confidence = Math.max(confidence, 70);
  }

  if (feedback.source_type === 'uat_failure') {
    suggestions.push('Consider reverting recent changes or creating a hotfix.');
    confidence = Math.max(confidence, 60);
  }

  if (feedback.error_type?.includes('Database') || feedback.title?.toLowerCase().includes('database')) {
    suggestions.push('Check database connections and query performance.');
    confidence = Math.max(confidence, 55);
  }

  if (feedback.error_type?.includes('Auth') || feedback.title?.toLowerCase().includes('auth')) {
    suggestions.push('Verify authentication tokens and session handling.');
    confidence = Math.max(confidence, 55);
  }

  if (triageResult.burstGroup) {
    suggestions.push(`Part of a burst of ${triageResult.burstGroup.count || 'multiple'} similar errors.`);
    confidence = Math.max(confidence, 50);
  }

  if (suggestions.length === 0) return null;

  return {
    suggestion: suggestions.join(' '),
    classification: feedback.type || 'unknown',
    severity: triageResult.priority?.priority === 'P0' ? 'critical' : 'medium',
    confidence,
    category: 'other',
    source: 'rules'
  };
}

/**
 * Update feedback record with triage results
 *
 * @param {string} feedbackId - Feedback ID
 * @param {Object} triageResult - Triage result
 */
async function updateFeedbackWithTriage(feedbackId, triageResult) {
  const updates = {
    triaged_at: new Date().toISOString(),
    triaged_by: 'triage-engine',
    updated_at: new Date().toISOString()
  };

  if (triageResult.priority) {
    updates.priority = triageResult.priority.priority;
    updates.priority_reasoning = triageResult.priority.reasoning;
  }

  if (triageResult.burstGroup) {
    updates.burst_group_id = triageResult.burstGroup.id;
  }

  if (triageResult.aiSuggestion) {
    // US-003: Store structured LLM triage result with confidence
    if (typeof triageResult.aiSuggestion === 'object') {
      updates.ai_triage_suggestion = triageResult.aiSuggestion.suggestion;
      updates.ai_triage_confidence = triageResult.aiSuggestion.confidence;
      updates.ai_triage_classification = triageResult.aiSuggestion.classification;
      updates.ai_triage_source = triageResult.aiSuggestion.source;
    } else {
      updates.ai_triage_suggestion = triageResult.aiSuggestion;
    }
  }

  // Update status to triaged if still new
  const { data: current } = await supabase
    .from('feedback')
    .select('status')
    .eq('id', feedbackId)
    .single();

  if (current?.status === 'new') {
    updates.status = 'triaged';
  }

  await supabase
    .from('feedback')
    .update(updates)
    .eq('id', feedbackId);
}

/**
 * Batch triage multiple feedback items
 *
 * @param {string[]} feedbackIds - Array of feedback IDs to triage
 * @param {Object} [options] - Triage options
 * @returns {Promise<Object>} Batch result with summary
 */
export async function batchTriage(feedbackIds, options = {}) {
  const results = {
    total: feedbackIds.length,
    succeeded: 0,
    failed: 0,
    ignored: 0,
    items: []
  };

  for (const id of feedbackIds) {
    // Fetch feedback
    const { data: feedback, error } = await supabase
      .from('feedback')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !feedback) {
      results.failed++;
      results.items.push({ id, success: false, error: 'Not found' });
      continue;
    }

    const result = await triageFeedback(feedback, options);

    if (result.success) {
      if (result.ignorePattern) {
        results.ignored++;
      } else {
        results.succeeded++;
      }
    } else {
      results.failed++;
    }

    results.items.push(result);
  }

  return results;
}

/**
 * Triage all untriaged feedback items
 *
 * @param {Object} [options] - Triage options
 * @param {number} [options.limit] - Maximum items to triage (default: 50)
 * @returns {Promise<Object>} Batch result
 */
export async function triageUntriaged(options = {}) {
  const limit = options.limit || 50;

  const { data: untriaged, error } = await supabase
    .from('feedback')
    .select('id')
    .eq('status', 'new')
    .is('triaged_at', null)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch untriaged items: ${error.message}`);
  }

  if (!untriaged || untriaged.length === 0) {
    return { total: 0, succeeded: 0, failed: 0, ignored: 0, items: [] };
  }

  const ids = untriaged.map(f => f.id);
  return batchTriage(ids, options);
}

/**
 * Get triage statistics
 *
 * @param {Object} [options] - Filter options
 * @param {string} [options.since] - Only count items since this date
 * @returns {Promise<Object>} Triage statistics
 */
export async function getTriageStats(options = {}) {
  let query = supabase
    .from('feedback')
    .select('status, priority, triaged_at', { count: 'exact' });

  if (options.since) {
    query = query.gte('created_at', options.since);
  }

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to get triage stats: ${error.message}`);
  }

  const stats = {
    total: count || 0,
    triaged: 0,
    untriaged: 0,
    byPriority: { P0: 0, P1: 0, P2: 0, P3: 0 },
    byStatus: {}
  };

  for (const item of (data || [])) {
    if (item.triaged_at) {
      stats.triaged++;
    } else {
      stats.untriaged++;
    }

    if (item.priority) {
      stats.byPriority[item.priority] = (stats.byPriority[item.priority] || 0) + 1;
    }

    if (item.status) {
      stats.byStatus[item.status] = (stats.byStatus[item.status] || 0) + 1;
    }
  }

  return stats;
}

// Default export
export default {
  triageFeedback,
  batchTriage,
  triageUntriaged,
  getTriageStats,
  autoAssign,
  generateAiTriageSuggestion
};
