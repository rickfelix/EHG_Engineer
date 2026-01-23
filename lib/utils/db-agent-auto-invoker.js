/**
 * Database Sub-Agent Auto-Invoker
 *
 * Provides orchestration-level integration for auto-invoking the database sub-agent
 * when SQL execution intent is detected. Used by Claude/orchestrator to determine
 * if a response should trigger database sub-agent instead of manual execution.
 *
 * Created: 2026-01-24
 * SD: SD-LEO-INFRA-DATABASE-SUB-AGENT-001
 * Part of: Database Sub-Agent Semantic Triggering Enhancement
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import {
  classifySQLExecutionIntent,
  shouldAutoInvokeDBAgent,
  getConfig
} from './sql-execution-intent-classifier.js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Auto-invocation result structure
 * @typedef {Object} AutoInvocationResult
 * @property {boolean} shouldInvoke - Whether to invoke database sub-agent
 * @property {string} intent - Detected intent
 * @property {number} confidence - Confidence score
 * @property {string} decision - Decision made
 * @property {string|null} blockReason - Reason if blocked
 * @property {string} correlationId - Correlation ID for tracing
 * @property {Object} suggestedAction - Recommended action for orchestrator
 */

/**
 * Response templates for different outcomes
 */
const RESPONSE_TEMPLATES = {
  invoking: {
    user: 'Executing via database sub-agent...',
    log: '[db-auto-invoker] SQL execution intent detected (confidence: {confidence}). Invoking database sub-agent.'
  },
  blocked_policy: {
    user: 'Database sub-agent auto-invocation is disabled. {blockReason}',
    log: '[db-auto-invoker] Blocked by policy: {blockReason}'
  },
  blocked_confidence: {
    user: 'SQL execution detected but confidence too low. Please clarify your intent.',
    log: '[db-auto-invoker] Confidence ({confidence}) below threshold. Not invoking.'
  },
  blocked_environment: {
    user: 'Database execution not permitted in this environment. {blockReason}',
    log: '[db-auto-invoker] Environment restriction: {blockReason}'
  },
  no_execution: {
    user: null, // No user message needed
    log: '[db-auto-invoker] No SQL execution intent detected.'
  }
};

/**
 * Check environment permissions for database execution
 */
function checkEnvironmentPermissions() {
  const env = process.env.NODE_ENV || 'development';
  const prodApproval = process.env.DB_PROD_EXECUTION_APPROVED === 'true';

  if (env === 'production' && !prodApproval) {
    return {
      permitted: false,
      reason: 'Production database execution requires DB_PROD_EXECUTION_APPROVED=true'
    };
  }

  return { permitted: true, reason: null };
}

/**
 * Check if a message should trigger auto-invocation of database sub-agent
 * and return formatted result for orchestrator consumption.
 *
 * @param {string} message - Message to analyze (usually Claude's response)
 * @param {Object} options - Options
 * @param {string} options.conversationId - Conversation ID for logging
 * @param {string} options.messageId - Message ID for logging
 * @param {string} options.sdKey - Current SD key for context
 * @returns {Promise<AutoInvocationResult>}
 */
export async function checkAndPrepareAutoInvocation(message, options = {}) {
  const correlationId = uuidv4();

  // First check environment permissions
  const envCheck = checkEnvironmentPermissions();

  // Classify the message
  const classification = await classifySQLExecutionIntent(message, {
    conversationId: options.conversationId,
    messageId: options.messageId,
    skipLogging: false
  });

  // Build result
  const result = {
    correlationId,
    shouldInvoke: false,
    intent: classification.intent,
    confidence: classification.confidence,
    decision: classification.decision,
    blockReason: classification.blockReason,
    matchedTriggers: classification.matchedTriggerIds.length,
    suggestedAction: null,
    messages: {
      user: null,
      log: null
    }
  };

  // Determine action based on classification and environment
  if (classification.decision === 'invoke_db_agent') {
    if (!envCheck.permitted) {
      result.decision = 'blocked_environment';
      result.blockReason = envCheck.reason;
      result.messages = formatMessages(RESPONSE_TEMPLATES.blocked_environment, result);
    } else {
      result.shouldInvoke = true;
      result.messages = formatMessages(RESPONSE_TEMPLATES.invoking, result);
      result.suggestedAction = {
        type: 'invoke_task_tool',
        subagent_type: 'database-agent',
        prompt_prefix: 'Execute the following SQL operation:\n\n',
        model: 'sonnet'
      };
    }
  } else if (classification.decision === 'blocked_policy') {
    result.messages = formatMessages(RESPONSE_TEMPLATES.blocked_policy, result);
  } else if (classification.decision === 'blocked_confidence') {
    result.messages = formatMessages(RESPONSE_TEMPLATES.blocked_confidence, result);
  } else {
    result.messages = formatMessages(RESPONSE_TEMPLATES.no_execution, result);
  }

  // Log the decision
  console.log(result.messages.log);

  return result;
}

/**
 * Format message templates with actual values
 */
function formatMessages(template, data) {
  const format = (str) => {
    if (!str) return null;
    return str
      .replace('{confidence}', (data.confidence * 100).toFixed(0) + '%')
      .replace('{blockReason}', data.blockReason || 'Unknown reason')
      .replace('{correlationId}', data.correlationId);
  };

  return {
    user: format(template.user),
    log: format(template.log)
  };
}

/**
 * Get the Task tool invocation parameters for database sub-agent.
 * Returns null if auto-invocation not applicable.
 *
 * @param {string} message - Message containing SQL to execute
 * @param {Object} options - Options
 * @returns {Promise<Object|null>} Task tool parameters or null
 */
export async function getDBAgentTaskParams(message, options = {}) {
  const result = await checkAndPrepareAutoInvocation(message, options);

  if (!result.shouldInvoke) {
    return null;
  }

  return {
    description: 'Execute SQL via database sub-agent',
    prompt: `${result.suggestedAction.prompt_prefix}${message}`,
    subagent_type: result.suggestedAction.subagent_type,
    model: result.suggestedAction.model
  };
}

/**
 * Structured logging for metrics/observability
 */
export function logMetric(metricName, value, tags = {}) {
  const metric = {
    name: metricName,
    value,
    timestamp: new Date().toISOString(),
    tags: {
      ...tags,
      service: 'db-agent-auto-invoker',
      environment: process.env.NODE_ENV || 'development'
    }
  };

  // In production, this would emit to your metrics system
  // For now, structured log output
  console.log(JSON.stringify({ type: 'metric', ...metric }));
}

/**
 * Record invocation metrics
 */
export async function recordInvocationMetrics(result) {
  logMetric('db_trigger.intent_detected_total', 1, { intent: result.intent });

  if (result.shouldInvoke) {
    logMetric('db_trigger.invoked_total', 1);
  } else if (result.decision.startsWith('blocked_')) {
    logMetric('db_trigger.blocked_total', 1, { reason: result.decision });
  }

  logMetric('db_trigger.classification_latency_ms', result.latencyMs || 0);
}

/**
 * Integration helper for CLAUDE.md proactive invocation.
 * Call this when Claude is about to output SQL with execution instructions.
 *
 * Example usage in orchestrator context:
 * ```
 * if (responseContainsSQL && suggestsManualExecution) {
 *   const autoInvoke = await shouldAutoInvokeAndExecute(response);
 *   if (autoInvoke.shouldInvoke) {
 *     // Use Task tool instead of outputting manual instructions
 *     return { useTaskTool: true, params: autoInvoke.taskParams };
 *   }
 * }
 * ```
 *
 * @param {string} message - Message to check
 * @param {Object} options - Options
 * @returns {Promise<{shouldInvoke: boolean, taskParams: Object|null, userMessage: string|null}>}
 */
export async function shouldAutoInvokeAndExecute(message, options = {}) {
  const result = await checkAndPrepareAutoInvocation(message, options);

  return {
    shouldInvoke: result.shouldInvoke,
    taskParams: result.shouldInvoke ? await getDBAgentTaskParams(message, options) : null,
    userMessage: result.messages.user,
    correlationId: result.correlationId,
    confidence: result.confidence
  };
}

export default {
  checkAndPrepareAutoInvocation,
  getDBAgentTaskParams,
  shouldAutoInvokeAndExecute,
  logMetric,
  recordInvocationMetrics
};
