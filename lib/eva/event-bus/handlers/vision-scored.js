/**
 * Handler: vision.scored
 * SD: SD-MAN-INFRA-EVENT-BUS-BACKBONE-001
 *
 * Fan-out handler that notifies all vision score subscribers when
 * a new score is recorded. Replaces direct calls in vision-scorer.js.
 *
 * Subscribers registered here:
 *   1. Notification orchestrator (email to Chairman)
 *   2. Telegram adapter (Telegram message)
 *
 * Error handling: each subscriber is independent — one failure
 * does not prevent others from executing.
 */

import { subscribeVisionEvent, VISION_EVENTS } from '../vision-events.js';

let _registered = false;

/**
 * Register all vision.scored subscribers.
 * Idempotent — safe to call multiple times; only registers once.
 *
 * Call this once at the start of any process that scores SDs
 * (e.g., vision-scorer.js main(), eva-master-scheduler.js).
 */
export function registerVisionScoredHandlers() {
  if (_registered) return;

  // Subscriber 1: Email notification via notification orchestrator
  subscribeVisionEvent(VISION_EVENTS.SCORED, async ({ supabase, sdKey, sdTitle, totalScore, dimensionScores, scoreId }) => {
    const { sendVisionScoreNotification } = await import('../../../../lib/notifications/orchestrator.js');
    await sendVisionScoreNotification(supabase, { sdKey, sdTitle, totalScore, dimensionScores, scoreId });
  });

  // Subscriber 2: Telegram notification
  subscribeVisionEvent(VISION_EVENTS.SCORED, async ({ supabase, sdKey, sdTitle, totalScore, dimensionScores, scoreId }) => {
    const { sendVisionScoreTelegramNotification } = await import('../../../../lib/notifications/orchestrator.js');
    await sendVisionScoreTelegramNotification(supabase, { sdKey, sdTitle, totalScore, dimensionScores, scoreId });
  });

  _registered = true;
}

/**
 * Reset registration flag (for testing only).
 */
export function _resetVisionScoredHandlers() {
  _registered = false;
}
