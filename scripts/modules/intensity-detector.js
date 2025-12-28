/**
 * Intensity Detector - Refactoring Intensity Level Detection
 *
 * LEO Protocol v4.3.3 Enhancement
 * Extracted from sd-type-classifier.js for Single Responsibility Principle
 *
 * Detects the intensity level (cosmetic/structural/architectural) for refactoring SDs
 * based on keyword analysis of title, description, and scope.
 *
 * @module intensity-detector
 * @version 1.0.0
 */

// Valid intensity levels for refactoring SDs
export const VALID_INTENSITY_LEVELS = ['cosmetic', 'structural', 'architectural'];

// Intensity detection configuration
export const INTENSITY_HINTS = {
  cosmetic: {
    keywords: ['rename', 'format', 'comment', 'typo', 'spacing', 'indent', 'naming', 'style'],
    maxLOC: 50,
    weight: 1.0,
    description: 'Cosmetic: renames, formatting. Refactor Brief only.'
  },
  structural: {
    keywords: ['extract', 'consolidate', 'reorganize', 'move', 'split', 'merge', 'import', 'file'],
    maxLOC: 500,
    weight: 1.2,
    description: 'Structural: extract methods, file reorg. Refactor Brief + E2E.'
  },
  architectural: {
    keywords: ['pattern', 'interface', 'module', 'redesign', 'architecture', 'abstraction', 'layer', 'boundary'],
    maxLOC: null, // No limit
    weight: 1.5,
    description: 'Architectural: pattern changes. Full PRD + REGRESSION required.'
  }
};

/**
 * Detect intensity level for a refactoring Strategic Directive
 *
 * @param {string} title - SD title
 * @param {string} description - SD description
 * @param {Object|Array|string} keyChanges - Key changes or scope information
 * @returns {Object} Detection result with suggestedIntensity, confidence, and reasoning
 */
export function detectIntensity(title, description, keyChanges) {
  // Build text corpus for analysis
  const keyChangesText = typeof keyChanges === 'object'
    ? JSON.stringify(keyChanges || {})
    : String(keyChanges || '');

  const text = `${title || ''} ${description || ''} ${keyChangesText}`.toLowerCase();

  // Default to structural if no keywords match
  let bestMatch = {
    intensity: 'structural',
    confidence: 50,
    keywords: []
  };

  // Analyze each intensity level
  for (const [intensity, config] of Object.entries(INTENSITY_HINTS)) {
    const matchedKeywords = config.keywords.filter(kw => text.includes(kw));

    if (matchedKeywords.length > 0) {
      // Calculate confidence based on keyword matches
      const baseConfidence = Math.min(matchedKeywords.length / 2, 1) * 100;
      const weightedConfidence = Math.min(baseConfidence * config.weight, 100);

      if (weightedConfidence > bestMatch.confidence) {
        bestMatch = {
          intensity,
          confidence: Math.round(weightedConfidence),
          keywords: matchedKeywords
        };
      }
    }
  }

  return {
    suggestedIntensity: bestMatch.intensity,
    confidence: bestMatch.confidence,
    keywords: bestMatch.keywords,
    reasoning: bestMatch.keywords.length > 0
      ? `Matched keywords: ${bestMatch.keywords.join(', ')}`
      : 'No keywords matched (defaulting to structural)',
    intensityHint: INTENSITY_HINTS[bestMatch.intensity]
  };
}

/**
 * Detect intensity level for a Strategic Directive object
 * Wrapper for detectIntensity that handles SD object structure
 *
 * @param {Object} sd - Strategic directive object
 * @param {string} sd.title - SD title
 * @param {string} sd.description - SD description
 * @param {Object} sd.scope - SD scope
 * @param {string} sd.sd_type - SD type
 * @param {string} sd.intensity_level - Current intensity level if set
 * @returns {Object} Detection result
 */
export function detectIntensityForSD(sd) {
  // Only applicable to refactor SDs
  if (sd.sd_type !== 'refactor') {
    return {
      applicable: false,
      reason: 'Intensity detection only applies to refactor SDs'
    };
  }

  const result = detectIntensity(sd.title, sd.description, sd.scope);

  return {
    applicable: true,
    ...result,
    recommendation: sd.intensity_level
      ? `Current: ${sd.intensity_level}, Suggested: ${result.suggestedIntensity}`
      : `Set intensity_level to '${result.suggestedIntensity}' (REQUIRED for refactor SDs)`
  };
}

/**
 * Validate that an intensity level is valid
 *
 * @param {string} intensity - Intensity level to validate
 * @returns {boolean} True if valid
 */
export function isValidIntensityLevel(intensity) {
  return VALID_INTENSITY_LEVELS.includes(intensity);
}

/**
 * Get intensity configuration for a given level
 *
 * @param {string} intensity - Intensity level
 * @returns {Object|null} Configuration or null if invalid
 */
export function getIntensityConfig(intensity) {
  return INTENSITY_HINTS[intensity] || null;
}

// Default export for convenience
export default {
  detectIntensity,
  detectIntensityForSD,
  isValidIntensityLevel,
  getIntensityConfig,
  VALID_INTENSITY_LEVELS,
  INTENSITY_HINTS
};
