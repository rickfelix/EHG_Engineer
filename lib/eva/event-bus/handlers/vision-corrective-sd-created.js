/**
 * Handler: vision.corrective_sd_created
 * SD: SD-EHG-ORCH-INTELLIGENCE-INTEGRATION-001-D (US-002)
 *
 * Handles events when corrective SDs are generated from vision scoring gaps.
 * Logs for observability and links corrective SDs to their source vision gaps.
 *
 * Payload: { originSdKey, correctiveSdKey, scoreId, action, dimensions, label, supabase }
 */

import { subscribeVisionEvent, VISION_EVENTS } from '../vision-events.js';

let _registered = false;

/**
 * Register vision.corrective_sd_created subscribers.
 * Idempotent — safe to call multiple times.
 */
export function registerVisionCorrectiveSdCreatedHandlers() {
  if (_registered) return;

  // Subscriber 1: Log for observability
  subscribeVisionEvent(VISION_EVENTS.CORRECTIVE_SD_CREATED, async ({ originSdKey, correctiveSdKey, action, dimensions, label }) => {
    const origin = originSdKey || '(portfolio-level)';
    const dims = (dimensions || []).join(', ');
    console.log(`[VisionBus] Corrective SD created: ${correctiveSdKey} from ${origin} (action=${action}, dims=${dims}, label=${label})`);
  });

  // Subscriber 2: Link corrective SD to vision gaps in eva_vision_gaps
  subscribeVisionEvent(VISION_EVENTS.CORRECTIVE_SD_CREATED, async ({ originSdKey, correctiveSdKey, dimensions, supabase }) => {
    if (!supabase) return;
    if (!dimensions || dimensions.length === 0) return;

    try {
      const { error } = await supabase
        .from('eva_vision_gaps')
        .update({
          corrective_sd_key: correctiveSdKey,
          status: 'in_progress',
          updated_at: new Date().toISOString(),
        })
        .eq('sd_id', originSdKey || '')
        .in('dimension_id', dimensions)
        .eq('status', 'open');

      if (error) {
        console.warn(`[VisionBus] Failed to link corrective SD to gaps: ${error.message}`);
      }
    } catch (err) {
      console.warn(`[VisionBus] eva_vision_gaps link error: ${err.message}`);
    }
  });

  _registered = true;
}

/** Reset registration flag (for testing only). */
export function _resetVisionCorrectiveSdCreatedHandlers() {
  _registered = false;
}
