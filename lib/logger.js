/**
 * Structured Logger for EVA Platform
 *
 * Provides JSON-formatted log output with trace correlation,
 * log levels, and module context. Replaces direct console.* calls.
 *
 * Usage:
 *   import { createLogger } from '../logger.js';
 *   const logger = createLogger('EventRouter');
 *   logger.info('Processing event', { eventId, eventType });
 *   logger.warn('Handler failed', { error: err.message, attempt: 2 });
 *
 * @module lib/logger
 */

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

const CURRENT_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL?.toLowerCase()] ?? LOG_LEVELS.info;

/**
 * Create a structured logger for a named module.
 *
 * @param {string} module - Module name (e.g., 'EventRouter', 'GateEvaluated')
 * @param {Object} [context] - Persistent context merged into every log entry
 * @param {string} [context.traceId] - Trace correlation ID
 * @param {string} [context.ventureId] - Venture context
 * @returns {{ debug, info, warn, error, child }}
 */
export function createLogger(module, context = {}) {
  function emit(level, message, data = {}) {
    if (LOG_LEVELS[level] < CURRENT_LEVEL) return;

    const entry = {
      ts: new Date().toISOString(),
      level,
      module,
      msg: message,
      ...context,
      ...data,
    };

    const line = JSON.stringify(entry);

    if (level === 'error') process.stderr.write(line + '\n');
    else if (level === 'warn') process.stderr.write(line + '\n');
    else process.stdout.write(line + '\n');
  }

  return {
    debug: (msg, data) => emit('debug', msg, data),
    info:  (msg, data) => emit('info', msg, data),
    warn:  (msg, data) => emit('warn', msg, data),
    error: (msg, data) => emit('error', msg, data),

    /** Create a child logger with additional context. */
    child(extra) {
      return createLogger(module, { ...context, ...extra });
    },

    /** Console-compatible interface for dependency injection. */
    log:   (msg, ...args) => emit('info', typeof msg === 'string' ? msg : String(msg), args.length ? { args } : {}),
  };
}
