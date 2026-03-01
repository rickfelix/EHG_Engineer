/**
 * Service Registry for EVA domain dispatching.
 * SD-MAN-GEN-CORRECTIVE-VISION-GAP-012 (A03: eva_hub_and_orchestration_model)
 *
 * Provides a registered handler map so EvaMasterScheduler dispatches
 * domain jobs through a registry instead of direct imports.
 *
 * @module lib/eva/service-registry
 */

/**
 * @typedef {Function} ServiceHandler
 * @param {Object} params - Handler-specific parameters
 * @returns {Promise<*>}
 */

export class ServiceRegistry {
  /** @type {Map<string, ServiceHandler>} */
  #handlers = new Map();

  /**
   * Register a handler for a service type.
   *
   * @param {string} serviceType - Unique service identifier (e.g., 'score_sd', 'process_stage')
   * @param {ServiceHandler} handler - Async function to invoke
   */
  register(serviceType, handler) {
    if (typeof handler !== 'function') {
      throw new Error(`ServiceRegistry: handler for '${serviceType}' must be a function`);
    }
    this.#handlers.set(serviceType, handler);
  }

  /**
   * Dispatch a call to a registered service.
   *
   * @param {string} serviceType - Service to invoke
   * @param {Object} params - Parameters passed to handler
   * @returns {Promise<*>} Handler result
   * @throws {Error} If service type is not registered
   */
  async dispatch(serviceType, params) {
    const handler = this.#handlers.get(serviceType);
    if (!handler) {
      throw new Error(`ServiceRegistry: unknown service type '${serviceType}'. Registered: ${[...this.#handlers.keys()].join(', ')}`);
    }
    return handler(params);
  }

  /**
   * Check if a service type is registered.
   * @param {string} serviceType
   * @returns {boolean}
   */
  has(serviceType) {
    return this.#handlers.has(serviceType);
  }

  /**
   * List all registered service types.
   * @returns {string[]}
   */
  listServices() {
    return [...this.#handlers.keys()];
  }
}

/** Shared singleton for the EVA scheduler domain */
const defaultRegistry = new ServiceRegistry();
export default defaultRegistry;
