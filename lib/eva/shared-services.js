import crypto from 'node:crypto';

/**
 * Shared Services Abstraction: Common Service Interface
 * SD-EVA-FEAT-SHARED-SERVICES-001
 *
 * Provides a standard lifecycle for all EVA services:
 *   loadContext(supabase, ventureId, stageId) → execute(context, config) → emit(supabase, eventType, payload)
 *
 * Also includes a capability-based service registry for dynamic discovery.
 *
 * @module lib/eva/shared-services
 */

export const MODULE_VERSION = '1.0.0';

// ── ServiceError ─────────────────────────────────────────

/**
 * Structured error class for EVA service operations.
 */
export class ServiceError extends Error {
  /**
   * @param {string} code - Machine-readable error code (e.g. CONTEXT_LOAD_FAILED)
   * @param {string} message - Human-readable description
   * @param {string} serviceName - Name of the service that threw
   * @param {Error|null} [originalError] - Underlying error if wrapping
   */
  constructor(code, message, serviceName, originalError = null) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    this.serviceName = serviceName;
    this.originalError = originalError;
  }
}

// ── Context Loading ──────────────────────────────────────

/**
 * Load venture context and stage configuration from Supabase.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} ventureId - UUID of the venture
 * @param {number} stageId - Stage number (1-25)
 * @param {string} [serviceName] - For error reporting
 * @returns {Promise<{venture: object, stage: object|null, metadata: {loadedAt: string}}>}
 */
export async function loadContext(supabase, ventureId, stageId, serviceName = 'unknown') {
  const { data: venture, error: ventureError } = await supabase
    .from('ventures')
    .select('id, name, status, current_lifecycle_stage, archetype, metadata')
    .eq('id', ventureId)
    .single();

  if (ventureError) {
    throw new ServiceError(
      'CONTEXT_LOAD_FAILED',
      `Failed to load venture ${ventureId}: ${ventureError.message}`,
      serviceName,
      ventureError,
    );
  }

  if (!venture) {
    throw new ServiceError(
      'VENTURE_NOT_FOUND',
      `Venture ${ventureId} not found`,
      serviceName,
    );
  }

  // Stage data is optional — some services operate venture-wide
  let stage = null;
  if (stageId != null) {
    const { data: stageData, error: stageError } = await supabase
      .from('eva_venture_stages')
      .select('id, venture_id, stage_number, status, started_at, completed_at, metadata')
      .eq('venture_id', ventureId)
      .eq('stage_number', stageId)
      .single();

    if (stageError && stageError.code !== 'PGRST116') {
      // PGRST116 = no rows — that's fine, stage may not exist yet
      throw new ServiceError(
        'CONTEXT_LOAD_FAILED',
        `Failed to load stage ${stageId} for venture ${ventureId}: ${stageError.message}`,
        serviceName,
        stageError,
      );
    }

    stage = stageData || null;
  }

  return {
    venture,
    stage,
    metadata: { loadedAt: new Date().toISOString() },
  };
}

// ── Event Emission ───────────────────────────────────────

/**
 * Emit an event to the eva_event_log table.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} eventType - Event type identifier
 * @param {object} payload - Event payload data
 * @param {string} [serviceName] - For error reporting and event attribution
 * @returns {Promise<{id: string, event_type: string, created_at: string}>}
 */
export async function emit(supabase, eventType, payload, serviceName = 'unknown') {
  const { data, error } = await supabase
    .from('eva_event_log')
    .insert({
      event_type: eventType,
      payload: { ...payload, _service: serviceName },
      trigger_source: payload?.trigger_source || 'manual',
      correlation_id: payload?.correlation_id || crypto.randomUUID(),
      status: payload?.status || 'succeeded',
      created_at: new Date().toISOString(),
    })
    .select('id, event_type, created_at')
    .single();

  if (error) {
    throw new ServiceError(
      'EVENT_EMIT_FAILED',
      `Failed to emit event ${eventType}: ${error.message}`,
      serviceName,
      error,
    );
  }

  return data;
}

// ── Service Factory ──────────────────────────────────────

/**
 * Create a service object with the standard EVA lifecycle.
 *
 * @param {{name: string, capabilities?: string[], stages?: number[], executeFn: function}} config
 * @returns {{name: string, capabilities: string[], stages: number[], loadContext: function, execute: function, emit: function}}
 */
export function createService(config) {
  const { name, capabilities = [], stages = [], executeFn } = config;

  if (!name) throw new ServiceError('INVALID_CONFIG', 'Service name is required', 'createService');
  if (typeof executeFn !== 'function') throw new ServiceError('INVALID_CONFIG', 'executeFn must be a function', name);

  return {
    name,
    capabilities,
    stages,

    /**
     * Load venture + stage context.
     */
    loadContext: (supabase, ventureId, stageId) => loadContext(supabase, ventureId, stageId, name),

    /**
     * Execute service-specific logic with pre-loaded context.
     */
    async execute(context, execConfig = {}) {
      const start = Date.now();
      try {
        const data = await executeFn(context, execConfig);
        return { success: true, data, duration: Date.now() - start };
      } catch (err) {
        if (err instanceof ServiceError) throw err;
        throw new ServiceError(
          'EXECUTE_FAILED',
          `Service ${name} execution failed: ${err.message}`,
          name,
          err,
        );
      }
    },

    /**
     * Emit an event attributed to this service.
     */
    emit: (supabase, eventType, payload) => emit(supabase, eventType, payload, name),
  };
}

// ── Service Registry ─────────────────────────────────────

/**
 * Create an isolated service registry instance.
 *
 * Returns an independent Map-backed registry. Multiple isolated registries
 * can coexist without sharing state, which is required for concurrent
 * execution and stateless module semantics.
 *
 * @returns {{ registerService: function, getByCapability: function, getByStage: function, listAll: function, clearRegistry: function }}
 */
export function createRegistry() {
  const store = new Map();

  return {
    registerService(config) {
      if (store.has(config.name)) {
        throw new ServiceError(
          'DUPLICATE_SERVICE',
          `Service "${config.name}" is already registered`,
          'registry',
        );
      }
      const service = createService(config);
      store.set(service.name, service);
      return service;
    },

    getByCapability(capability) {
      const results = [];
      for (const svc of store.values()) {
        if (svc.capabilities.includes(capability)) results.push(svc);
      }
      return results;
    },

    getByStage(stageNumber) {
      const results = [];
      for (const svc of store.values()) {
        if (svc.stages.includes(stageNumber)) results.push(svc);
      }
      return results;
    },

    listAll() {
      return Array.from(store.values());
    },

    clearRegistry() {
      store.clear();
    },
  };
}

// Default instance for backward-compatible module-level exports.
// Process-scoped singleton — not shared across workers or processes.
const _defaultRegistry = createRegistry();

/**
 * Register a service in the default registry.
 * @param {{name: string, capabilities?: string[], stages?: number[], executeFn: function}} config
 * @returns {object} The created service object
 */
export function registerService(config) {
  return _defaultRegistry.registerService(config);
}

/**
 * Find services that have a given capability.
 * @param {string} capability
 * @returns {object[]}
 */
export function getByCapability(capability) {
  return _defaultRegistry.getByCapability(capability);
}

/**
 * Find services that support a given stage number.
 * @param {number} stageNumber
 * @returns {object[]}
 */
export function getByStage(stageNumber) {
  return _defaultRegistry.getByStage(stageNumber);
}

/**
 * List all registered services.
 * @returns {object[]}
 */
export function listAll() {
  return _defaultRegistry.listAll();
}

/**
 * Clear the default registry (primarily for testing).
 */
export function clearRegistry() {
  _defaultRegistry.clearRegistry();
}
