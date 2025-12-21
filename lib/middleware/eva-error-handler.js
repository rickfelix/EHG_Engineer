/**
 * EVA Error Handler - Chairman-Grade Status Reports
 *
 * OPERATION 'SOVEREIGN PIPE' v3.7.0 - Error Transformation
 *
 * THE LAW: Errors become Strategic Intelligence, not Developer Noise.
 *
 * Transforms raw errors into EVA Status Reports:
 * - Pattern detection via error-pattern-library.js
 * - Sub-agent recommendations
 * - Business-language messages (<2 second comprehension)
 * - Correlation IDs for support lookup
 *
 * @module eva-error-handler
 * @version 3.7.0
 */

import { v4 as uuidv4 } from 'uuid';
import { detectError, recommendSubAgent, ERROR_CATEGORIES, SEVERITY_LEVELS } from '../error-pattern-library.js';

// =============================================================================
// CHAIRMAN MESSAGE TRANSLATIONS
// =============================================================================

/**
 * Translate error pattern IDs to Chairman-friendly messages
 * Goal: <2 second comprehension
 */
const CHAIRMAN_MESSAGES = {
  // Database errors
  'DB_CONNECTION_FAILED': 'Database system temporarily unavailable',
  'DB_QUERY_ERROR': 'Data query failed - schema mismatch detected',
  'DB_TIMEOUT': 'Database response delayed - system under load',
  'DB_PERMISSION': 'Database access restricted by security policy',
  'RLS_POLICY_VIOLATION': 'Access restricted by row-level security',

  // Security errors
  'AUTH_FAILED': 'Authentication failed - credentials invalid',
  'AUTH_TOKEN_EXPIRED': 'Session expired - re-authentication required',
  'PERMISSION_DENIED': 'Access denied - insufficient permissions',
  'FORBIDDEN_OPERATION': 'Operation blocked by security policy',

  // Build/Runtime errors
  'BUILD_FAILED': 'Build system error - code compilation failed',
  'IMPORT_ERROR': 'Module import failed - dependency missing',
  'TYPE_ERROR': 'Data type mismatch - validation error',
  'REFERENCE_ERROR': 'Undefined reference - code path error',

  // Test errors
  'TEST_FAILED': 'Validation test failed - quality gate blocked',
  'TEST_TIMEOUT': 'Test execution timeout - performance issue',
  'ASSERTION_ERROR': 'Test assertion failed - expected behavior mismatch',

  // Network errors
  'NETWORK_TIMEOUT': 'Network request timeout - external service slow',
  'NETWORK_REFUSED': 'Connection refused - external service unavailable',
  'API_ERROR': 'External API returned error',

  // Performance errors
  'MEMORY_LIMIT': 'Memory limit exceeded - resource constraint',
  'CPU_LIMIT': 'Processing limit reached - operation too complex',

  // Default fallback
  'default': 'System error - engineering team alerted'
};

/**
 * Map severity to HTTP status code
 */
const SEVERITY_TO_STATUS = {
  [SEVERITY_LEVELS.CRITICAL]: 503,  // Service Unavailable
  [SEVERITY_LEVELS.HIGH]: 500,       // Internal Server Error
  [SEVERITY_LEVELS.MEDIUM]: 422,     // Unprocessable Entity
  [SEVERITY_LEVELS.LOW]: 400         // Bad Request
};

/**
 * Map category to default sub-agent
 */
const CATEGORY_TO_SUBAGENT = {
  [ERROR_CATEGORIES.DATABASE]: 'DATABASE',
  [ERROR_CATEGORIES.SECURITY]: 'SECURITY',
  [ERROR_CATEGORIES.BUILD]: 'GITHUB',
  [ERROR_CATEGORIES.RUNTIME]: 'VALIDATION',
  [ERROR_CATEGORIES.TEST]: 'TESTING',
  [ERROR_CATEGORIES.NETWORK]: 'PERFORMANCE',
  [ERROR_CATEGORIES.FILESYSTEM]: 'VALIDATION',
  [ERROR_CATEGORIES.PERFORMANCE]: 'PERFORMANCE',
  [ERROR_CATEGORIES.UI_COMPONENT]: 'DESIGN',
  [ERROR_CATEGORIES.DEPENDENCY]: 'GITHUB'
};

// =============================================================================
// EVA ERROR HANDLER MIDDLEWARE
// =============================================================================

/**
 * Generate correlation ID for error tracking
 */
function generateCorrelationId() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const shortUuid = uuidv4().slice(0, 8);
  return `err-${date}-${shortUuid}`;
}

/**
 * Get Chairman-friendly message from error pattern
 */
function getChairmanMessage(errorInfo) {
  if (!errorInfo || !errorInfo.patterns || errorInfo.patterns.length === 0) {
    return CHAIRMAN_MESSAGES.default;
  }

  const patternId = errorInfo.patterns[0].id;
  return CHAIRMAN_MESSAGES[patternId] || CHAIRMAN_MESSAGES.default;
}

/**
 * Extract recommended action from error diagnosis
 */
function getRecommendedAction(errorInfo) {
  if (!errorInfo || !errorInfo.patterns || errorInfo.patterns.length === 0) {
    return 'Engineering team investigating';
  }

  const pattern = errorInfo.patterns[0];

  if (pattern.diagnosis && pattern.diagnosis.length > 0) {
    return pattern.diagnosis[0];
  }

  return 'Engineering team investigating';
}

/**
 * Get sub-agent recommendation
 */
function getSubAgentRecommendation(errorInfo) {
  if (!errorInfo) {
    return null;
  }

  // Use recommendSubAgent if available
  const recommendation = recommendSubAgent(errorInfo);
  if (recommendation && recommendation.subAgent) {
    return recommendation.subAgent;
  }

  // Fallback to category mapping
  if (errorInfo.patterns && errorInfo.patterns.length > 0) {
    const category = errorInfo.patterns[0].category;
    return CATEGORY_TO_SUBAGENT[category] || null;
  }

  return null;
}

/**
 * Log error to system_events table for EVA aggregation
 */
async function logToSystemEvents(supabase, eventType, evaReport, ventureId) {
  if (!supabase) return;

  try {
    await supabase.from('system_events').insert({
      event_type: eventType,
      venture_id: ventureId || null,
      payload: evaReport,
      correlation_id: evaReport.correlation_id,
      created_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('[EVA:ERROR_HANDLER] Failed to log to system_events:', err.message);
  }
}

/**
 * EVA Error Handler Middleware
 *
 * Express error handling middleware that transforms errors into
 * Chairman-Grade EVA Status Reports.
 *
 * @param {object} options - Configuration options
 * @param {object} options.supabase - Supabase client for logging
 * @returns {function} Express error middleware
 */
export function createEvaErrorHandler(options = {}) {
  const { supabase } = options;

  return async function evaErrorHandler(err, req, res, next) {
    // Skip if headers already sent
    if (res.headersSent) {
      return next(err);
    }

    // 1. Detect error pattern
    const context = {
      path: req.path,
      method: req.method,
      venture_id: req.venture_id || req.query?.venture_id || req.headers?.['x-venture-id']
    };

    const errorInfo = detectError(err.message || String(err), context);

    // 2. Get sub-agent recommendation
    const subAgent = getSubAgentRecommendation(errorInfo);

    // 3. Determine severity and status code
    const severity = errorInfo?.patterns?.[0]?.severity || SEVERITY_LEVELS.MEDIUM;
    const statusCode = err.statusCode || SEVERITY_TO_STATUS[severity] || 500;

    // 4. Build EVA Status Report
    const evaReport = {
      alert: getChairmanMessage(errorInfo),
      severity: severity,
      category: errorInfo?.patterns?.[0]?.category || 'RUNTIME',

      // Actionable context
      diagnosis: errorInfo?.patterns?.[0]?.diagnosis?.slice(0, 3) || ['System error occurred'],
      recommended_action: getRecommendedAction(errorInfo),
      sub_agent: subAgent,

      // Correlation for support
      correlation_id: req.headers?.['x-correlation-id'] || generateCorrelationId(),
      timestamp: new Date().toISOString(),

      // Request context (for debugging)
      request: {
        path: req.path,
        method: req.method,
        venture_id: context.venture_id
      }
    };

    // 5. Add debug info in non-production
    if (process.env.NODE_ENV !== 'production') {
      evaReport.debug = {
        original_message: err.message,
        stack: err.stack?.split('\n').slice(0, 5)
      };
    }

    // 6. Log to system_events for EVA aggregation
    if (supabase) {
      await logToSystemEvents(supabase, 'ERROR_REPORT', evaReport, context.venture_id);
    }

    // 7. Log to console for monitoring
    console.error(`[EVA:ERROR] ${evaReport.correlation_id} | ${severity} | ${evaReport.alert}`);
    if (process.env.NODE_ENV !== 'production') {
      console.error('[EVA:ERROR] Details:', err.message);
    }

    // 8. Send response
    res.status(statusCode).json(evaReport);
  };
}

/**
 * Wrap async route handlers to catch errors
 */
export function asyncHandler(fn) {
  return function(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Create error from EVA category (for throwing structured errors)
 */
export function createEvaError(message, options = {}) {
  const error = new Error(message);
  error.statusCode = options.statusCode || 500;
  error.category = options.category || 'RUNTIME';
  error.severity = options.severity || SEVERITY_LEVELS.MEDIUM;
  return error;
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  CHAIRMAN_MESSAGES,
  SEVERITY_TO_STATUS,
  CATEGORY_TO_SUBAGENT,
  generateCorrelationId,
  getChairmanMessage
};

export default createEvaErrorHandler;
