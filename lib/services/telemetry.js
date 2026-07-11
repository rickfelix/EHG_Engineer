import { randomUUID } from 'crypto';

/**
 * Service Telemetry — EHG Venture Factory
 * SD: SD-LEO-ORCH-EHG-VENTURE-FACTORY-001-D
 *
 * Reports service outcomes to service_telemetry table for cross-venture intelligence.
 *
 * PRODUCER CONTRACT (SD-LEO-INFRA-VENTURE-OPS-ACTUALS-001 FR-1): service_telemetry has
 * TWO independent NOT-NULL columns (task_id, service_id) inherited from an earlier
 * task/PR-scoped schema, plus `outcome` (text) and `processing_time_ms` (int) added later
 * specifically for the ops_product_health collector (lib/eva/services/ops-health-monitor.js
 * computeProductHealth, which SELECTs outcome/processing_time_ms filtered on venture_id +
 * reported_at). Before this fix, this function omitted task_id/service_id entirely — every
 * insert violated the NOT-NULL constraints and silently failed (caught, logged, swallowed
 * below), which is why service_telemetry had 0 rows despite this function existing. It also
 * never wrote outcome/processing_time_ms, so even a successful insert would have produced
 * collector-visible nulls (uptime computed as a false 0%, not "no data"). This is the ONE
 * canonical service_telemetry writer for non-task-scoped shared-service events; the single
 * contract test asserting producer/consumer field alignment lives at
 * tests/unit/services/service-telemetry-contract.test.js.
 *
 * @param {object} supabase - Supabase client
 * @param {object} event
 * @param {string} event.service_key - Service identifier (e.g., 'branding'); resolved to
 *   service_id via the ehg_services registry (same pattern as BrandingService.resolveServiceId).
 * @param {string} event.venture_id - UUID of the venture
 * @param {string} event.event_type - Type of event (e.g., 'artifact_generated', 'routing_decision')
 * @param {string} [event.outcome] - 'success' | 'error' | 'failure' — read by the ops_product_health
 *   collector to compute uptime_pct/error_rate. Omit only for events with no pass/fail outcome.
 * @param {number} [event.processing_time_ms] - Duration in ms — read by the collector for p95 latency.
 * @param {string} [event.task_id] - UUID of an associated service_tasks row, if this event is
 *   task-scoped. Generic (non-task) events get a fresh UUID so the NOT-NULL constraint is satisfied
 *   without forcing every caller to invent a task record.
 * @param {number} [event.confidence_score] - Confidence score (0.0-1.0)
 * @param {string} [event.routing_decision] - Routing outcome (auto_approve/review_flagged/draft_only)
 * @param {object} [event.metadata] - Additional event data
 */
export async function reportTelemetry(supabase, event) {
  const {
    service_key, venture_id, event_type, confidence_score, routing_decision, metadata,
    outcome, processing_time_ms, task_id,
  } = event;

  const service_id = await resolveServiceId(supabase, service_key);

  const { error } = await supabase
    .from('service_telemetry')
    .insert({
      task_id: task_id || randomUUID(),
      service_id,
      service_key,
      venture_id,
      event_type,
      outcome: outcome ?? null,
      processing_time_ms: processing_time_ms ?? null,
      confidence_score: confidence_score ?? null,
      routing_decision: routing_decision ?? null,
      metadata: metadata ?? {},
      created_at: new Date().toISOString(),
    });

  if (error) {
    // Telemetry is non-blocking — log but don't throw
    console.warn(`[telemetry] Failed to record event: ${error.message}`);
  }
}

/**
 * Resolve a service_key to its ehg_services.id (NOT NULL FK on service_telemetry).
 * Mirrors BrandingService.resolveServiceId; kept local (no shared cache) since this
 * function has no per-instance state to cache across calls.
 * @returns {Promise<string|null>} service_id, or null if unresolvable (fail-open —
 *   telemetry is non-blocking, a missing/unknown service_key should not throw here;
 *   the insert itself will surface a clear DB error if service_id is truly required).
 */
async function resolveServiceId(supabase, serviceKey) {
  if (!serviceKey) return null;
  try {
    const { data, error } = await supabase
      .from('ehg_services')
      .select('id')
      .eq('service_key', serviceKey)
      .eq('status', 'active')
      .maybeSingle();
    if (error || !data) return null;
    return data.id;
  } catch {
    return null;
  }
}

/**
 * Query telemetry for a venture's service usage.
 * @param {object} supabase - Supabase client
 * @param {string} ventureId - UUID of the venture
 * @param {object} [options]
 * @param {string} [options.serviceKey] - Filter by service
 * @param {number} [options.limit] - Max results (default 50)
 */
export async function getVentureTelemetry(supabase, ventureId, options = {}) {
  const { serviceKey, limit = 50 } = options;

  let query = supabase
    .from('service_telemetry')
    .select('*')
    .eq('venture_id', ventureId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (serviceKey) {
    query = query.eq('service_key', serviceKey);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Telemetry query failed: ${error.message}`);
  return data || [];
}
