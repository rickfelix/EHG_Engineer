/**
 * Event Bus Handler Registry
 * SD: SD-EVA-FEAT-EVENT-BUS-001
 *
 * Manages registration and lookup of event handlers.
 * Ensures idempotent registration (safe for hot-reload).
 */

/**
 * Create an isolated handler registry instance.
 *
 * Returns an independent Map-backed handler registry. Multiple isolated
 * registries can coexist without sharing state, enabling stateless module
 * semantics and concurrent event processing without interference.
 *
 * @returns {{ registerHandler: function, getHandler: function, getRegistryCounts: function, listRegisteredTypes: function, clearHandlers: function, getHandlerCount: function }}
 */
export function createHandlerRegistry() {
  const store = new Map();

  return {
    registerHandler(eventType, handlerFn, options = {}) {
      const name = options.name || handlerFn.name || eventType;
      store.set(eventType, {
        eventType,
        handlerFn,
        name,
        retryable: options.retryable !== false,
        maxRetries: options.maxRetries ?? 3,
        registeredAt: new Date().toISOString(),
      });
    },

    getHandler(eventType) {
      return store.get(eventType) || null;
    },

    getRegistryCounts() {
      const counts = new Map();
      for (const [eventType] of store) {
        counts.set(eventType, 1);
      }
      return counts;
    },

    listRegisteredTypes() {
      return Array.from(store.keys());
    },

    clearHandlers() {
      store.clear();
    },

    getHandlerCount() {
      return store.size;
    },
  };
}

// Default instance for backward-compatible module-level exports.
// Process-scoped singleton — not shared across workers or processes.
const _defaultHandlers = createHandlerRegistry();

/**
 * Register a handler for an event type.
 * Idempotent - re-registering the same event type replaces the handler.
 *
 * @param {string} eventType - e.g. 'stage.completed'
 * @param {Function} handlerFn - async (event, context) => result
 * @param {object} [options] - { name, retryable, maxRetries }
 */
export function registerHandler(eventType, handlerFn, options = {}) {
  _defaultHandlers.registerHandler(eventType, handlerFn, options);
}

/**
 * Get the handler for an event type.
 * @param {string} eventType
 * @returns {object|null} Handler entry or null
 */
export function getHandler(eventType) {
  return _defaultHandlers.getHandler(eventType);
}

/**
 * Get count of registered handlers per event type.
 * @returns {Map<string, number>} event type -> count (always 1 per type)
 */
export function getRegistryCounts() {
  return _defaultHandlers.getRegistryCounts();
}

/**
 * List all registered event types.
 * @returns {string[]}
 */
export function listRegisteredTypes() {
  return _defaultHandlers.listRegisteredTypes();
}

/**
 * Clear all handlers (for testing).
 */
export function clearHandlers() {
  _defaultHandlers.clearHandlers();
}

/**
 * Get total number of registered handlers.
 * @returns {number}
 */
export function getHandlerCount() {
  return _defaultHandlers.getHandlerCount();
}
