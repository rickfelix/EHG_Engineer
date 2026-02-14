/**
 * Escalation Event Persister
 * SD-EVA-FEAT-DFE-PRESENTATION-001 (US-003)
 *
 * Persists DFE escalation events to eva_orchestration_events table
 * with full trigger context, mitigations, and venture info.
 *
 * Design principles:
 *   - Uses Supabase service_role client for writes
 *   - Sets chairman_flagged based on recommendation type
 *   - Includes both escalation and auto-proceed events for audit trail
 *   - Throws on errors (does not silently swallow)
 */

import { ServiceError } from './shared-services.js';
import { transformForPresentation } from './dfe-context-adapter.js';
import { generateForEscalation } from './mitigation-generator.js';

/**
 * Persist a DFE escalation event to eva_orchestration_events.
 *
 * @param {object} supabase - Supabase client (service_role)
 * @param {object} params
 * @param {object} params.dfeResult - Output from evaluateDecision()
 * @param {string} params.ventureId - Venture UUID
 * @param {string} [params.ventureName] - Venture display name
 * @param {number} [params.stageNumber] - Current lifecycle stage number
 * @param {string} [params.eventSource] - Source identifier (default: 'decision_filter_engine')
 * @returns {Promise<{ eventId: string }>} The inserted event's ID
 * @throws {Error} If Supabase insert fails
 */
export async function persistEscalationEvent(supabase, {
  dfeResult,
  ventureId,
  ventureName = null,
  stageNumber = null,
  eventSource = 'decision_filter_engine',
} = {}) {
  if (!supabase) throw new ServiceError('INVALID_ARGS', 'supabase client is required', 'EscalationEventPersister');
  if (!dfeResult) throw new ServiceError('INVALID_ARGS', 'dfeResult is required', 'EscalationEventPersister');

  const presentation = transformForPresentation(dfeResult, {
    ventureId,
    ventureName,
    stageNumber,
  });

  const mitigations = generateForEscalation(dfeResult);

  const isEscalation = dfeResult.recommendation !== 'AUTO_PROCEED';

  const eventData = {
    triggers: presentation.triggers,
    mitigations: mitigations.byTrigger,
    combinedPriority: mitigations.combinedPriority,
    recommendation: dfeResult.recommendation,
    auto_proceed: dfeResult.auto_proceed,
    venture_name: ventureName,
    stage_number: stageNumber,
    trigger_count: presentation.triggerCount,
    max_severity_score: presentation.maxSeverityScore,
  };

  const { data, error } = await supabase
    .from('eva_orchestration_events')
    .insert({
      event_type: 'dfe_triggered',
      event_source: eventSource,
      venture_id: ventureId || null,
      event_data: eventData,
      chairman_flagged: isEscalation,
    })
    .select('event_id')
    .single();

  if (error) {
    throw new ServiceError('EVENT_PERSIST_FAILED', `Failed to persist escalation event: ${error.message}`, 'EscalationEventPersister');
  }

  return { eventId: data.event_id };
}
