/**
 * Keyword Signal Detector
 * SD-LEO-ENH-INTELLIGENT-RETROSPECTIVE-TRIGGERS-001
 *
 * Detects learning moments in conversation output through keyword pattern matching.
 * Captures "found the issue", "problem solved", causal chains, and hindsight moments.
 */

/**
 * Signal categories and their associated keyword patterns
 */
export const SIGNAL_PATTERNS = {
  // Root cause discovery signals
  discovery: {
    patterns: [
      /found the issue/i,
      /found the problem/i,
      /root cause/i,
      /the problem was/i,
      /the issue was/i,
      /turns out/i,
      /the real issue/i,
      /discovered that/i,
      /identified the/i,
      /finally found/i
    ],
    weight: 1.0,
    description: 'Root cause discovery moments'
  },

  // Resolution confirmation signals
  resolution: {
    patterns: [
      /problem solved/i,
      /fixed it/i,
      /that resolved/i,
      /that fixed/i,
      /working now/i,
      /issue resolved/i,
      /successfully fixed/i,
      /bug fixed/i
    ],
    weight: 0.9,
    description: 'Problem resolution confirmations'
  },

  // Causal chain signals (5-Whys related)
  causal: {
    patterns: [
      /which caused/i,
      /led to/i,
      /because of/i,
      /resulted in/i,
      /this caused/i,
      /that caused/i,
      /the reason was/i,
      /due to/i
    ],
    weight: 0.8,
    description: 'Causal chain explanations'
  },

  // Hindsight learning signals
  hindsight: {
    patterns: [
      /should have/i,
      /next time/i,
      /didn't realize/i,
      /wish I had/i,
      /lesson learned/i,
      /in hindsight/i,
      /won't make that mistake/i,
      /could have avoided/i
    ],
    weight: 0.85,
    description: 'Hindsight learning moments'
  },

  // Pattern recurrence signals
  recurrence: {
    patterns: [
      /this keeps happening/i,
      /same issue as/i,
      /recurring/i,
      /happened before/i,
      /seen this before/i,
      /same problem/i,
      /pattern here/i,
      /déjà vu/i
    ],
    weight: 0.95,
    description: 'Recurring pattern detection'
  }
};

/**
 * Minimum context length around detected signal (characters)
 */
export const CONTEXT_PADDING = 200;

/**
 * Detect signals in text content
 * @param {string} text - The text to analyze
 * @param {Object} options - Detection options
 * @param {string} options.sessionId - Current session ID
 * @param {string} options.sdId - Associated Strategic Directive ID
 * @returns {Array<Object>} Array of detected signals
 */
export function detectSignals(text, options = {}) {
  const { sessionId = null, sdId = null } = options;
  const signals = [];

  if (!text || typeof text !== 'string') {
    return signals;
  }

  for (const [category, config] of Object.entries(SIGNAL_PATTERNS)) {
    for (const pattern of config.patterns) {
      const matches = text.matchAll(new RegExp(pattern, 'gi'));

      for (const match of matches) {
        const signal = {
          category,
          pattern: pattern.source,
          matchedText: match[0],
          position: match.index,
          context: extractContext(text, match.index, match[0].length),
          weight: config.weight,
          timestamp: new Date().toISOString(),
          sessionId,
          sdId,
          metadata: {
            description: config.description,
            textLength: text.length
          }
        };

        signals.push(signal);
      }
    }
  }

  // Deduplicate overlapping signals
  return deduplicateSignals(signals);
}

/**
 * Extract context around a match position
 * @param {string} text - Full text
 * @param {number} position - Match position
 * @param {number} matchLength - Length of match
 * @returns {string} Extracted context
 */
function extractContext(text, position, matchLength) {
  const start = Math.max(0, position - CONTEXT_PADDING);
  const end = Math.min(text.length, position + matchLength + CONTEXT_PADDING);

  let context = text.slice(start, end);

  // Add ellipsis if truncated
  if (start > 0) context = '...' + context;
  if (end < text.length) context = context + '...';

  return context;
}

/**
 * Deduplicate signals with overlapping contexts
 * @param {Array<Object>} signals - Raw signals
 * @returns {Array<Object>} Deduplicated signals
 */
function deduplicateSignals(signals) {
  if (signals.length <= 1) return signals;

  // Sort by position
  signals.sort((a, b) => a.position - b.position);

  const deduped = [];
  let lastEnd = -1;

  for (const signal of signals) {
    // If this signal overlaps with previous, keep the one with higher weight
    if (signal.position < lastEnd) {
      const prev = deduped[deduped.length - 1];
      if (signal.weight > prev.weight) {
        deduped[deduped.length - 1] = signal;
      }
    } else {
      deduped.push(signal);
    }
    lastEnd = signal.position + signal.matchedText.length;
  }

  return deduped;
}

/**
 * Check if text contains any learning signals
 * @param {string} text - Text to check
 * @returns {boolean} True if signals detected
 */
export function hasSignals(text) {
  for (const config of Object.values(SIGNAL_PATTERNS)) {
    for (const pattern of config.patterns) {
      if (pattern.test(text)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Get all available signal categories
 * @returns {Array<string>} Category names
 */
export function getCategories() {
  return Object.keys(SIGNAL_PATTERNS);
}

/**
 * Get patterns for a specific category
 * @param {string} category - Category name
 * @returns {Object|null} Category configuration
 */
export function getCategoryConfig(category) {
  return SIGNAL_PATTERNS[category] || null;
}

/**
 * Add custom pattern to a category
 * @param {string} category - Category name
 * @param {RegExp} pattern - Pattern to add
 */
export function addPattern(category, pattern) {
  if (SIGNAL_PATTERNS[category]) {
    SIGNAL_PATTERNS[category].patterns.push(pattern);
  }
}
