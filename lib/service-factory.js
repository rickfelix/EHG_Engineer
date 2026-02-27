/**
 * ServiceFactory — Unified Dependency Injection Container
 * SD-MAN-INFRA-VISION-HEAL-PLATFORM-001-01
 *
 * Wraps existing supabase-factory.js and llm/client-factory.js into a
 * unified container with mock injection for testing.
 *
 * USAGE:
 *   import { getServiceFactory } from '../lib/service-factory.js';
 *   const factory = getServiceFactory();
 *   const supabase = await factory.getSupabase();
 *   const llm = factory.getLLMClient({ purpose: 'classification' });
 *
 * TESTING:
 *   import { ServiceFactory } from '../lib/service-factory.js';
 *   const factory = ServiceFactory.withOverrides({ supabase: mockClient });
 *   const svc = new VisionGovernanceService({ factory });
 */

import { getServiceClient } from './supabase-factory.js';
import { getLLMClient } from './llm/client-factory.js';

export class ServiceFactory {
  #supabaseOverride = null;
  #llmOverride = null;

  /**
   * Create a factory with injected mock dependencies.
   * @param {Object} overrides
   * @param {Object} [overrides.supabase] - Mock Supabase client
   * @param {Object|Function} [overrides.llm] - Mock LLM client or factory function
   * @returns {ServiceFactory}
   */
  static withOverrides({ supabase = null, llm = null } = {}) {
    const f = new ServiceFactory();
    f.#supabaseOverride = supabase;
    f.#llmOverride = llm;
    return f;
  }

  /**
   * Get Supabase service client.
   * In production: delegates to supabase-factory.getServiceClient().
   * In test mode: returns the injected mock.
   * @param {Object} [options] - Passed to getServiceClient()
   * @returns {Promise<Object>} Supabase client
   */
  async getSupabase(options = {}) {
    if (this.#supabaseOverride) return this.#supabaseOverride;
    return getServiceClient(options);
  }

  /**
   * Get LLM client.
   * In production: delegates to llm/client-factory.getLLMClient().
   * In test mode: returns the injected mock (or calls it if it's a function).
   * @param {Object} [options] - Passed to getLLMClient()
   * @returns {Object} LLM adapter
   */
  getLLMClient(options = {}) {
    if (this.#llmOverride) {
      return typeof this.#llmOverride === 'function'
        ? this.#llmOverride(options)
        : this.#llmOverride;
    }
    return getLLMClient(options);
  }

  /**
   * Check if any override is active (i.e., running in test mode).
   * @returns {boolean}
   */
  isTestMode() {
    return this.#supabaseOverride !== null || this.#llmOverride !== null;
  }
}

// Process-scoped singleton
let _defaultFactory = null;

/**
 * Get the process-scoped singleton ServiceFactory.
 * @returns {ServiceFactory}
 */
export function getServiceFactory() {
  if (!_defaultFactory) _defaultFactory = new ServiceFactory();
  return _defaultFactory;
}

/**
 * Reset the singleton (for test isolation).
 */
export function resetServiceFactory() {
  _defaultFactory = null;
}
