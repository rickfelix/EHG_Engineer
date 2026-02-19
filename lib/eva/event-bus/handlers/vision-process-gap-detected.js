/**
 * Handler: vision.process_gap_detected
 * SD: SD-MAN-INFRA-EVENT-BUS-BACKBONE-001
 *
 * Placeholder handler for process gap detection events from
 * process-gap-reporter.mjs. Logs for observability; future
 * subscribers can react to gaps programmatically.
 *
 * Payload: { gapType, description, sdKey?, severity?, supabase }
 */

import { subscribeVisionEvent, VISION_EVENTS } from '../vision-events.js';

let _registered = false;

/**
 * Register vision.process_gap_detected subscribers.
 * Idempotent — safe to call multiple times.
 */
export function registerVisionProcessGapDetectedHandlers() {
  if (_registered) return;

  subscribeVisionEvent(VISION_EVENTS.PROCESS_GAP_DETECTED, async ({ gapType, description, sdKey, severity }) => {
    const sdInfo = sdKey ? ` [${sdKey}]` : '';
    console.log(`[VisionBus] Process gap detected${sdInfo}: type=${gapType} severity=${severity || 'unknown'} — ${description}`);
  });

  _registered = true;
}

/** Reset registration flag (for testing only). */
export function _resetVisionProcessGapDetectedHandlers() {
  _registered = false;
}
