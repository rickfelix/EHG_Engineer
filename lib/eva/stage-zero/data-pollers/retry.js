/**
 * Retry utility for data pollers.
 * Wraps async functions with retry logic and timeout enforcement.
 *
 * Part of SD-LEO-INFRA-COMPETITOR-MONITORING-PHASE-002
 */

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_BASE_DELAY_MS = 1000;

/**
 * Execute an async function with retry and timeout.
 *
 * @param {Function} fn - Async function to execute
 * @param {Object} [options]
 * @param {number} [options.maxRetries=2] - Maximum retry attempts
 * @param {number} [options.timeoutMs=30000] - Per-attempt timeout in ms
 * @param {number} [options.baseDelayMs=1000] - Base delay for exponential backoff
 * @param {Object} [options.logger=console] - Logger instance
 * @param {string} [options.label='operation'] - Label for log messages
 * @returns {Promise<*>} Result of fn()
 */
export async function withRetry(fn, options = {}) {
  const {
    maxRetries = DEFAULT_MAX_RETRIES,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    logger = console,
    label = 'operation',
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await Promise.race([
        fn(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
        ),
      ]);
      return result;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        logger.log(`${label}: attempt ${attempt + 1} failed (${err.message}), retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}
