/**
 * Error Detection
 * Part of SD-LEO-REFAC-ERR-PATTERN-004
 *
 * Functions for detecting and classifying errors.
 */

import { ERROR_CATEGORIES, SEVERITY_LEVELS } from './constants.js';
import { ERROR_PATTERNS } from './patterns/index.js';

/**
 * Calculate confidence score for error pattern match
 * @param {string} errorMessage - The error message
 * @param {object} pattern - The matched pattern
 * @returns {number} Confidence score (0-100)
 */
function calculateConfidence(errorMessage, pattern) {
  let confidence = 70; // Base confidence for pattern match

  // Increase confidence if multiple keywords match
  const keywords = pattern.patterns
    .map(p => p.source.replace(/[^a-z]/gi, ' ').split(/\s+/).filter(k => k.length > 3))
    .flat();
  const matchedKeywords = keywords.filter(k => new RegExp(k, 'i').test(errorMessage));
  confidence += Math.min(matchedKeywords.length * 5, 20);

  // Higher confidence for CRITICAL errors (assume pattern is more specific)
  if (pattern.severity === SEVERITY_LEVELS.CRITICAL) {
    confidence += 10;
  }

  return Math.min(confidence, 100);
}

/**
 * Detect error pattern from error message and context
 * @param {string} errorMessage - The error message or stack trace
 * @param {object} context - Additional context (file, line, stack, etc.)
 * @returns {object|null} Error pattern match with metadata
 */
export function detectError(errorMessage, context = {}) {
  if (!errorMessage || typeof errorMessage !== 'string') {
    return null;
  }

  // Try to match against all error patterns
  for (const pattern of ERROR_PATTERNS) {
    for (const regex of pattern.patterns) {
      if (regex.test(errorMessage)) {
        return {
          ...pattern,
          matchedPattern: regex.source,
          errorMessage,
          context,
          timestamp: new Date().toISOString(),
          confidence: calculateConfidence(errorMessage, pattern)
        };
      }
    }
  }

  // No specific pattern matched - return generic error
  return {
    id: 'UNKNOWN_ERROR',
    category: ERROR_CATEGORIES.RUNTIME,
    severity: SEVERITY_LEVELS.MEDIUM,
    patterns: [],
    subAgents: ['VALIDATION'],
    diagnosis: ['Review error message and stack trace', 'Check recent code changes'],
    autoRecovery: false,
    errorMessage,
    context,
    timestamp: new Date().toISOString(),
    confidence: 30
  };
}

// Export calculateConfidence for testing
export { calculateConfidence };
