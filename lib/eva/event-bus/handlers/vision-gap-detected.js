/**
 * Handler: vision.gap_detected
 * SD: SD-MAN-INFRA-EVENT-BUS-BACKBONE-001
 *
 * Placeholder handler for vision gap detection events.
 * Currently logs the gap for observability; future subscribers
 * can be added via subscribeVisionEvent(VISION_EVENTS.GAP_DETECTED, ...).
 *
 * Payload: { sdKey, dimension, score, threshold, supabase }
 */

import { subscribeVisionEvent, VISION_EVENTS } from '../vision-events.js';

let _registered = false;

/**
 * Register vision.gap_detected subscribers.
 * Idempotent — safe to call multiple times.
 */
export function registerVisionGapDetectedHandlers() {
  if (_registered) return;

  subscribeVisionEvent(VISION_EVENTS.GAP_DETECTED, async ({ sdKey, dimension, score, threshold }) => {
    console.log(`[VisionBus] Gap detected: ${sdKey} dimension=${dimension} score=${score} threshold=${threshold}`);
  });

  _registered = true;
}

/** Reset registration flag (for testing only). */
export function _resetVisionGapDetectedHandlers() {
  _registered = false;
}
