/**
 * Retrospective Signals Module
 * SD-LEO-ENH-INTELLIGENT-RETROSPECTIVE-TRIGGERS-001
 *
 * Public API for intelligent retrospective signal capture and aggregation.
 *
 * Two-phase system:
 * 1. Real-time: Capture learning moments during sessions via keyword detection
 * 2. Aggregation: Merge captured signals into retrospectives at generation time
 */

import * as detector from './detector.js';
import * as storage from './storage.js';
import * as aggregator from './aggregator.js';

/**
 * Capture signals from text (convenience function)
 * Combines detection and storage in one call
 *
 * @param {string} text - Text to analyze
 * @param {Object} options - Options
 * @param {string} options.sessionId - Current session ID
 * @param {string} options.sdId - Associated SD ID
 * @returns {Promise<Object>} Capture result
 */
export async function captureSignals(text, options = {}) {
  const { sessionId, sdId } = options;

  // Detect signals
  const signals = detector.detectSignals(text, { sessionId, sdId });

  if (signals.length === 0) {
    return {
      captured: false,
      count: 0,
      signals: []
    };
  }

  // Store signals (non-blocking)
  const ids = await storage.storeSignals(signals);

  return {
    captured: true,
    count: signals.length,
    signalIds: ids,
    categories: [...new Set(signals.map(s => s.category))]
  };
}

/**
 * Check if text contains learning signals (fast check)
 * @param {string} text - Text to check
 * @returns {boolean} True if signals detected
 */
export function hasLearningMoments(text) {
  return detector.hasSignals(text);
}

/**
 * Get aggregated signals for retrospective generation
 * @param {string} sdId - SD ID
 * @param {Object} options - Options
 * @returns {Promise<Object>} Aggregated content
 */
export async function getAggregatedSignals(sdId, options = {}) {
  return aggregator.aggregateSignalsForRetro(sdId, options);
}

/**
 * Merge signals into retrospective data
 * @param {Object} retroData - Existing retrospective data
 * @param {string} sdId - SD ID
 * @returns {Promise<Object>} Enhanced retrospective data
 */
export async function enhanceRetrospective(retroData, sdId) {
  const aggregated = await aggregator.aggregateSignalsForRetro(sdId);
  return aggregator.mergeIntoRetrospective(retroData, aggregated);
}

/**
 * Get signal statistics for an SD
 * @param {string} sdId - SD ID
 * @returns {Promise<Object>} Statistics
 */
export async function getStats(sdId) {
  return aggregator.getSignalStats(sdId);
}

// Re-export submodules for direct access
export { detector, storage, aggregator };

// Re-export constants
export const SIGNAL_PATTERNS = detector.SIGNAL_PATTERNS;
export const CATEGORY_TO_FIELD_MAP = aggregator.CATEGORY_TO_FIELD_MAP;
