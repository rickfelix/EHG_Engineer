/**
 * Shared Services Lifecycle — Service Init/Health Extension
 * SD: SD-MAN-ORCH-VISION-HEAL-SCORE-93-002-02-A
 *
 * Extends the shared-services pattern with optional lifecycle hooks
 * (init, start, stop, health) for services that need async setup
 * or health reporting. Backward-compatible — services without hooks
 * work unchanged.
 *
 * @module lib/eva/shared-services-lifecycle
 */

const INIT_TIMEOUT_MS = 10_000;

/**
 * Create a service with optional lifecycle hooks.
 * Wraps the base createService pattern from shared-services.js.
 *
 * @param {Object} config - Service configuration
 * @param {string} config.name - Service name (required)
 * @param {string[]} [config.capabilities] - Declared capabilities
 * @param {number[]} [config.stages] - Supported stages
 * @param {Function} config.executeFn - Core execution function
 * @param {Object} [config.lifecycle] - Optional lifecycle hooks
 * @param {Function} [config.lifecycle.init] - Async init (supabase) => void
 * @param {Function} [config.lifecycle.start] - Async start () => void
 * @param {Function} [config.lifecycle.stop] - Async stop () => void
 * @param {Function} [config.lifecycle.health] - Async health () => { status, latencyMs }
 * @returns {Object} Enhanced service object
 */
export function createLifecycleService(config) {
  const { name, capabilities = [], stages = [], executeFn, lifecycle = {} } = config;

  return {
    name,
    capabilities,
    stages,
    hasLifecycle: !!(lifecycle.init || lifecycle.health || lifecycle.start || lifecycle.stop),
    _initialized: false,

    async init(supabase) {
      if (lifecycle.init) {
        await withTimeout(lifecycle.init(supabase), INIT_TIMEOUT_MS, `${name}.init()`);
        this._initialized = true;
      }
    },

    async start() {
      if (lifecycle.start) {
        await withTimeout(lifecycle.start(), INIT_TIMEOUT_MS, `${name}.start()`);
      }
    },

    async stop() {
      if (lifecycle.stop) {
        await lifecycle.stop();
      }
      this._initialized = false;
    },

    async health() {
      if (!lifecycle.health) {
        return { status: 'healthy', latencyMs: 0 };
      }
      const start = Date.now();
      try {
        const result = await withTimeout(lifecycle.health(), 5000, `${name}.health()`);
        return {
          status: result?.status || 'healthy',
          latencyMs: result?.latencyMs || (Date.now() - start),
        };
      } catch (err) {
        return {
          status: 'unhealthy',
          latencyMs: Date.now() - start,
          error: err.message,
        };
      }
    },

    execute: executeFn,
  };
}

/**
 * Initialize all services in a registry that have lifecycle hooks.
 *
 * @param {Object} registry - Service registry (must have listAll())
 * @param {Object} supabase - Supabase client for service init
 * @param {Object} [options]
 * @param {Object} [options.logger] - Logger instance
 * @returns {Promise<{ initialized: string[], failed: Array<{name: string, error: string}> }>}
 */
export async function initializeAll(registry, supabase, options = {}) {
  const { logger = console } = options;
  const initialized = [];
  const failed = [];

  if (!registry || typeof registry.listAll !== 'function') {
    return { initialized, failed };
  }

  const services = registry.listAll();

  for (const service of services) {
    if (!service.init || !service.hasLifecycle) continue;

    try {
      await service.init(supabase);
      initialized.push(service.name);
    } catch (err) {
      logger.warn(`[Lifecycle] Failed to init ${service.name}: ${err.message}`);
      failed.push({ name: service.name, error: err.message });
    }
  }

  return { initialized, failed };
}

/**
 * Run health checks on all services with lifecycle hooks.
 * Returns aggregate status compatible with hub-health-monitor.
 *
 * @param {Object} registry - Service registry
 * @returns {Promise<{ services: Array<{name: string, status: string, latencyMs: number}>, overall: string }>}
 */
export async function healthCheckAll(registry) {
  const services = [];

  if (!registry || typeof registry.listAll !== 'function') {
    return { services, overall: 'unknown' };
  }

  const allServices = registry.listAll();

  for (const service of allServices) {
    if (!service.health) {
      services.push({ name: service.name, status: 'healthy', latencyMs: 0 });
      continue;
    }

    const result = await service.health();
    services.push({
      name: service.name,
      status: result.status,
      latencyMs: result.latencyMs,
      ...(result.error ? { error: result.error } : {}),
    });
  }

  let overall = 'healthy';
  if (services.some(s => s.status === 'unhealthy')) {
    overall = 'unhealthy';
  } else if (services.some(s => s.status === 'degraded')) {
    overall = 'degraded';
  }

  return { services, overall };
}

// ── Internal ─────────────────────────────────────

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}
