/**
 * Adaptive Threshold Calculator
 *
 * Calculates intelligent, context-aware thresholds for validation gates (70-100%, no cap).
 *
 * Factors:
 * - Risk level: LOW=70%, MEDIUM=80%, HIGH=90%, CRITICAL=95%
 * - Performance: ±5% based on prior gate scores
 * - Pattern maturity: +5% after 10 SDs with pattern
 * - Special cases: Production min 90%, Security min 95%
 *
 * @module adaptive-threshold-calculator
 */

/**
 * Base threshold by risk level
 */
const BASE_THRESHOLDS = {
  LOW: 70,      // Standard features, proven patterns
  MEDIUM: 80,   // New features, moderate complexity
  HIGH: 90,     // Critical systems, production changes
  CRITICAL: 95  // Security, data integrity, compliance
};

/**
 * Special case minimum thresholds (cannot go below these)
 */
const SPECIAL_MINIMUMS = {
  PRODUCTION: 90,
  SECURITY: 95,
  DATA_INTEGRITY: 95,
  COMPLIANCE: 95,
  EMERGENCY_HOTFIX: 100
};

/**
 * Get base threshold from SD risk level
 *
 * @param {Object} sd - Strategic directive record
 * @returns {number} Base threshold (70-95)
 */
function getBaseThreshold(sd) {
  // Check for risk assessment (can be direct column or in metadata)
  const riskLevel = (sd.risk_level || sd.metadata?.risk_level || 'MEDIUM').toUpperCase();

  return BASE_THRESHOLDS[riskLevel] || BASE_THRESHOLDS.MEDIUM;
}

/**
 * Calculate performance modifier based on prior gate scores
 *
 * Strong prior gates → easier threshold (-5%)
 * Weak prior gates → harder threshold (+5%)
 *
 * @param {Array} priorGateScores - Array of prior gate scores [gate1Score, gate2Score, ...]
 * @returns {number} Performance modifier (-5 to +5)
 */
function getPerformanceModifier(priorGateScores) {
  if (!priorGateScores || priorGateScores.length === 0) {
    return 0; // No prior gates, no modifier
  }

  const validScores = priorGateScores.filter(score => score !== null && score !== undefined);

  if (validScores.length === 0) {
    return 0;
  }

  const average = validScores.reduce((sum, score) => sum + score, 0) / validScores.length;

  // Strong performance (≥90%) → make it easier (-5%)
  if (average >= 90) {
    return -5;
  }

  // Weak performance (<75%) → make it harder (+5%)
  if (average < 75) {
    return 5;
  }

  // Average performance → no modifier
  return 0;
}

/**
 * Calculate pattern maturity modifier
 *
 * After 10 SDs with this pattern → raise bar (+5%)
 *
 * @param {Object} patternStats - Pattern statistics { sdCount, avgROI }
 * @returns {number} Maturity modifier (0 to +5)
 */
function getMaturityModifier(patternStats) {
  if (!patternStats || !patternStats.sdCount) {
    return 0;
  }

  const { sdCount, avgROI } = patternStats;

  // After 10 SDs with strong ROI (>85%), raise the bar
  if (sdCount > 10 && avgROI > 85) {
    return 5;
  }

  return 0;
}

/**
 * Apply special case minimum thresholds
 *
 * @param {Object} sd - Strategic directive record
 * @param {number} calculatedThreshold - Calculated threshold before special cases
 * @returns {number} Final threshold with special case minimums applied
 */
function applySpecialCaseMinimums(sd, calculatedThreshold) {
  let threshold = calculatedThreshold;

  // Check category for special cases (handle both direct and metadata.categories)
  const directCategories = Array.isArray(sd.category) ? sd.category : [sd.category];
  const metadataCategories = sd.metadata?.categories || [];
  const allCategories = [...directCategories, ...metadataCategories];
  const categoriesLower = allCategories.map(c => c?.toLowerCase() || '');

  // Production deployment (check both direct and metadata)
  if (sd.is_production_deployment || sd.metadata?.is_production_deployment || categoriesLower.includes('production')) {
    threshold = Math.max(threshold, SPECIAL_MINIMUMS.PRODUCTION);
  }

  // Security changes
  if (categoriesLower.includes('security') || categoriesLower.includes('authentication')) {
    threshold = Math.max(threshold, SPECIAL_MINIMUMS.SECURITY);
  }

  // Data integrity / database schema
  if (categoriesLower.includes('database') && (sd.complexity === 'CRITICAL' || sd.metadata?.complexity === 'CRITICAL')) {
    threshold = Math.max(threshold, SPECIAL_MINIMUMS.DATA_INTEGRITY);
  }

  // Compliance / legal
  if (categoriesLower.includes('compliance') || categoriesLower.includes('legal')) {
    threshold = Math.max(threshold, SPECIAL_MINIMUMS.COMPLIANCE);
  }

  // Emergency hotfix (check both direct and metadata)
  if (sd.is_emergency_hotfix || sd.metadata?.is_emergency_hotfix || sd.title?.toLowerCase().includes('hotfix')) {
    threshold = Math.max(threshold, SPECIAL_MINIMUMS.EMERGENCY_HOTFIX);
  }

  return threshold;
}

/**
 * Calculate adaptive threshold for a validation gate
 *
 * @param {Object} options - Calculation options
 * @param {Object} options.sd - Strategic directive record
 * @param {Array} options.priorGateScores - Prior gate scores for this SD
 * @param {Object} options.patternStats - Pattern statistics { sdCount, avgROI }
 * @param {number} options.gateNumber - Gate number (1-4)
 * @returns {Object} Threshold calculation result
 */
export function calculateAdaptiveThreshold(options) {
  const { sd, priorGateScores = [], patternStats = null, gateNumber = 1 } = options;

  // Step 1: Get base threshold from risk level
  const baseThreshold = getBaseThreshold(sd);

  // Step 2: Calculate performance modifier
  const performanceMod = getPerformanceModifier(priorGateScores);

  // Step 3: Calculate maturity modifier
  const maturityMod = getMaturityModifier(patternStats);

  // Step 4: Calculate raw threshold
  const rawThreshold = baseThreshold + performanceMod + maturityMod;

  // Step 5: Apply special case minimums
  const thresholdWithSpecialCases = applySpecialCaseMinimums(sd, rawThreshold);

  // Step 6: Cap at 100% (no artificial cap at 95%, can require 100%)
  const finalThreshold = Math.min(100, thresholdWithSpecialCases);

  return {
    finalThreshold,
    breakdown: {
      baseThreshold,
      performanceMod,
      maturityMod,
      rawThreshold,
      specialCaseApplied: thresholdWithSpecialCases > rawThreshold,
      specialCaseMinimum: thresholdWithSpecialCases > rawThreshold ? thresholdWithSpecialCases : null
    },
    reasoning: generateReasoningText({
      sd,
      baseThreshold,
      performanceMod,
      maturityMod,
      finalThreshold,
      gateNumber
    })
  };
}

/**
 * Generate human-readable reasoning for threshold calculation
 *
 * @param {Object} params - Reasoning parameters
 * @returns {string} Reasoning text
 */
function generateReasoningText(params) {
  const { sd, baseThreshold, performanceMod, maturityMod, finalThreshold, gateNumber } = params;

  const parts = [];

  // Base threshold reason
  const riskLevel = sd.risk_level?.toUpperCase() || 'MEDIUM';
  parts.push(`Base threshold ${baseThreshold}% (${riskLevel} risk)`);

  // Performance modifier reason
  if (performanceMod !== 0) {
    const direction = performanceMod > 0 ? 'increased' : 'decreased';
    const reason = performanceMod > 0 ? 'weak prior gates' : 'strong prior gates';
    parts.push(`${direction} by ${Math.abs(performanceMod)}% due to ${reason}`);
  }

  // Maturity modifier reason
  if (maturityMod !== 0) {
    parts.push(`increased by ${maturityMod}% due to pattern maturity (>10 SDs)`);
  }

  // Special case reason
  const categories = Array.isArray(sd.category) ? sd.category : [sd.category];
  const categoriesLower = categories.map(c => c?.toLowerCase() || '');

  if (sd.is_production_deployment || categoriesLower.includes('production')) {
    parts.push('minimum 90% for production deployment');
  }

  if (categoriesLower.includes('security')) {
    parts.push('minimum 95% for security changes');
  }

  if (sd.is_emergency_hotfix) {
    parts.push('100% required for emergency hotfix');
  }

  return `Gate ${gateNumber} threshold: ${parts.join(', ')}. Final: ${finalThreshold}%`;
}

/**
 * Check if gate passed with adaptive threshold
 *
 * @param {number} score - Gate score (0-100)
 * @param {Object} thresholdResult - Result from calculateAdaptiveThreshold()
 * @returns {Object} Pass/fail result with details
 */
export function checkGatePassed(score, thresholdResult) {
  const { finalThreshold, reasoning } = thresholdResult;
  const passed = score >= finalThreshold;
  const margin = score - finalThreshold;

  return {
    passed,
    score,
    threshold: finalThreshold,
    margin,
    reasoning,
    status: passed ? 'PASS' : 'FAIL',
    message: passed
      ? `Gate passed: ${score}/${finalThreshold} (margin: +${margin.toFixed(1)}%)`
      : `Gate failed: ${score}/${finalThreshold} (shortfall: ${margin.toFixed(1)}%)`
  };
}

/**
 * Get recommended threshold for a given scenario (for testing/simulation)
 *
 * @param {string} scenario - Scenario name
 * @returns {number} Recommended threshold
 */
export function getRecommendedThreshold(scenario) {
  const scenarios = {
    'standard-feature': 70,
    'new-feature': 80,
    'database-migration': 90,
    'production-change': 90,
    'security-update': 95,
    'emergency-hotfix': 100
  };

  return scenarios[scenario] || 80;
}

/**
 * Validate threshold calculation inputs
 *
 * @param {Object} options - Calculation options
 * @returns {Object} Validation result
 */
export function validateThresholdInputs(options) {
  const errors = [];

  if (!options.sd) {
    errors.push('Missing required parameter: sd (strategic directive)');
  }

  if (options.gateNumber && (options.gateNumber < 1 || options.gateNumber > 4)) {
    errors.push('Invalid gateNumber: must be 1-4');
  }

  if (options.priorGateScores) {
    const invalidScores = options.priorGateScores.filter(
      score => score !== null && score !== undefined && (score < 0 || score > 100)
    );
    if (invalidScores.length > 0) {
      errors.push(`Invalid prior gate scores: must be 0-100 (found: ${invalidScores.join(', ')})`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
