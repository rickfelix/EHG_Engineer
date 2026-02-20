/**
 * Handler: vision.gap_detected
 * SD: SD-CORR-VIS-A05-EVENT-BUS-001
 *
 * Writes detected vision gaps to the eva_vision_gaps table for tracking
 * and triggers downstream corrective workflows.
 *
 * Payload: { sdKey, dimension, dimId, score, threshold, scoreId, supabase }
 */

import { subscribeVisionEvent, VISION_EVENTS } from '../vision-events.js';

let _registered = false;

/**
 * Register vision.gap_detected subscribers.
 * Idempotent — safe to call multiple times.
 */
export function registerVisionGapDetectedHandlers() {
  if (_registered) return;

  // Subscriber 1: Log for observability
  subscribeVisionEvent(VISION_EVENTS.GAP_DETECTED, async ({ sdKey, dimension, score, threshold }) => {
    console.log(`[VisionBus] Gap detected: ${sdKey} dimension=${dimension} score=${score} threshold=${threshold}`);
  });

  // Subscriber 2: Write gap to eva_vision_gaps table
  subscribeVisionEvent(VISION_EVENTS.GAP_DETECTED, async ({ sdKey, dimension, dimId, score, threshold, scoreId, supabase }) => {
    if (!supabase) return;
    try {
      const { error } = await supabase
        .from('eva_vision_gaps')
        .upsert({
          sd_id: sdKey,
          dimension_id: dimId || dimension,
          dimension_name: dimension,
          score,
          threshold,
          score_id: scoreId || null,
          status: 'open',
          detected_at: new Date().toISOString(),
        }, { onConflict: 'sd_id,dimension_id', ignoreDuplicates: false });

      if (error) {
        console.warn(`[VisionBus] Failed to write gap to eva_vision_gaps: ${error.message}`);
      }
    } catch (err) {
      console.warn(`[VisionBus] eva_vision_gaps write error: ${err.message}`);
    }
  });

  _registered = true;
}

/** Reset registration flag (for testing only). */
export function _resetVisionGapDetectedHandlers() {
  _registered = false;
}
