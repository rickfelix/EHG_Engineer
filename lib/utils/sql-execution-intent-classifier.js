/**
 * SQL Execution Intent Classifier
 *
 * Deterministic classifier that evaluates messages for SQL execution intent.
 * Uses trigger patterns from leo_sub_agent_triggers and applies denylist filtering.
 *
 * Created: 2026-01-24
 * SD: SD-LEO-INFRA-DATABASE-SUB-AGENT-001
 * Part of: Database Sub-Agent Semantic Triggering Enhancement
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Classification result structure
 * @typedef {Object} ClassificationResult
 * @property {string} intent - 'SQL_EXECUTION' or 'NO_EXECUTION'
 * @property {number} confidence - Confidence score (0-1)
 * @property {string[]} matchedTriggerIds - UUIDs of matched triggers
 * @property {string} decision - 'invoke_db_agent', 'blocked_policy', 'blocked_confidence', 'no_execution'
 * @property {string|null} blockReason - Reason if blocked
 * @property {Object} metadata - Additional classification metadata
 */

/**
 * Default configuration values (can be overridden by database config)
 */
const DEFAULT_CONFIG = {
  MIN_CONFIDENCE_TO_INVOKE: 0.80,
  MAX_TRIGGERS_EVALUATED: 200,
  DB_AGENT_ENABLED: true,
  DENYLIST_PHRASES: [
    'do not execute',
    'for reference only',
    'example query',
    'sample sql',
    'here is an example',
    'you could run',
    'would look like'
  ]
};

/**
 * SQL patterns that indicate SQL is present in context
 */
const SQL_CONTEXT_PATTERNS = [
  /\bSELECT\s+.+\s+FROM\b/i,
  /\bINSERT\s+INTO\b/i,
  /\bUPDATE\s+.+\s+SET\b/i,
  /\bDELETE\s+FROM\b/i,
  /\bCREATE\s+(TABLE|INDEX|FUNCTION|VIEW)\b/i,
  /\bALTER\s+TABLE\b/i,
  /\bDROP\s+(TABLE|INDEX|FUNCTION|VIEW)\b/i,
  /\bTRUNCATE\s+TABLE\b/i,
  /\bGRANT\b.*\bON\b/i,
  /\bREVOKE\b.*\bON\b/i
];

/**
 * Load runtime configuration from database
 * Falls back to defaults if database unavailable
 */
async function loadConfig() {
  try {
    const { data, error } = await supabase
      .from('db_agent_config')
      .select('key, value');

    if (error || !data) {
      console.log('[sql-intent-classifier] Using default config (db unavailable)');
      return DEFAULT_CONFIG;
    }

    const config = { ...DEFAULT_CONFIG };
    for (const row of data) {
      if (row.key === 'MIN_CONFIDENCE_TO_INVOKE') {
        config.MIN_CONFIDENCE_TO_INVOKE = parseFloat(row.value) || DEFAULT_CONFIG.MIN_CONFIDENCE_TO_INVOKE;
      } else if (row.key === 'MAX_TRIGGERS_EVALUATED') {
        config.MAX_TRIGGERS_EVALUATED = parseInt(row.value) || DEFAULT_CONFIG.MAX_TRIGGERS_EVALUATED;
      } else if (row.key === 'DB_AGENT_ENABLED') {
        config.DB_AGENT_ENABLED = row.value === true || row.value === 'true';
      } else if (row.key === 'DENYLIST_PHRASES') {
        config.DENYLIST_PHRASES = Array.isArray(row.value) ? row.value : DEFAULT_CONFIG.DENYLIST_PHRASES;
      }
    }
    return config;
  } catch (err) {
    console.log('[sql-intent-classifier] Config load error, using defaults:', err.message);
    return DEFAULT_CONFIG;
  }
}

/**
 * Load SQL execution intent triggers from database
 */
async function loadTriggers(maxTriggers = 200) {
  try {
    const { data, error } = await supabase
      .from('leo_sub_agent_triggers')
      .select('id, trigger_phrase, trigger_type, priority, metadata, trigger_context')
      .eq('trigger_context', 'SQL_EXECUTION_INTENT')
      .eq('active', true)
      .order('priority', { ascending: false })
      .limit(maxTriggers);

    if (error) {
      console.error('[sql-intent-classifier] Trigger load error:', error.message);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('[sql-intent-classifier] Trigger load exception:', err.message);
    return [];
  }
}

/**
 * Check if message contains SQL context (for contextual triggers)
 */
function hasSQLContext(message) {
  return SQL_CONTEXT_PATTERNS.some(pattern => pattern.test(message));
}

/**
 * Check if message contains any denylist phrases
 */
function containsDenylistPhrase(message, denylist) {
  const lowerMessage = message.toLowerCase();
  return denylist.some(phrase => lowerMessage.includes(phrase.toLowerCase()));
}

/**
 * Match message against triggers and calculate confidence
 */
function matchTriggers(message, triggers) {
  const lowerMessage = message.toLowerCase();
  const matches = [];
  let totalConfidenceBoost = 0;
  const hasSql = hasSQLContext(message);

  for (const trigger of triggers) {
    const phrase = trigger.trigger_phrase.toLowerCase();
    const metadata = trigger.metadata || {};

    // Check if trigger requires SQL context
    if (metadata.requires_sql_context && !hasSql) {
      continue;
    }

    // Match based on trigger type
    let isMatch = false;
    if (trigger.trigger_type === 'pattern' || trigger.trigger_type === 'phrase') {
      isMatch = lowerMessage.includes(phrase);
    } else if (trigger.trigger_type === 'regex') {
      try {
        const regex = new RegExp(phrase, 'i');
        isMatch = regex.test(message);
      } catch (e) {
        // Invalid regex, skip
        continue;
      }
    } else if (trigger.trigger_type === 'keyword') {
      // Word boundary match for keywords
      const wordRegex = new RegExp(`\\b${escapeRegExp(phrase)}\\b`, 'i');
      isMatch = wordRegex.test(message);
    }

    if (isMatch) {
      matches.push({
        triggerId: trigger.id,
        phrase: trigger.trigger_phrase,
        priority: trigger.priority,
        category: metadata.category || 'unknown',
        confidenceBoost: metadata.confidence_boost || 0
      });
      totalConfidenceBoost += metadata.confidence_boost || 0;
    }
  }

  return { matches, totalConfidenceBoost };
}

/**
 * Escape special regex characters
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Calculate final confidence score
 */
function calculateConfidence(matches, totalBoost, hasSql, hasDenylist) {
  // Base confidence from number of matches and their priorities
  let baseConfidence = 0;

  if (matches.length === 0) {
    return 0;
  }

  // Higher priority matches contribute more
  const maxPriority = Math.max(...matches.map(m => m.priority));
  baseConfidence = 0.5 + (maxPriority / 20); // Max priority 9 = 0.95 base

  // Add confidence boosts from matched triggers
  const confidence = Math.min(1.0, baseConfidence + totalBoost);

  // SQL context present adds confidence
  const sqlBonus = hasSql ? 0.1 : 0;

  // Denylist forces low confidence
  if (hasDenylist) {
    return Math.min(0.3, confidence * 0.3);
  }

  return Math.min(1.0, confidence + sqlBonus);
}

/**
 * Log classification decision to database
 */
async function logInvocation(correlationId, result, context = {}) {
  try {
    await supabase.from('db_agent_invocations').insert({
      correlation_id: correlationId,
      conversation_id: context.conversationId || null,
      message_id: context.messageId || null,
      intent: result.intent,
      confidence: result.confidence,
      matched_trigger_ids: result.matchedTriggerIds,
      decision: result.decision,
      block_reason: result.blockReason,
      environment: context.environment || process.env.NODE_ENV || 'development',
      db_agent_enabled: result.metadata?.dbAgentEnabled ?? true,
      latency_ms: result.metadata?.latencyMs || 0
    });
  } catch (err) {
    console.error('[sql-intent-classifier] Failed to log invocation:', err.message);
  }
}

/**
 * Classify a message for SQL execution intent
 *
 * @param {string} message - The message to classify
 * @param {Object} options - Classification options
 * @param {string} options.conversationId - Optional conversation ID for logging
 * @param {string} options.messageId - Optional message ID for logging
 * @param {string} options.environment - Optional environment (defaults to NODE_ENV)
 * @param {boolean} options.skipLogging - Skip database logging (for testing)
 * @returns {Promise<ClassificationResult>} Classification result
 */
export async function classifySQLExecutionIntent(message, options = {}) {
  const startTime = Date.now();
  const correlationId = uuidv4();

  // Load configuration
  const config = await loadConfig();

  // Initialize result
  const result = {
    correlationId,
    intent: 'NO_EXECUTION',
    confidence: 0,
    matchedTriggerIds: [],
    decision: 'no_execution',
    blockReason: null,
    metadata: {
      dbAgentEnabled: config.DB_AGENT_ENABLED,
      minConfidenceThreshold: config.MIN_CONFIDENCE_TO_INVOKE,
      latencyMs: 0,
      matchCount: 0,
      hasSQLContext: false,
      hasDenylistPhrase: false
    }
  };

  // Check for denylist phrases first
  const hasDenylist = containsDenylistPhrase(message, config.DENYLIST_PHRASES);
  result.metadata.hasDenylistPhrase = hasDenylist;

  if (hasDenylist) {
    result.intent = 'NO_EXECUTION';
    result.confidence = 0.95; // High confidence it's NOT an execution request
    result.decision = 'no_execution';
    result.metadata.latencyMs = Date.now() - startTime;

    if (!options.skipLogging) {
      await logInvocation(correlationId, result, options);
    }
    return result;
  }

  // Load triggers
  const triggers = await loadTriggers(config.MAX_TRIGGERS_EVALUATED);

  // Match triggers
  const { matches, totalConfidenceBoost } = matchTriggers(message, triggers);
  const hasSql = hasSQLContext(message);

  result.metadata.hasSQLContext = hasSql;
  result.metadata.matchCount = matches.length;
  result.matchedTriggerIds = matches.map(m => m.triggerId);

  // Calculate confidence
  const confidence = calculateConfidence(matches, totalConfidenceBoost, hasSql, false);
  result.confidence = confidence;

  // Determine intent and decision
  if (matches.length > 0 && confidence >= config.MIN_CONFIDENCE_TO_INVOKE) {
    result.intent = 'SQL_EXECUTION';

    // Check if DB agent is enabled
    if (!config.DB_AGENT_ENABLED) {
      result.decision = 'blocked_policy';
      result.blockReason = 'DB_AGENT_DISABLED: Database sub-agent auto-invocation is disabled globally';
    } else {
      result.decision = 'invoke_db_agent';
    }
  } else if (matches.length > 0) {
    result.intent = 'SQL_EXECUTION';
    result.decision = 'blocked_confidence';
    result.blockReason = `Confidence ${confidence.toFixed(2)} below threshold ${config.MIN_CONFIDENCE_TO_INVOKE}`;
  } else {
    result.intent = 'NO_EXECUTION';
    result.decision = 'no_execution';
  }

  result.metadata.latencyMs = Date.now() - startTime;

  // Log to database
  if (!options.skipLogging) {
    await logInvocation(correlationId, result, options);
  }

  return result;
}

/**
 * Check if a message should auto-invoke the database sub-agent
 *
 * @param {string} message - The message to check
 * @param {Object} options - Options passed to classifier
 * @returns {Promise<{shouldInvoke: boolean, result: ClassificationResult}>}
 */
export async function shouldAutoInvokeDBAgent(message, options = {}) {
  const result = await classifySQLExecutionIntent(message, options);

  return {
    shouldInvoke: result.decision === 'invoke_db_agent',
    result
  };
}

/**
 * Get current configuration
 */
export async function getConfig() {
  return loadConfig();
}

/**
 * Get active SQL execution intent triggers
 */
export async function getActiveTriggers() {
  return loadTriggers();
}

// Export for testing
export const _internal = {
  loadConfig,
  loadTriggers,
  matchTriggers,
  hasSQLContext,
  containsDenylistPhrase,
  calculateConfidence,
  SQL_CONTEXT_PATTERNS,
  DEFAULT_CONFIG
};

export default {
  classifySQLExecutionIntent,
  shouldAutoInvokeDBAgent,
  getConfig,
  getActiveTriggers
};
