/**
 * Signal Aggregator
 * SD-LEO-ENH-INTELLIGENT-RETROSPECTIVE-TRIGGERS-001
 *
 * Aggregates captured signals into retrospective content.
 * Maps signal categories to retrospective fields.
 */

import { getSignalsForSD } from './storage.js';

/**
 * Mapping from signal categories to retrospective fields
 */
export const CATEGORY_TO_FIELD_MAP = {
  discovery: {
    field: 'key_learnings',
    transform: (signal) => `Found: ${signal.matchedText} - ${extractInsight(signal.context)}`
  },
  resolution: {
    field: 'what_went_well',
    transform: (signal) => `Resolved: ${extractInsight(signal.context)}`
  },
  causal: {
    field: 'protocol_improvements',
    transform: (signal) => ({
      category: 'WORKFLOW',
      improvement: `Causal chain identified: ${extractInsight(signal.context)}`,
      evidence: signal.context,
      impact: 'Root cause understanding captured for future prevention',
      affected_phase: null
    })
  },
  hindsight: {
    field: 'what_needs_improvement',
    transform: (signal) => `Lesson: ${extractInsight(signal.context)}`
  },
  recurrence: {
    field: 'action_items',
    transform: (signal) => ({
      text: `Address recurring pattern: ${extractInsight(signal.context)}`,
      category: 'PROCESS_IMPROVEMENT'
    })
  }
};

/**
 * Aggregate signals for an SD into retrospective-ready content
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} options - Aggregation options
 * @returns {Promise<Object>} Aggregated content by retrospective field
 */
export async function aggregateSignalsForRetro(sdId, options = {}) {
  const { deduplicate = true, minWeight = 0.5 } = options;

  // Retrieve all signals for the SD
  const signals = await getSignalsForSD(sdId);

  if (signals.length === 0) {
    return {
      hasSignals: false,
      signalCount: 0,
      content: {},
      metadata: {
        aggregatedAt: new Date().toISOString(),
        source: 'no_signals'
      }
    };
  }

  // Filter by minimum weight
  const filteredSignals = signals.filter(s => s.weight >= minWeight);

  // Deduplicate if requested
  const processedSignals = deduplicate
    ? deduplicateByContext(filteredSignals)
    : filteredSignals;

  // Group by category
  const byCategory = groupSignalsByCategory(processedSignals);

  // Transform to retrospective fields
  const content = {};
  const fieldCounts = {};

  for (const [category, categorySignals] of Object.entries(byCategory)) {
    const mapping = CATEGORY_TO_FIELD_MAP[category];
    if (!mapping) continue;

    const { field, transform } = mapping;

    if (!content[field]) {
      content[field] = [];
      fieldCounts[field] = 0;
    }

    for (const signal of categorySignals) {
      const transformed = transform(signal);
      content[field].push(transformed);
      fieldCounts[field]++;
    }
  }

  return {
    hasSignals: true,
    signalCount: processedSignals.length,
    content,
    fieldCounts,
    metadata: {
      aggregatedAt: new Date().toISOString(),
      source: 'captured_signals',
      originalCount: signals.length,
      afterFiltering: filteredSignals.length,
      afterDedup: processedSignals.length,
      categories: Object.keys(byCategory)
    }
  };
}

/**
 * Merge aggregated signals into existing retrospective data
 * @param {Object} existingRetro - Existing retrospective data
 * @param {Object} aggregated - Aggregated signal content
 * @returns {Object} Merged retrospective data
 */
export function mergeIntoRetrospective(existingRetro, aggregated) {
  if (!aggregated.hasSignals) {
    return {
      ...existingRetro,
      signal_metadata: aggregated.metadata
    };
  }

  const merged = { ...existingRetro };

  for (const [field, items] of Object.entries(aggregated.content)) {
    if (!merged[field]) {
      merged[field] = [];
    }

    // Add signal-derived content, marking source
    for (const item of items) {
      if (typeof item === 'string') {
        // Simple string fields (key_learnings, what_went_well, etc.)
        if (!merged[field].includes(item)) {
          merged[field].push(item);
        }
      } else if (typeof item === 'object') {
        // Complex fields (action_items, protocol_improvements)
        merged[field].push({
          ...item,
          _source: 'captured_signal'
        });
      }
    }
  }

  // Add signal metadata
  merged.signal_metadata = aggregated.metadata;
  merged.signal_authenticity_score = calculateAuthenticityScore(aggregated);

  return merged;
}

/**
 * Calculate authenticity score based on signal quality
 * @param {Object} aggregated - Aggregated data
 * @returns {number} Score 0-100
 */
export function calculateAuthenticityScore(aggregated) {
  if (!aggregated.hasSignals) return 0;

  const baseScore = 50; // Base score for having any signals

  // Bonus for diversity of categories
  const categoryBonus = Math.min(aggregated.metadata.categories.length * 10, 30);

  // Bonus for signal count (diminishing returns)
  const countBonus = Math.min(Math.log2(aggregated.signalCount + 1) * 5, 20);

  return Math.min(baseScore + categoryBonus + countBonus, 100);
}

/**
 * Extract key insight from context
 * @param {string} context - Signal context
 * @returns {string} Extracted insight
 */
function extractInsight(context) {
  if (!context) return 'No context available';

  // Remove ellipsis markers
  let cleaned = context.replace(/^\.{3}|\.{3}$/g, '').trim();

  // Truncate if too long
  if (cleaned.length > 200) {
    cleaned = cleaned.substring(0, 200) + '...';
  }

  return cleaned;
}

/**
 * Deduplicate signals by context similarity
 * @param {Array<Object>} signals - Signals to deduplicate
 * @returns {Array<Object>} Deduplicated signals
 */
function deduplicateByContext(signals) {
  const seen = new Set();
  const deduped = [];

  for (const signal of signals) {
    // Create a simple hash of the context
    const contextHash = simpleHash(signal.context);

    if (!seen.has(contextHash)) {
      seen.add(contextHash);
      deduped.push(signal);
    }
  }

  return deduped;
}

/**
 * Simple string hash for deduplication
 * @param {string} str - String to hash
 * @returns {string} Hash
 */
function simpleHash(str) {
  if (!str) return '';
  // Take first 100 chars, lowercase, remove punctuation
  return str
    .substring(0, 100)
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Group signals by category
 * @param {Array<Object>} signals - Signals to group
 * @returns {Object} Grouped signals
 */
function groupSignalsByCategory(signals) {
  return signals.reduce((acc, signal) => {
    const category = signal.category || 'unknown';
    if (!acc[category]) acc[category] = [];
    acc[category].push(signal);
    return acc;
  }, {});
}

/**
 * Get summary statistics for signals
 * @param {string} sdId - SD ID
 * @returns {Promise<Object>} Statistics
 */
export async function getSignalStats(sdId) {
  const signals = await getSignalsForSD(sdId);

  if (signals.length === 0) {
    return { total: 0, byCategory: {} };
  }

  const byCategory = groupSignalsByCategory(signals);

  return {
    total: signals.length,
    byCategory: Object.fromEntries(
      Object.entries(byCategory).map(([k, v]) => [k, v.length])
    ),
    avgWeight: signals.reduce((sum, s) => sum + s.weight, 0) / signals.length,
    timeRange: {
      earliest: signals.reduce((min, s) =>
        s.timestamp < min ? s.timestamp : min, signals[0].timestamp),
      latest: signals.reduce((max, s) =>
        s.timestamp > max ? s.timestamp : max, signals[0].timestamp)
    }
  };
}
