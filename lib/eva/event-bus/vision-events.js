/**
 * Vision Event Bus — Backward-Compatible Wrapper over Unified Handler Registry
 * SD: SD-EHG-ORCH-FOUNDATION-CLEANUP-001-D (merged from SD-MAN-INFRA-EVENT-BUS-BACKBONE-001)
 *
 * Previously used a standalone Node.js EventEmitter. Now delegates to the
 * unified handler-registry.js so that ALL event handlers (EVA + Vision) live
 * in one registry. Fire-and-forget semantics are preserved — errors are caught
 * per handler and never cascade to the publisher.
 *
 * Public API is unchanged — existing callers of publishVisionEvent(),
 * subscribeVisionEvent(), etc. continue to work without modification.
 *
 * Usage:
 *   import { publishVisionEvent, subscribeVisionEvent, VISION_EVENTS } from './vision-events.js';
 *
 *   subscribeVisionEvent(VISION_EVENTS.SCORED, async ({ sdKey, totalScore, supabase }) => {
 *     await sendNotification(supabase, sdKey, totalScore);
 *   });
 *
 *   publishVisionEvent(VISION_EVENTS.SCORED, { sdKey, totalScore, supabase });
 */

import { registerHandler, getHandlers, clearHandlers } from './handler-registry.js';

/**
 * Canonical vision event type names.
 */
export const VISION_EVENTS = {
  /** Emitted when scoreSD() completes successfully — payload: {sdKey, sdTitle, totalScore, dimensionScores, scoreId, supabase} */
  SCORED: 'vision.scored',
  /** Emitted when vision-to-patterns detects a dimension gap — payload: {sdKey, dimension, score, supabase} */
  GAP_DETECTED: 'vision.gap_detected',
  /** Emitted when scoreSD() generates a corrective SD — payload: {originSdKey, correctedSdKey, supabase} */
  CORRECTIVE_SD_CREATED: 'vision.corrective_sd_created',
  /** Emitted when process-gap-reporter detects a process gap — payload: {gapType, description, supabase} */
  PROCESS_GAP_DETECTED: 'vision.process_gap_detected',
  /**
   * Emitted when resolveLearningItems() resolves issue_patterns via /learn workflow.
   * Payload: {sdKey, resolvedPatternIds, resolvedCount}
   * Use to trigger memory pruning, metrics, or dashboard updates.
   * SD-LEO-INFRA-MEMORY-PATTERN-LIFECYCLE-001
   */
  PATTERN_RESOLVED: 'leo.pattern_resolved',
  /** Emitted when post-completion rescoring finishes — payload: {sdKey, previousScore, newScore, dimensionDelta, scoreId} */
  RESCORE_COMPLETED: 'vision.rescore_completed',
  /** Emitted when feedback is classified against vision dimensions — payload: {feedbackId, title, dimensionMatches, rubricScore, supabase} */
  FEEDBACK_QUALITY_UPDATED: 'feedback.quality_updated',
};

/**
 * Publish a vision event to all registered handlers.
 * Handlers are executed in registration order. Errors are caught and logged
 * per handler — they never cascade to the publisher (fire-and-forget).
 *
 * @param {string} eventType - One of VISION_EVENTS values
 * @param {object} payload - Event-specific data (include supabase client for DB-aware handlers)
 */
export function publishVisionEvent(eventType, payload) {
  const handlers = getHandlers(eventType);
  if (handlers.length === 0) return;

  for (const handler of handlers) {
    try {
      const result = handler.handlerFn(payload, { supabase: payload?.supabase });
      // If handler returns a promise, catch async errors
      if (result && typeof result.catch === 'function') {
        result.catch((err) => {
          console.error(`[VisionBus] Subscriber error for ${eventType} (${handler.name}): ${err.message}`);
        });
      }
    } catch (err) {
      console.error(`[VisionBus] Synchronous error for ${eventType} (${handler.name}): ${err.message}`);
    }
  }
}

/**
 * Subscribe a handler to a vision event type.
 * Delegates to the unified handler registry (multi-handler, append mode).
 * Handler errors are caught by publishVisionEvent — they never cascade.
 *
 * @param {string} eventType - One of VISION_EVENTS values
 * @param {Function} handler - async (payload) => void
 */
export function subscribeVisionEvent(eventType, handler) {
  registerHandler(eventType, handler, {
    name: handler.name || `vision-subscriber-${eventType}`,
    retryable: false,
    maxRetries: 1,
  });
}

/**
 * Remove all subscribers for all vision event types (for testing/teardown).
 * Note: In the unified model this clears the entire registry. Tests should
 * re-register any EVA handlers needed after calling this.
 */
export function clearVisionSubscribers() {
  clearHandlers();
}

/**
 * Get the number of subscribers for a given event type (for diagnostics).
 * @param {string} eventType
 * @returns {number}
 */
export function getSubscriberCount(eventType) {
  return getHandlers(eventType).length;
}
