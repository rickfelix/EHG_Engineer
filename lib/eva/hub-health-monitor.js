/**
 * Hub Health Monitor — Service Health Tracking for EVA Hub
 * SD: SD-MAN-ORCH-VISION-HEAL-SCORE-93-002-01-B
 *
 * Periodically checks health of registered EVA services from shared-services
 * registry. Tracks status (healthy/degraded/unhealthy) and exposes health APIs.
 *
 * @module lib/eva/hub-health-monitor
 */

// Health status constants
export const HEALTH_STATUS = Object.freeze({
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  UNHEALTHY: 'unhealthy',
  UNKNOWN: 'unknown',
});

const DEFAULT_CHECK_INTERVAL_MS = 30_000; // 30 seconds
const CONSECUTIVE_FAILURES_THRESHOLD = 3;
const DEFAULT_STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes — remove services with no heartbeat

// In-memory health state
let _serviceHealth = new Map();
let _checkInterval = null;

/**
 * Check health of a single service.
 *
 * @param {Object} service - Service object from registry
 * @param {Object} supabase - Supabase client
 * @param {Object} [options]
 * @param {Object} [options.logger] - Logger instance
 * @returns {Promise<{ status: string, latencyMs: number, error?: string }>}
 */
export async function checkServiceHealth(service, supabase, options = {}) {
  const { logger = console } = options;
  const start = Date.now();

  try {
    // Attempt a lightweight context load as health probe
    if (service.loadContext && supabase) {
      await service.loadContext(supabase, null, null);
    }

    const latencyMs = Date.now() - start;
    const status = latencyMs > 5000 ? HEALTH_STATUS.DEGRADED : HEALTH_STATUS.HEALTHY;

    return { status, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - start;
    logger.warn(`[HealthMonitor] Service "${service.name}" health check failed: ${err.message}`);
    return { status: HEALTH_STATUS.UNHEALTHY, latencyMs, error: err.message };
  }
}

/**
 * Run health checks on all services in a registry.
 *
 * @param {Object} registry - Service registry (from createRegistry or default)
 * @param {Object} supabase - Supabase client
 * @param {Object} [options]
 * @param {Object} [options.logger] - Logger instance
 * @returns {Promise<Map<string, Object>>} Map of service name → health result
 */
export async function checkAllServices(registry, supabase, options = {}) {
  const { logger = console } = options;

  if (!registry || typeof registry.listAll !== 'function') {
    logger.warn('[HealthMonitor] Invalid registry - cannot check services');
    return _serviceHealth;
  }

  const services = registry.listAll();

  for (const service of services) {
    const result = await checkServiceHealth(service, supabase, options);
    const existing = _serviceHealth.get(service.name) || { consecutiveFailures: 0 };

    const entry = {
      name: service.name,
      status: result.status,
      latencyMs: result.latencyMs,
      lastChecked: new Date().toISOString(),
      error: result.error || null,
      consecutiveFailures:
        result.status === HEALTH_STATUS.UNHEALTHY
          ? existing.consecutiveFailures + 1
          : 0,
    };

    // Escalate to degraded after threshold failures
    if (entry.consecutiveFailures >= CONSECUTIVE_FAILURES_THRESHOLD) {
      entry.status = HEALTH_STATUS.UNHEALTHY;
    }

    _serviceHealth.set(service.name, entry);
  }

  return _serviceHealth;
}

/**
 * Get health status for a specific service.
 *
 * @param {string} serviceName - Service name
 * @returns {{ status: string, latencyMs: number, lastChecked: string, error?: string } | null}
 */
export function getServiceHealth(serviceName) {
  return _serviceHealth.get(serviceName) || null;
}

/**
 * Get aggregate system health across all monitored services.
 *
 * @returns {{ overall: string, services: Object[], healthy: number, degraded: number, unhealthy: number, unknown: number }}
 */
export function getSystemHealth() {
  const services = Array.from(_serviceHealth.values());

  if (services.length === 0) {
    return {
      overall: HEALTH_STATUS.UNKNOWN,
      services: [],
      healthy: 0,
      degraded: 0,
      unhealthy: 0,
      unknown: 0,
    };
  }

  const counts = {
    healthy: 0,
    degraded: 0,
    unhealthy: 0,
    unknown: 0,
  };

  for (const s of services) {
    counts[s.status] = (counts[s.status] || 0) + 1;
  }

  let overall = HEALTH_STATUS.HEALTHY;
  if (counts.unhealthy > 0) {
    overall = HEALTH_STATUS.UNHEALTHY;
  } else if (counts.degraded > 0) {
    overall = HEALTH_STATUS.DEGRADED;
  } else if (counts.unknown > 0 && counts.healthy === 0) {
    overall = HEALTH_STATUS.UNKNOWN;
  }

  return { overall, services, ...counts };
}

/**
 * Start periodic health monitoring.
 *
 * @param {Object} registry - Service registry
 * @param {Object} supabase - Supabase client
 * @param {Object} [options]
 * @param {number} [options.intervalMs] - Check interval (default: 30s)
 * @param {Object} [options.logger] - Logger instance
 */
export function startMonitoring(registry, supabase, options = {}) {
  const { intervalMs = DEFAULT_CHECK_INTERVAL_MS, staleThresholdMs = DEFAULT_STALE_THRESHOLD_MS, logger = console } = options;

  stopMonitoring();

  // Run initial check
  checkAllServices(registry, supabase, { logger });

  _checkInterval = setInterval(() => {
    // Sweep stale entries before running new checks
    const stale = sweepStaleServices(staleThresholdMs);
    if (stale.length > 0) {
      logger.info(`[HealthMonitor] Swept ${stale.length} stale service(s): ${stale.join(', ')}`);
    }
    checkAllServices(registry, supabase, { logger });
  }, intervalMs);

  logger.info(`[HealthMonitor] Started monitoring (interval: ${intervalMs}ms, staleThreshold: ${staleThresholdMs}ms)`);
}

/**
 * Stop periodic health monitoring.
 */
export function stopMonitoring() {
  if (_checkInterval) {
    clearInterval(_checkInterval);
    _checkInterval = null;
  }
}

/**
 * Remove stale service entries that haven't been checked within the threshold.
 *
 * @param {number} [thresholdMs] - Inactivity threshold (default: 10 minutes)
 * @returns {string[]} Names of removed stale services
 */
export function sweepStaleServices(thresholdMs = DEFAULT_STALE_THRESHOLD_MS) {
  const now = Date.now();
  const removed = [];

  for (const [name, entry] of _serviceHealth) {
    if (!entry.lastChecked) continue;
    const age = now - new Date(entry.lastChecked).getTime();
    if (age > thresholdMs) {
      _serviceHealth.delete(name);
      removed.push(name);
    }
  }

  return removed;
}

/**
 * Clear all health state (for testing).
 */
export function clearHealthState() {
  _serviceHealth.clear();
  stopMonitoring();
}
