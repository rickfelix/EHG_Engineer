/**
 * Vision Event Bus — Lightweight Pub/Sub for Vision Governance Events
 * SD: SD-MAN-INFRA-EVENT-BUS-BACKBONE-001
 *
 * Extends the existing EVA event bus infrastructure with a simple
 * Node.js EventEmitter for in-process vision events. Designed for:
 * - Zero external dependencies (stdlib only)
 * - Multiple subscribers per event type (unlike handler-registry.js)
 * - Fail-safe: subscriber errors are caught and logged, never cascade
 * - No database ledger required (vision events are fire-and-forget)
 *
 * Usage:
 *   import { publishVisionEvent, subscribeVisionEvent, VISION_EVENTS } from './vision-events.js';
 *
 *   // Subscribe (call once at startup/initialization)
 *   subscribeVisionEvent(VISION_EVENTS.SCORED, async ({ sdKey, totalScore, supabase }) => {
 *     await sendNotification(supabase, sdKey, totalScore);
 *   });
 *
 *   // Publish (in vision-scorer.js, vision-to-patterns.js, etc.)
 *   publishVisionEvent(VISION_EVENTS.SCORED, { sdKey, totalScore, supabase });
 */

import { EventEmitter } from 'events';

const _bus = new EventEmitter();
// Allow up to 20 listeners per event type (notifications + future subscribers)
_bus.setMaxListeners(20);

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
};

/**
 * Publish a vision event to all registered subscribers.
 * Errors thrown by synchronous listeners are caught and logged.
 * Asynchronous listeners run independently — use subscribeVisionEvent()
 * for async handlers (it wraps them with error handling).
 *
 * @param {string} eventType - One of VISION_EVENTS values
 * @param {object} payload - Event-specific data (include supabase client for DB-aware handlers)
 */
export function publishVisionEvent(eventType, payload) {
  try {
    _bus.emit(eventType, payload);
  } catch (err) {
    // Catch synchronous listener errors (async errors are caught in subscribeVisionEvent)
    console.error(`[VisionBus] Synchronous error publishing ${eventType}: ${err.message}`);
  }
}

/**
 * Subscribe a handler to a vision event type.
 * Handler errors are caught and logged — they never cascade to the publisher.
 * Multiple handlers per event type are supported (unlike handler-registry.js).
 *
 * @param {string} eventType - One of VISION_EVENTS values
 * @param {Function} handler - async (payload) => void
 */
export function subscribeVisionEvent(eventType, handler) {
  _bus.on(eventType, async (payload) => {
    try {
      await handler(payload);
    } catch (err) {
      console.error(`[VisionBus] Subscriber error for ${eventType}: ${err.message}`);
    }
  });
}

/**
 * Remove all subscribers for all vision event types (for testing/teardown).
 */
export function clearVisionSubscribers() {
  _bus.removeAllListeners();
}

/**
 * Get the number of subscribers for a given event type (for diagnostics).
 * @param {string} eventType
 * @returns {number}
 */
export function getSubscriberCount(eventType) {
  return _bus.listenerCount(eventType);
}
