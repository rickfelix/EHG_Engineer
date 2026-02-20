/**
 * Event Bus Handler Registry (Unified)
 * SD: SD-EHG-ORCH-FOUNDATION-CLEANUP-001-D
 *
 * Manages registration and lookup of event handlers.
 * Supports BOTH single-handler (EVA pattern via singleton option) and
 * multi-handler (Vision pattern, default) per event type.
 * Ensures idempotent registration (safe for hot-reload).
 */

/**
 * Create an isolated handler registry instance.
 *
 * Returns an independent Map-backed handler registry. Multiple isolated
 * registries can coexist without sharing state, enabling stateless module
 * semantics and concurrent event processing without interference.
 *
 * @returns {{ registerHandler: function, getHandler: function, getHandlers: function, getRegistryCounts: function, listRegisteredTypes: function, clearHandlers: function, getHandlerCount: function }}
 */
export function createHandlerRegistry() {
  // Map<string, Array<HandlerEntry>>
  const store = new Map();

  return {
    /**
     * Register a handler for an event type.
     * Default: appends to handler list (multi-handler support).
     * With options.singleton: true, replaces all handlers for that type.
     *
     * @param {string} eventType
     * @param {Function} handlerFn
     * @param {object} [options] - { name, retryable, maxRetries, singleton }
     */
    registerHandler(eventType, handlerFn, options = {}) {
      const entry = {
        eventType,
        handlerFn,
        name: options.name || handlerFn.name || eventType,
        retryable: options.retryable !== false,
        maxRetries: options.maxRetries ?? 3,
        registeredAt: new Date().toISOString(),
      };

      if (options.singleton) {
        // EVA pattern: one handler per event type, replaces existing
        store.set(eventType, [entry]);
      } else {
        // Multi-handler pattern: append to list
        const existing = store.get(eventType) || [];
        existing.push(entry);
        store.set(eventType, existing);
      }
    },

    /**
     * Get the first (primary) handler for an event type.
     * Backward-compatible with single-handler consumers.
     * @param {string} eventType
     * @returns {object|null} Handler entry or null
     */
    getHandler(eventType) {
      const handlers = store.get(eventType);
      return (handlers && handlers.length > 0) ? handlers[0] : null;
    },

    /**
     * Get ALL handlers registered for an event type.
     * @param {string} eventType
     * @returns {Array<object>} Array of handler entries (empty if none)
     */
    getHandlers(eventType) {
      return store.get(eventType) || [];
    },

    /**
     * Get count of registered handlers per event type.
     * @returns {Map<string, number>} event type -> handler count
     */
    getRegistryCounts() {
      const counts = new Map();
      for (const [eventType, handlers] of store) {
        counts.set(eventType, handlers.length);
      }
      return counts;
    },

    /**
     * List all registered event types.
     * @returns {string[]}
     */
    listRegisteredTypes() {
      return Array.from(store.keys());
    },

    /**
     * Clear all handlers (for testing).
     */
    clearHandlers() {
      store.clear();
    },

    /**
     * Get total number of registered handlers across all event types.
     * @returns {number}
     */
    getHandlerCount() {
      let total = 0;
      for (const handlers of store.values()) {
        total += handlers.length;
      }
      return total;
    },
  };
}

// Default instance for backward-compatible module-level exports.
// Process-scoped singleton — not shared across workers or processes.
const _defaultHandlers = createHandlerRegistry();

/**
 * Register a handler for an event type.
 * Default: appends (multi-handler). Use options.singleton: true to replace.
 *
 * @param {string} eventType - e.g. 'stage.completed'
 * @param {Function} handlerFn - async (event, context) => result
 * @param {object} [options] - { name, retryable, maxRetries, singleton }
 */
export function registerHandler(eventType, handlerFn, options = {}) {
  _defaultHandlers.registerHandler(eventType, handlerFn, options);
}

/**
 * Get the first handler for an event type (backward compat).
 * @param {string} eventType
 * @returns {object|null} Handler entry or null
 */
export function getHandler(eventType) {
  return _defaultHandlers.getHandler(eventType);
}

/**
 * Get ALL handlers for an event type.
 * @param {string} eventType
 * @returns {Array<object>} Handler entries
 */
export function getHandlers(eventType) {
  return _defaultHandlers.getHandlers(eventType);
}

/**
 * Get count of registered handlers per event type.
 * @returns {Map<string, number>} event type -> count
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
