/**
 * Handler: feedback.created
 * SD-LEO-INFRA-FIX-RECURRENCE-REWIRING-001 FR-2
 *
 * Runs recurrence detection against freshly-inserted feedback rows so that
 * pattern_recurrence signals are recorded without a caller having to remember
 * to invoke detectRecurrence() manually.
 *
 * KNOWN COVERAGE GAP: this only fires for rows inserted through emitFeedback()/
 * emitFeedbackBatch() (lib/governance/emit-feedback.js). Any caller that writes
 * to the feedback table directly (raw supabase.from('feedback').insert(...))
 * bypasses this handler entirely — detectRecurrence() will not run for those rows.
 *
 * Payload: { feedbackId, supabase }
 */

import { subscribeVisionEvent, VISION_EVENTS } from '../vision-events.js';
import { detectRecurrence } from '../../../learning/outcome-tracker.js';

let _registered = false;

/**
 * Register feedback.created subscribers.
 * Idempotent — safe to call multiple times.
 */
export function registerFeedbackCreatedHandlers() {
  if (_registered) return;

  subscribeVisionEvent(VISION_EVENTS.FEEDBACK_CREATED, async ({ feedbackId, supabase }) => {
    if (!supabase || !feedbackId) return;

    try {
      const result = await detectRecurrence({ supabase, newFeedbackId: feedbackId });
      if (result?.matched) {
        console.log(`[VisionBus] Recurrence detected for feedback ${feedbackId}: matches SD ${result.sdId} (score=${result.matchScore})`);
      }
    } catch (err) {
      console.warn(`[VisionBus] detectRecurrence failed for feedback ${feedbackId}: ${err.message}`);
    }
  });

  _registered = true;
}

/** Reset registration flag (for testing only). */
export function _resetFeedbackCreatedHandlers() {
  _registered = false;
}
