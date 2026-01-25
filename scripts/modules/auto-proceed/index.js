/**
 * Auto-Proceed Module
 * Part of SD-LEO-ENH-AUTO-PROCEED-001-11
 *
 * Provides learning-based queue re-prioritization for AUTO-PROCEED mode.
 *
 * @module auto-proceed
 */

export * from './urgency-scorer.js';
export * from './reprioritization-engine.js';

import urgencyScorer from './urgency-scorer.js';
import reprioritizationEngine from './reprioritization-engine.js';

export default {
  urgencyScorer,
  reprioritizationEngine
};
