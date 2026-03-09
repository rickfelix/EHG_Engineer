/**
 * Service Telemetry — EHG Venture Factory
 * SD: SD-LEO-ORCH-EHG-VENTURE-FACTORY-001-D
 *
 * Reports service outcomes to service_telemetry table for cross-venture intelligence.
 */

/**
 * Report a telemetry event to the service_telemetry table.
 * @param {object} supabase - Supabase client
 * @param {object} event
 * @param {string} event.service_key - Service identifier (e.g., 'branding')
 * @param {string} event.venture_id - UUID of the venture
 * @param {string} event.event_type - Type of event (e.g., 'artifact_generated', 'routing_decision')
 * @param {number} [event.confidence_score] - Confidence score (0.0-1.0)
 * @param {string} [event.routing_decision] - Routing outcome (auto_approve/review_flagged/draft_only)
 * @param {object} [event.metadata] - Additional event data
 */
export async function reportTelemetry(supabase, event) {
  const { service_key, venture_id, event_type, confidence_score, routing_decision, metadata } = event;

  const { error } = await supabase
    .from('service_telemetry')
    .insert({
      service_key,
      venture_id,
      event_type,
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
