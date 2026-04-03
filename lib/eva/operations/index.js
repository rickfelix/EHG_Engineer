/**
 * EVA Operations Module — Unified Operations API
 *
 * SD: SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-I
 *
 * Aggregates existing EVA subsystems (health monitor, feedback classifier,
 * metrics collector, enhancement detector) into a single operations status API.
 *
 * @module lib/eva/operations
 */

/**
 * Get aggregated operations status from all EVA subsystems.
 *
 * @param {Object} deps
 * @param {Object} deps.supabase - Supabase client (service role)
 * @param {Object} [deps.logger] - Logger instance
 * @returns {Promise<Object>} Aggregated status from all subsystems
 */
export async function getOperationsStatus(deps = {}) {
  const { supabase, logger = console } = deps;
  const timestamp = new Date().toISOString();

  const results = await Promise.allSettled([
    getHealthStatus(supabase, logger),
    getMetricsStatus(supabase, logger),
    getFeedbackStatus(supabase, logger),
    getEnhancementStatus(supabase, logger),
    getFinancialSyncStatus(supabase, logger),
    getSchedulerStatus(supabase, logger),
  ]);

  const [health, metrics, feedback, enhancements, financial, scheduler] = results.map(
    (r) => (r.status === 'fulfilled' ? r.value : { status: 'error', error: r.reason?.message })
  );

  return {
    timestamp,
    subsystems: { health, metrics, feedback, enhancements, financial, scheduler },
    overall: deriveOverallStatus([health, metrics, feedback, enhancements, financial, scheduler]),
  };
}

/**
 * Get health monitor status.
 */
async function getHealthStatus(supabase, logger) {
  const { getSystemHealth } = await import('../hub-health-monitor.js');
  const systemHealth = getSystemHealth();
  return {
    subsystem: 'health-monitor',
    status: systemHealth.status || 'unknown',
    serviceCount: systemHealth.services?.length || 0,
    lastCheck: systemHealth.lastCheck || null,
  };
}

/**
 * Get metrics collector status (AARRR metrics from recent ventures).
 */
async function getMetricsStatus(supabase, logger) {
  if (!supabase) return { subsystem: 'metrics-collector', status: 'no-client' };

  const { data, error } = await supabase
    .from('eva_scheduler_metrics')
    .select('metric_type, metric_value, created_at')
    .order('created_at', { ascending: false })
    .limit(5);

  return {
    subsystem: 'metrics-collector',
    status: error ? 'error' : 'active',
    recentMetrics: data?.length || 0,
    lastCollected: data?.[0]?.created_at || null,
  };
}

/**
 * Get feedback classifier status.
 */
async function getFeedbackStatus(supabase, logger) {
  if (!supabase) return { subsystem: 'feedback-classifier', status: 'no-client' };

  // feedback_items table does not exist — return unavailable status
  return {
    subsystem: 'feedback-classifier',
    status: 'unavailable',
    last24hItems: 0,
  };
}

/**
 * Get enhancement detector status.
 */
async function getEnhancementStatus(supabase, logger) {
  if (!supabase) return { subsystem: 'enhancement-detector', status: 'no-client' };

  const { data, error } = await supabase
    .from('protocol_improvement_queue')
    .select('id, status')
    .eq('status', 'pending')
    .limit(10);

  return {
    subsystem: 'enhancement-detector',
    status: error ? 'error' : 'active',
    pendingEnhancements: data?.length || 0,
  };
}

/**
 * Get financial sync status.
 */
async function getFinancialSyncStatus(supabase, logger) {
  if (!supabase) return { subsystem: 'financial-sync', status: 'no-client' };

  const { data, error } = await supabase
    .from('venture_financial_contract')
    .select('venture_id, updated_at')
    .order('updated_at', { ascending: false })
    .limit(1);

  return {
    subsystem: 'financial-sync',
    status: error ? 'error' : 'active',
    lastSync: data?.[0]?.updated_at || null,
  };
}

/**
 * Get scheduler status (heartbeat and queue depth).
 */
async function getSchedulerStatus(supabase, logger) {
  if (!supabase) return { subsystem: 'scheduler', status: 'no-client' };

  const { data: heartbeat } = await supabase
    .from('eva_scheduler_heartbeat')
    .select('instance_id, last_heartbeat, status')
    .order('last_heartbeat', { ascending: false })
    .limit(1);

  const { count } = await supabase
    .from('eva_scheduler_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');

  return {
    subsystem: 'scheduler',
    status: heartbeat?.[0]?.status || 'unknown',
    instanceId: heartbeat?.[0]?.instance_id || null,
    lastHeartbeat: heartbeat?.[0]?.last_heartbeat || null,
    pendingJobs: count || 0,
  };
}

/**
 * Derive overall status from subsystem statuses.
 */
function deriveOverallStatus(subsystems) {
  const statuses = subsystems.map((s) => s?.status || 'unknown');
  if (statuses.every((s) => s === 'active' || s === 'healthy')) return 'healthy';
  if (statuses.some((s) => s === 'error' || s === 'unhealthy')) return 'degraded';
  return 'unknown';
}
