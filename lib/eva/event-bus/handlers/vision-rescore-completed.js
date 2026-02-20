/**
 * Handler: vision.rescore_completed
 * SD: SD-CORR-VIS-A05-EVENT-BUS-001
 *
 * Handles events when post-completion rescoring finishes.
 * Logs dimension improvement for tracking.
 *
 * Payload: { sdKey, previousScore, newScore, dimensionDelta, scoreId }
 */

import { subscribeVisionEvent, VISION_EVENTS } from '../vision-events.js';

let _registered = false;

/**
 * Register vision.rescore_completed subscribers.
 * Idempotent — safe to call multiple times.
 */
export function registerVisionRescoreCompletedHandlers() {
  if (_registered) return;

  subscribeVisionEvent(VISION_EVENTS.RESCORE_COMPLETED, async ({ sdKey, previousScore, newScore, dimensionDelta }) => {
    const delta = newScore - previousScore;
    const direction = delta >= 0 ? '+' : '';
    console.log(`[VisionBus] Rescore completed: ${sdKey} score=${previousScore}→${newScore} (${direction}${delta})`);
    if (dimensionDelta && Object.keys(dimensionDelta).length > 0) {
      for (const [dim, change] of Object.entries(dimensionDelta)) {
        const d = change >= 0 ? '+' : '';
        console.log(`  ${dim}: ${d}${change}`);
      }
    }
  });

  _registered = true;
}

/** Reset registration flag (for testing only). */
export function _resetVisionRescoreCompletedHandlers() {
  _registered = false;
}
