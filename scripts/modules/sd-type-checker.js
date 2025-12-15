/**
 * SD Type Checker - Centralized SD Type Decision Logic
 *
 * This module provides a single source of truth for all SD-type-based decisions
 * across the LEO Protocol. All files should import from here rather than
 * implementing their own type-checking logic.
 *
 * Features:
 * - AI-powered classification via SDTypeClassifier (GPT-5 Mini)
 * - Fast path using declared sd_type when available
 * - Caching to avoid repeated API calls
 * - Consistent type categorization across all modules
 *
 * @module sd-type-checker
 * @version 1.0.0
 */

import SDTypeClassifier from './sd-type-classifier.js';

// Cache for AI classification results (keyed by SD ID)
const classificationCache = new Map();

// SD type categories for different behaviors
export const SD_TYPE_CATEGORIES = {
  // SDs that don't produce code changes - skip TESTING, GITHUB, E2E validation
  // PAT-SD-API-CATEGORY-003: API/backend SDs produce code but need unit/integration tests, not E2E Playwright
  NON_CODE: ['infrastructure', 'documentation', 'process', 'api', 'backend'],

  // SDs that produce code and need full validation
  CODE_PRODUCING: ['feature', 'bugfix', 'refactor', 'performance'],

  // SDs that need database-specific validation
  DATABASE_IMPACTING: ['database', 'feature'],

  // SDs that need security-specific validation
  SECURITY_IMPACTING: ['security', 'feature'],

  // SDs that need UI/design validation (Gates 3 & 4)
  DESIGN_DATABASE_GATES: ['feature', 'database']
};

// Scoring weight profiles by SD type
export const SCORING_WEIGHTS = {
  // Infrastructure: Retrospective quality matters more than SD structure
  infrastructure: { sdWeight: 0.30, retroWeight: 0.70 },
  documentation: { sdWeight: 0.30, retroWeight: 0.70 },
  process: { sdWeight: 0.30, retroWeight: 0.70 },

  // PAT-SD-API-CATEGORY-003: API/backend SDs weight retrospective higher (implementation-focused)
  api: { sdWeight: 0.40, retroWeight: 0.60 },
  backend: { sdWeight: 0.40, retroWeight: 0.60 },

  // Feature: SD quality (objectives, metrics) matters more
  feature: { sdWeight: 0.60, retroWeight: 0.40 },
  bugfix: { sdWeight: 0.50, retroWeight: 0.50 },
  refactor: { sdWeight: 0.50, retroWeight: 0.50 },
  database: { sdWeight: 0.50, retroWeight: 0.50 },
  security: { sdWeight: 0.50, retroWeight: 0.50 },
  performance: { sdWeight: 0.50, retroWeight: 0.50 },

  // Default
  default: { sdWeight: 0.60, retroWeight: 0.40 }
};

// Threshold profiles by SD type
export const THRESHOLD_PROFILES = {
  // Infrastructure SDs have lower quality thresholds (simpler by design)
  infrastructure: { retrospectiveQuality: 55, sdCompletion: 55 },
  documentation: { retrospectiveQuality: 50, sdCompletion: 50 },
  process: { retrospectiveQuality: 55, sdCompletion: 55 },

  // PAT-SD-API-CATEGORY-003: API/backend SDs have lower thresholds (focus on endpoint implementation)
  api: { retrospectiveQuality: 55, sdCompletion: 55 },
  backend: { retrospectiveQuality: 55, sdCompletion: 55 },

  // Feature SDs have standard thresholds
  feature: { retrospectiveQuality: 65, sdCompletion: 65 },
  bugfix: { retrospectiveQuality: 60, sdCompletion: 60 },
  refactor: { retrospectiveQuality: 60, sdCompletion: 60 },
  database: { retrospectiveQuality: 65, sdCompletion: 65 },
  security: { retrospectiveQuality: 70, sdCompletion: 70 },
  performance: { retrospectiveQuality: 60, sdCompletion: 60 },

  // Default
  default: { retrospectiveQuality: 65, sdCompletion: 65 }
};

/**
 * Get the effective SD type (uses declared type or AI classification)
 *
 * @param {Object} sd - Strategic Directive object
 * @param {Object} options - Options
 * @param {boolean} options.useAI - Whether to use AI classification (default: true)
 * @param {boolean} options.useCache - Whether to use cached results (default: true)
 * @returns {Promise<Object>} Type result with type, confidence, and source
 */
export async function getEffectiveSDType(sd, options = {}) {
  const { useAI = true, useCache = true } = options;

  if (!sd) {
    return { type: 'feature', confidence: 0, source: 'default' };
  }

  const sdId = sd.id || sd.sd_id;

  // Check cache first
  if (useCache && sdId && classificationCache.has(sdId)) {
    return classificationCache.get(sdId);
  }

  // Fast path: Use declared sd_type if available and valid
  const declaredType = (sd.sd_type || '').toLowerCase();
  const category = (sd.category || '').toLowerCase();

  // PAT-SD-API-CATEGORY-003: If sd_type='feature' (generic) but category is more specific
  // (api, backend, infrastructure, etc.), prefer the category for threshold/validation decisions
  if (category && isValidSDType(category) && SD_TYPE_CATEGORIES.NON_CODE.includes(category)) {
    // Category indicates non-code SD - use category instead of generic 'feature'
    if (declaredType === 'feature' || !declaredType) {
      const result = { type: category, confidence: 90, source: 'category_override' };
      if (useCache && sdId) classificationCache.set(sdId, result);
      return result;
    }
  }

  if (declaredType && isValidSDType(declaredType)) {
    const result = { type: declaredType, confidence: 100, source: 'declared' };
    if (useCache && sdId) classificationCache.set(sdId, result);
    return result;
  }

  // AI classification path
  if (useAI) {
    try {
      const classifier = new SDTypeClassifier();
      const classification = await classifier.classify(sd);

      const result = {
        type: classification.detectedType,
        confidence: classification.confidence,
        source: 'ai',
        reasoning: classification.reasoning,
        alternativeType: classification.alternativeType,
        alternativeConfidence: classification.alternativeConfidence
      };

      if (useCache && sdId) classificationCache.set(sdId, result);
      return result;
    } catch (error) {
      console.warn(`AI classification failed: ${error.message}`);
      // Fall through to category/keyword fallback
    }
  }

  // Fallback: Use category field (category already declared above)
  if (category && isValidSDType(category)) {
    const result = { type: category, confidence: 70, source: 'category' };
    if (useCache && sdId) classificationCache.set(sdId, result);
    return result;
  }

  // Ultimate fallback
  const result = { type: 'feature', confidence: 30, source: 'default' };
  if (useCache && sdId) classificationCache.set(sdId, result);
  return result;
}

/**
 * Check if SD type is valid
 */
function isValidSDType(type) {
  const validTypes = [
    'feature', 'infrastructure', 'database', 'security',
    'documentation', 'bugfix', 'refactor', 'performance', 'process',
    'api', 'backend'  // PAT-SD-API-CATEGORY-003
  ];
  return validTypes.includes(type.toLowerCase());
}

/**
 * Check if SD is a non-code type (skip code validation)
 *
 * @param {Object} sd - Strategic Directive object
 * @param {Object} options - Options for type detection
 * @returns {Promise<boolean>} True if non-code SD
 */
export async function isNonCodeSD(sd, options = {}) {
  const typeResult = await getEffectiveSDType(sd, options);
  return SD_TYPE_CATEGORIES.NON_CODE.includes(typeResult.type);
}

/**
 * Check if SD is infrastructure type (sync version for simple checks)
 * Uses declared sd_type only - no AI call
 * PAT-SD-API-CATEGORY-003: Also checks category='api'/'backend' which skip E2E validation
 *
 * @param {Object} sd - Strategic Directive object
 * @returns {boolean} True if infrastructure/documentation/process/api/backend type
 */
export function isInfrastructureSDSync(sd) {
  if (!sd) return false;

  // Check sd_type first
  const sdType = (sd.sd_type || '').toLowerCase();
  if (SD_TYPE_CATEGORIES.NON_CODE.includes(sdType)) {
    return true;
  }

  // PAT-SD-API-CATEGORY-003: Check category='api'/'backend' even if sd_type='feature'
  // API SDs don't need E2E validation (unit/integration tests instead)
  const category = (sd.category || '').toLowerCase();
  if (SD_TYPE_CATEGORIES.NON_CODE.includes(category)) {
    return true;
  }

  return false;
}

/**
 * Check if SD requires DESIGN→DATABASE validation gates
 *
 * @param {Object} sd - Strategic Directive object
 * @param {Object} options - Options for type detection
 * @returns {Promise<boolean>} True if gates required
 */
export async function requiresDesignDatabaseGates(sd, options = {}) {
  const typeResult = await getEffectiveSDType(sd, options);

  // Non-code SDs never need design/database gates
  if (SD_TYPE_CATEGORIES.NON_CODE.includes(typeResult.type)) {
    return false;
  }

  // Feature and database SDs need design/database gates
  return SD_TYPE_CATEGORIES.DESIGN_DATABASE_GATES.includes(typeResult.type);
}

/**
 * Get scoring weights for SD type
 *
 * @param {Object} sd - Strategic Directive object
 * @param {Object} options - Options for type detection
 * @returns {Promise<Object>} Scoring weights { sdWeight, retroWeight }
 */
export async function getScoringWeights(sd, options = {}) {
  const typeResult = await getEffectiveSDType(sd, options);
  return SCORING_WEIGHTS[typeResult.type] || SCORING_WEIGHTS.default;
}

/**
 * Get threshold profile for SD type
 *
 * @param {Object} sd - Strategic Directive object
 * @param {Object} options - Options for type detection
 * @returns {Promise<Object>} Threshold profile
 */
export async function getThresholdProfile(sd, options = {}) {
  const typeResult = await getEffectiveSDType(sd, options);
  return THRESHOLD_PROFILES[typeResult.type] || THRESHOLD_PROFILES.default;
}

/**
 * Get sub-agents to skip for this SD type (PLAN_VERIFY phase)
 *
 * @param {Object} sd - Strategic Directive object
 * @param {Object} options - Options for type detection
 * @returns {Promise<string[]>} Array of sub-agent codes to skip
 */
export async function getSkippedSubAgents(sd, options = {}) {
  const isNonCode = await isNonCodeSD(sd, options);

  if (isNonCode) {
    // Non-code SDs skip TESTING and GITHUB (no code to test)
    return ['TESTING', 'GITHUB'];
  }

  return []; // Code-producing SDs run all sub-agents
}

/**
 * Clear the classification cache (useful for testing)
 */
export function clearCache() {
  classificationCache.clear();
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  return {
    size: classificationCache.size,
    keys: Array.from(classificationCache.keys())
  };
}

export default {
  getEffectiveSDType,
  isNonCodeSD,
  isInfrastructureSDSync,
  requiresDesignDatabaseGates,
  getScoringWeights,
  getThresholdProfile,
  getSkippedSubAgents,
  clearCache,
  getCacheStats,
  SD_TYPE_CATEGORIES,
  SCORING_WEIGHTS,
  THRESHOLD_PROFILES
};
