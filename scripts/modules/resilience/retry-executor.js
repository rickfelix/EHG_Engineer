/**
 * Retry Executor - Resilient API Call Wrapper
 * SD-GENESIS-V32-PULSE: Self-Healing Heart
 *
 * Implements retry logic with exponential backoff and jitter for all
 * external API calls (OpenAI, Vercel, Supabase).
 *
 * @module resilience/retry-executor
 * @version 1.0.0
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Supabase client for error logging
let supabase = null;
function getSupabaseClient() {
  if (!supabase && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return supabase;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffFactor: 2,
  jitter: true,
  jitterMaxMs: 500,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
  nonRetryableStatusCodes: [400, 401, 403, 404, 422],
};

/**
 * Error codes that should never be retried
 */
const NON_RETRYABLE_ERRORS = [
  'ENOTFOUND',           // DNS lookup failed (network misconfiguration)
  'ECONNREFUSED',        // Connection refused
  'ERR_INVALID_URL',     // Invalid URL
  'ERR_INVALID_ARG',     // Invalid argument
];

/**
 * Sleep utility with optional jitter
 *
 * @param {number} ms - Base milliseconds to sleep
 * @param {boolean} withJitter - Add random jitter to prevent thundering herd
 * @param {number} jitterMaxMs - Maximum jitter in milliseconds
 * @returns {Promise<void>}
 */
async function sleep(ms, withJitter = true, jitterMaxMs = 500) {
  const jitter = withJitter ? Math.random() * jitterMaxMs : 0;
  const totalMs = ms + jitter;
  return new Promise(resolve => setTimeout(resolve, totalMs));
}

/**
 * Calculate delay for next retry attempt using exponential backoff
 *
 * @param {number} attempt - Current attempt number (1-based)
 * @param {Object} config - Retry configuration
 * @returns {number} Delay in milliseconds
 */
function calculateBackoffDelay(attempt, config) {
  const exponentialDelay = config.baseDelayMs * Math.pow(config.backoffFactor, attempt - 1);
  return Math.min(exponentialDelay, config.maxDelayMs);
}

/**
 * Determine if an error is retryable based on its properties
 *
 * @param {Error} error - The error to check
 * @param {Object} config - Retry configuration
 * @returns {Object} { retryable: boolean, reason: string }
 */
export function isRetryable(error, config = DEFAULT_RETRY_CONFIG) {
  // Check for non-retryable error codes
  if (error.code && NON_RETRYABLE_ERRORS.includes(error.code)) {
    return { retryable: false, reason: `Non-retryable error code: ${error.code}` };
  }

  // Check HTTP status codes
  const status = error.status || error.statusCode || error.response?.status;

  if (status) {
    // Non-retryable status codes
    if (config.nonRetryableStatusCodes.includes(status)) {
      return { retryable: false, reason: `Non-retryable status: ${status}` };
    }

    // Retryable status codes
    if (config.retryableStatusCodes.includes(status)) {
      return { retryable: true, reason: `Retryable status: ${status}` };
    }
  }

  // Check for specific error types
  if (error.name === 'AbortError') {
    return { retryable: false, reason: 'Request aborted' };
  }

  if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
    return { retryable: true, reason: 'Network failure (retryable)' };
  }

  // Rate limit errors (common in OpenAI, Vercel)
  if (error.message?.toLowerCase().includes('rate limit') ||
      error.message?.toLowerCase().includes('too many requests')) {
    return { retryable: true, reason: 'Rate limited' };
  }

  // Timeout errors are generally retryable
  if (error.message?.toLowerCase().includes('timeout') ||
      error.message?.toLowerCase().includes('timed out')) {
    return { retryable: true, reason: 'Timeout (retryable)' };
  }

  // Default: unknown errors are retryable (we'll log and learn)
  return { retryable: true, reason: 'Unknown error type (defaulting to retryable)' };
}

/**
 * Log critical error to leo_error_log table
 *
 * @param {Error} error - The error to log
 * @param {Object} context - Additional context
 * @returns {Promise<string|null>} Error log ID if successful
 */
async function logCriticalError(error, context = {}) {
  const client = getSupabaseClient();
  if (!client) {
    console.error('[RetryExecutor] Cannot log error - Supabase client not available');
    return null;
  }

  const errorRecord = {
    error_type: mapErrorToType(error),
    error_message: error.message || String(error),
    error_code: String(error.status || error.statusCode || error.code || ''),
    error_stack: error.stack?.substring(0, 4000),
    operation: context.operation || 'unknown',
    component: context.component || 'retry-executor',
    sd_id: context.sdId || null,
    attempt_count: context.attemptCount || 1,
    is_recoverable: context.isRecoverable !== false,
    recovery_guidance: context.recoveryGuidance || generateRecoveryGuidance(error),
    session_id: context.sessionId || null,
    context: {
      ...context,
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
    },
    severity: context.attemptCount >= 3 ? 'critical' : 'error',
  };

  try {
    const { data, error: insertError } = await client
      .from('leo_error_log')
      .insert(errorRecord)
      .select('id')
      .single();

    if (insertError) {
      console.error('[RetryExecutor] Failed to log error:', insertError.message);
      return null;
    }

    return data?.id;
  } catch (e) {
    console.error('[RetryExecutor] Exception logging error:', e.message);
    return null;
  }
}

/**
 * Map an error to the leo_error_log error_type enum
 *
 * @param {Error} error - The error to map
 * @returns {string} Error type
 */
function mapErrorToType(error) {
  const status = error.status || error.statusCode || error.response?.status;
  const message = error.message?.toLowerCase() || '';

  if (status === 401 || status === 403) return 'AUTH_ERROR';
  if (status === 429 || message.includes('rate limit')) return 'RATE_LIMIT';
  if (message.includes('timeout') || message.includes('timed out')) return 'TIMEOUT';
  if (message.includes('network') || message.includes('fetch')) return 'NETWORK_ERROR';
  if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') return 'NETWORK_ERROR';
  if (status >= 500) return 'API_FAILURE';
  if (message.includes('validation')) return 'VALIDATION_ERROR';
  if (message.includes('database') || message.includes('postgres')) return 'DATABASE_ERROR';

  return 'UNKNOWN';
}

/**
 * Generate recovery guidance based on error type
 *
 * @param {Error} error - The error to analyze
 * @returns {string} Human-readable recovery guidance
 */
function generateRecoveryGuidance(error) {
  const status = error.status || error.statusCode || error.response?.status;
  const errorType = mapErrorToType(error);

  const guidance = {
    AUTH_ERROR: 'Check API keys and authentication credentials. Verify the token has not expired.',
    RATE_LIMIT: 'Wait before retrying. Consider implementing request throttling or upgrading API tier.',
    TIMEOUT: 'The operation took too long. Try with a smaller payload or increase timeout settings.',
    NETWORK_ERROR: 'Check network connectivity. Verify DNS settings and firewall rules.',
    API_FAILURE: 'External API is experiencing issues. Check service status page and try again later.',
    VALIDATION_ERROR: 'Review the request payload for invalid data. Check API documentation for required fields.',
    DATABASE_ERROR: 'Database operation failed. Check connection string and database availability.',
    UNKNOWN: 'Unexpected error. Review logs and stack trace for more details.',
  };

  return guidance[errorType] || guidance.UNKNOWN;
}

/**
 * Execute an operation with retry logic
 *
 * @param {Function} operation - Async function to execute
 * @param {Object} options - Retry options
 * @param {string} options.operationName - Name of the operation for logging
 * @param {string} options.component - Component name for error logging
 * @param {string} options.sdId - Strategic Directive ID if applicable
 * @param {number} options.maxAttempts - Maximum retry attempts (default: 3)
 * @param {number} options.baseDelayMs - Base delay between retries (default: 1000)
 * @param {number} options.maxDelayMs - Maximum delay cap (default: 30000)
 * @param {number} options.backoffFactor - Exponential backoff factor (default: 2)
 * @param {boolean} options.jitter - Add jitter to prevent thundering herd (default: true)
 * @param {Function} options.onRetry - Callback before each retry attempt
 * @param {Function} options.shouldRetry - Custom retry decision function
 * @returns {Promise<any>} Result of the operation
 * @throws {Error} If all retry attempts fail
 */
export async function withRetry(operation, options = {}) {
  const config = {
    ...DEFAULT_RETRY_CONFIG,
    ...options,
  };

  const operationName = options.operationName || 'unnamed-operation';
  const component = options.component || 'retry-executor';
  const sdId = options.sdId || null;
  const sessionId = options.sessionId || null;

  let lastError = null;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      const result = await operation();
      return result;
    } catch (error) {
      lastError = error;

      // Check if error is retryable
      const retryCheck = config.shouldRetry
        ? { retryable: config.shouldRetry(error, attempt), reason: 'Custom retry logic' }
        : isRetryable(error, config);

      // Don't retry if not retryable or last attempt
      if (!retryCheck.retryable) {
        console.log(`[RetryExecutor] ${operationName} failed with non-retryable error: ${retryCheck.reason}`);
        break;
      }

      if (attempt === config.maxAttempts) {
        console.log(`[RetryExecutor] ${operationName} failed after ${attempt} attempts`);
        break;
      }

      // Calculate delay with exponential backoff
      const delay = calculateBackoffDelay(attempt, config);

      console.log(`[RetryExecutor] ${operationName} attempt ${attempt}/${config.maxAttempts} failed. ` +
                  `Reason: ${retryCheck.reason}. Retrying in ${delay}ms...`);

      // Call onRetry callback if provided
      if (config.onRetry) {
        try {
          await config.onRetry(error, attempt, delay);
        } catch (callbackError) {
          console.warn('[RetryExecutor] onRetry callback error:', callbackError.message);
        }
      }

      // Wait before retry
      await sleep(delay, config.jitter, config.jitterMaxMs);
    }
  }

  // All attempts failed - log critical error
  const errorLogId = await logCriticalError(lastError, {
    operation: operationName,
    component,
    sdId,
    sessionId,
    attemptCount: config.maxAttempts,
    isRecoverable: isRetryable(lastError, config).retryable,
  });

  if (errorLogId) {
    console.error(`[RetryExecutor] CRITICAL: ${operationName} failed after ${config.maxAttempts} attempts. ` +
                  `Error logged: ${errorLogId}`);
  }

  // Enhance error with context
  const enhancedError = new Error(
    `${operationName} failed after ${config.maxAttempts} attempts: ${lastError.message}`
  );
  enhancedError.originalError = lastError;
  enhancedError.attempts = config.maxAttempts;
  enhancedError.errorLogId = errorLogId;
  enhancedError.recoveryGuidance = generateRecoveryGuidance(lastError);

  throw enhancedError;
}

/**
 * Create a retry-wrapped version of an async function
 *
 * @param {Function} fn - Async function to wrap
 * @param {Object} defaultOptions - Default retry options for this wrapper
 * @returns {Function} Wrapped function with retry logic
 */
export function createRetryWrapper(fn, defaultOptions = {}) {
  return async (...args) => {
    return withRetry(() => fn(...args), defaultOptions);
  };
}

/**
 * Execute multiple operations in parallel with individual retry logic
 *
 * @param {Array<{operation: Function, options: Object}>} operations - Operations to execute
 * @returns {Promise<Array<{success: boolean, result?: any, error?: Error}>>} Results array
 */
export async function withRetryAll(operations) {
  return Promise.all(
    operations.map(async ({ operation, options }) => {
      try {
        const result = await withRetry(operation, options);
        return { success: true, result };
      } catch (error) {
        return { success: false, error };
      }
    })
  );
}

/**
 * Preset configurations for common use cases
 */
export const RETRY_PRESETS = {
  // OpenAI API calls - longer delays for rate limits
  openai: {
    maxAttempts: 3,
    baseDelayMs: 2000,
    maxDelayMs: 60000,
    backoffFactor: 3,
    jitter: true,
    jitterMaxMs: 1000,
  },

  // Vercel API calls - moderate retry
  vercel: {
    maxAttempts: 3,
    baseDelayMs: 1500,
    maxDelayMs: 15000,
    backoffFactor: 2,
    jitter: true,
    jitterMaxMs: 500,
  },

  // Supabase/database calls - fast retry for transient issues
  database: {
    maxAttempts: 3,
    baseDelayMs: 500,
    maxDelayMs: 5000,
    backoffFactor: 2,
    jitter: true,
    jitterMaxMs: 200,
  },

  // GitHub API calls
  github: {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    backoffFactor: 2,
    jitter: true,
    jitterMaxMs: 500,
  },

  // Quick operations - minimal retry
  quick: {
    maxAttempts: 2,
    baseDelayMs: 500,
    maxDelayMs: 2000,
    backoffFactor: 2,
    jitter: false,
  },
};

/**
 * Get a preset configuration
 *
 * @param {string} presetName - Name of the preset
 * @returns {Object} Retry configuration
 */
export function getPreset(presetName) {
  return RETRY_PRESETS[presetName] || DEFAULT_RETRY_CONFIG;
}

// Default export for convenience
export default {
  withRetry,
  createRetryWrapper,
  withRetryAll,
  isRetryable,
  getPreset,
  RETRY_PRESETS,
  DEFAULT_RETRY_CONFIG,
};
