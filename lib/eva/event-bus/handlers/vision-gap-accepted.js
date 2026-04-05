/**
 * Handler: vision.gap_accepted
 * SD: SD-OKR-AUTO-KR-GOV-2-3-001
 *
 * Handles events when a vision gap is accepted (dismissed or wont_fix).
 * Logs for observability and updates the gap status in eva_vision_gaps.
 *
 * Payload: { sdKey, gapId, dimensionId, reason, supabase }
 */

import { subscribeVisionEvent, VISION_EVENTS } from '../vision-events.js';

let _registered = false;

/**
 * Register vision.gap_accepted subscribers.
 * Idempotent — safe to call multiple times.
 */
export function registerVisionGapAcceptedHandlers() {
  if (_registered) return;

  // Subscriber 1: Log for observability
  subscribeVisionEvent(VISION_EVENTS.GAP_ACCEPTED, async ({ sdKey, gapId, dimensionId, reason }) => {
    console.log(`[VisionBus] Gap accepted: sd=${sdKey || '(unknown)'} gap=${gapId || dimensionId} reason=${reason || 'none'}`);
  });

  // Subscriber 2: Update gap status in eva_vision_gaps
  subscribeVisionEvent(VISION_EVENTS.GAP_ACCEPTED, async ({ sdKey, gapId, dimensionId, reason, supabase }) => {
    if (!supabase) return;

    try {
      const filter = supabase
        .from('eva_vision_gaps')
        .update({
          status: 'accepted',
          resolution_notes: reason || 'Accepted via gap_accepted event',
          updated_at: new Date().toISOString(),
        });

      // Match by gapId if available, otherwise by sd_id + dimension_id
      if (gapId) {
        filter.eq('id', gapId);
      } else if (sdKey && dimensionId) {
        filter.eq('sd_id', sdKey).eq('dimension_id', dimensionId);
      } else {
        return; // Cannot identify the gap without identifiers
      }

      const { error } = await filter;
      if (error) {
        console.warn(`[VisionBus] Failed to update gap status: ${error.message}`);
      }
    } catch (err) {
      console.warn(`[VisionBus] eva_vision_gaps accept error: ${err.message}`);
    }
  });

  _registered = true;
}

/** Reset registration flag (for testing only). */
export function _resetVisionGapAcceptedHandlers() {
  _registered = false;
}
