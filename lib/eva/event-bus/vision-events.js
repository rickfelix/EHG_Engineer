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
import { createLogger } from '../../logger.js';

const logger = createLogger('VisionBus');

// Hook observer registry — lightweight bridge for external systems to observe
// vision events without affecting fire-and-forget semantics.
// SD: SD-MAN-ORCH-VISION-ARCHITECTURE-HARDENING-001-C (A05: Vision-Hooks Bridge)
const _hookObservers = [];

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
  /**
   * Emitted when corrective-sd-generator records a finding to feedback (replaces direct SD-emission).
   * Payload: {originSdKey, feedbackId, recorded, scoreId, action, dimensions, label, correctiveClass, sourceGate}
   * SD-LEO-INFRA-CORRECTIVE-FINDING-REDIRECT-001
   */
  CORRECTIVE_FINDING_RECORDED: 'vision.corrective_finding_recorded',
  /**
   * Emitted when corrective-triage CLI promotes a feedback finding to an SD.
   * Payload: {originSdKey, feedbackId, correctiveSdKey, promotedBy}
   * SD-LEO-INFRA-CORRECTIVE-FINDING-REDIRECT-001
   */
  CORRECTIVE_PROMOTED_TO_SD: 'vision.corrective_promoted_to_sd',
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
  /** Emitted when a vision gap is accepted (dismissed/wont_fix) — payload: {sdKey, gapId, dimensionId, reason, supabase} */
  GAP_ACCEPTED: 'vision.gap_accepted',
  /**
   * Emitted when emitFeedback()/emitFeedbackBatch() inserts a new feedback row.
   * Payload: {feedbackId, supabase}
   * SD-LEO-INFRA-FIX-RECURRENCE-REWIRING-001 FR-2
   */
  FEEDBACK_CREATED: 'feedback.created',
};

/**
 * PAT-LES-77572983b741 (SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-148): a subscriber's sync throw or
 * async rejection was previously only console.error'd — invisible in production without active
 * log monitoring, with no structured error event or alerting hook. This pseudo-event-type routes
 * subscriber failures through the SAME hook-observer bridge already built for external systems to
 * observe vision events (registerHookObserver), rather than inventing a second mechanism.
 * Deliberately NOT importing lib/feedback-capture.js's captureError here: that module imports
 * publishVisionEvent from THIS file, so a direct import back would be circular. A consumer that
 * wants real alerting (e.g. captureError) registers a hook observer and filters on this type.
 */
export const SUBSCRIBER_ERROR_EVENT = 'vision.subscriber_error';

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

  // Notify hook observers (fire-and-forget, non-blocking)
  if (_hookObservers.length > 0) {
    for (const observer of _hookObservers) {
      try {
        const result = observer(eventType, payload);
        if (result && typeof result.catch === 'function') {
          result.catch((err) => {
            logger.error('Hook observer error', { eventType, error: err.message });
          });
        }
      } catch (err) {
        logger.error('Hook observer sync error', { eventType, error: err.message });
      }
    }
  }

  if (handlers.length === 0) return;

  for (const handler of handlers) {
    try {
      const result = handler.handlerFn(payload, { supabase: payload?.supabase });
      // If handler returns a promise, catch async errors
      if (result && typeof result.catch === 'function') {
        result.catch((err) => {
          logger.error('Subscriber error', { eventType, handler: handler.name, error: err.message });
          notifySubscriberError(eventType, handler.name, err, payload);
        });
      }
    } catch (err) {
      logger.error('Synchronous subscriber error', { eventType, handler: handler.name, error: err.message });
      notifySubscriberError(eventType, handler.name, err, payload);
    }
  }
}

/**
 * Fan out a subscriber failure to hook observers as a distinct SUBSCRIBER_ERROR_EVENT signal —
 * see that constant's docstring for why this reuses the hook-observer bridge instead of a new
 * mechanism. Fire-and-forget, same isolation guarantees as the success path: an observer that
 * throws or rejects here is caught and logged, never allowed to cascade.
 */
function notifySubscriberError(eventType, handlerName, error, originalPayload) {
  if (_hookObservers.length === 0) return;
  const errorPayload = {
    originalEventType: eventType,
    handlerName,
    error: { name: error?.name, message: error?.message },
    payload: originalPayload,
  };
  for (const observer of _hookObservers) {
    try {
      const result = observer(SUBSCRIBER_ERROR_EVENT, errorPayload);
      if (result && typeof result.catch === 'function') {
        result.catch((obsErr) => {
          logger.error('Hook observer error while reporting subscriber error', { error: obsErr.message });
        });
      }
    } catch (obsErr) {
      logger.error('Hook observer sync error while reporting subscriber error', { error: obsErr.message });
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

/**
 * Register a hook observer for ALL vision events.
 * Hook observers receive (eventType, payload) for every published vision event.
 * They are called fire-and-forget — errors are caught and logged, never cascade.
 * Use this to bridge vision events into external hook/notification systems.
 *
 * SD: SD-MAN-ORCH-VISION-ARCHITECTURE-HARDENING-001-C (A05: Vision-Hooks Bridge)
 *
 * @param {Function} observer - (eventType: string, payload: object) => void|Promise<void>
 */
export function registerHookObserver(observer) {
  if (typeof observer !== 'function') {
    throw new Error('Hook observer must be a function');
  }
  _hookObservers.push(observer);
}

/**
 * Remove all hook observers (for testing/teardown).
 */
export function clearHookObservers() {
  _hookObservers.length = 0;
}

/**
 * Get the number of registered hook observers (for diagnostics).
 * @returns {number}
 */
export function getHookObserverCount() {
  return _hookObservers.length;
}
