/**
 * Handler: vision.corrective_sd_created
 * SD: SD-CORR-VIS-A05-EVENT-BUS-001
 *
 * Handles events when corrective SDs are generated from vision scoring gaps.
 * Logs for observability and tracks corrective actions.
 *
 * Payload: { originSdKey, correctiveSdKey, scoreId, action, dimensions, label }
 */

import { subscribeVisionEvent, VISION_EVENTS } from '../vision-events.js';

let _registered = false;

/**
 * Register vision.corrective_sd_created subscribers.
 * Idempotent — safe to call multiple times.
 */
export function registerVisionCorrectiveSdCreatedHandlers() {
  if (_registered) return;

  subscribeVisionEvent(VISION_EVENTS.CORRECTIVE_SD_CREATED, async ({ originSdKey, correctiveSdKey, action, dimensions, label }) => {
    const origin = originSdKey || '(portfolio-level)';
    const dims = (dimensions || []).join(', ');
    console.log(`[VisionBus] Corrective SD created: ${correctiveSdKey} from ${origin} (action=${action}, dims=${dims}, label=${label})`);
  });

  _registered = true;
}

/** Reset registration flag (for testing only). */
export function _resetVisionCorrectiveSdCreatedHandlers() {
  _registered = false;
}
