/**
 * Event Bus Handler Registry
 * SD: SD-EVA-FEAT-EVENT-BUS-001
 *
 * Manages registration and lookup of event handlers.
 * Ensures idempotent registration (safe for hot-reload).
 */

const _handlers = new Map();

/**
 * Register a handler for an event type.
 * Idempotent - re-registering the same event type replaces the handler.
 *
 * @param {string} eventType - e.g. 'stage.completed'
 * @param {Function} handlerFn - async (event, context) => result
 * @param {object} [options] - { name, retryable, maxRetries }
 */
export function registerHandler(eventType, handlerFn, options = {}) {
  const name = options.name || handlerFn.name || eventType;
  _handlers.set(eventType, {
    eventType,
    handlerFn,
    name,
    retryable: options.retryable !== false,
    maxRetries: options.maxRetries ?? 3,
    registeredAt: new Date().toISOString(),
  });
}

/**
 * Get the handler for an event type.
 * @param {string} eventType
 * @returns {object|null} Handler entry or null
 */
export function getHandler(eventType) {
  return _handlers.get(eventType) || null;
}

/**
 * Get count of registered handlers per event type.
 * @returns {Map<string, number>} event type -> count (always 1 per type)
 */
export function getRegistryCounts() {
  const counts = new Map();
  for (const [eventType] of _handlers) {
    counts.set(eventType, 1);
  }
  return counts;
}

/**
 * List all registered event types.
 * @returns {string[]}
 */
export function listRegisteredTypes() {
  return Array.from(_handlers.keys());
}

/**
 * Clear all handlers (for testing).
 */
export function clearHandlers() {
  _handlers.clear();
}

/**
 * Get total number of registered handlers.
 * @returns {number}
 */
export function getHandlerCount() {
  return _handlers.size;
}
