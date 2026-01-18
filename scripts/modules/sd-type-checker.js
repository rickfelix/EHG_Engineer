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
  // SD-E2E-WEBSOCKET-AUTH-006 lesson: qa type added for test cleanup/review tasks
  // PAT-SD-API-CATEGORY-003: api/backend SDs produce code but need unit/integration tests, not E2E
  // SD-UNIFIED-PATH-1.0: orchestrator added - parent SDs coordinate, children produce code
  // SD-UNIFIED-PATH-2.2.1: database added - DB SDs work via migrations, not app code changes
  // FIX: Added 'docs' alias for 'documentation' - commonly used abbreviation
  NON_CODE: ['infrastructure', 'documentation', 'docs', 'process', 'qa', 'api', 'backend', 'orchestrator', 'database'],

  // SDs that produce code and need full validation
  // LEO Protocol v4.4.1: Added 'enhancement' - improvements to existing features (lighter validation than 'feature')
  CODE_PRODUCING: ['feature', 'enhancement', 'bugfix', 'refactor', 'performance'],

  // SDs that need database-specific validation
  DATABASE_IMPACTING: ['database', 'feature'],

  // SDs that need security-specific validation
  SECURITY_IMPACTING: ['security', 'feature'],

  // SDs that need UI/design validation (Gates 3 & 4)
  DESIGN_DATABASE_GATES: ['feature', 'database'],

  // Parent SDs - progress derived from child SD completion
  ORCHESTRATOR: ['orchestrator']
};

// Scoring weight profiles by SD type
export const SCORING_WEIGHTS = {
  // Infrastructure: Retrospective quality matters more than SD structure
  infrastructure: { sdWeight: 0.30, retroWeight: 0.70 },
  documentation: { sdWeight: 0.30, retroWeight: 0.70 },
  process: { sdWeight: 0.30, retroWeight: 0.70 },
  qa: { sdWeight: 0.30, retroWeight: 0.70 },  // SD-E2E-WEBSOCKET-AUTH-006: test cleanup/review

  // PAT-SD-API-CATEGORY-003: API/backend SDs weight retrospective higher (implementation-focused)
  api: { sdWeight: 0.40, retroWeight: 0.60 },
  backend: { sdWeight: 0.40, retroWeight: 0.60 },

  // Feature: SD quality (objectives, metrics) matters more
  feature: { sdWeight: 0.60, retroWeight: 0.40 },
  // LEO Protocol v4.4.1: Enhancement - improvements to existing features (balanced like bugfix)
  enhancement: { sdWeight: 0.50, retroWeight: 0.50 },
  bugfix: { sdWeight: 0.50, retroWeight: 0.50 },
  refactor: { sdWeight: 0.50, retroWeight: 0.50 },
  database: { sdWeight: 0.50, retroWeight: 0.50 },
  security: { sdWeight: 0.50, retroWeight: 0.50 },
  performance: { sdWeight: 0.50, retroWeight: 0.50 },

  // Orchestrator: Parent SDs - validated via retrospective quality (coordination lessons learned)
  // SD-UNIFIED-PATH-1.0: Changed from 0/0 to 0/1 to enable scoring when auto-pass fails
  orchestrator: { sdWeight: 0.0, retroWeight: 1.0 },  // 100% retrospective - children did actual work

  // Default
  default: { sdWeight: 0.60, retroWeight: 0.40 }
};

// Threshold profiles by SD type
// SD-LEO-PROTOCOL-V435-001 US-002: Added prdQuality thresholds per type
export const THRESHOLD_PROFILES = {
  // Infrastructure SDs have lower quality thresholds (simpler by design)
  infrastructure: { retrospectiveQuality: 55, sdCompletion: 55, prdQuality: 50 },
  documentation: { retrospectiveQuality: 50, sdCompletion: 50, prdQuality: 50 },
  docs: { retrospectiveQuality: 50, sdCompletion: 50, prdQuality: 50 }, // Alias for documentation
  process: { retrospectiveQuality: 55, sdCompletion: 55, prdQuality: 50 },
  qa: { retrospectiveQuality: 55, sdCompletion: 55, prdQuality: 50 },  // SD-E2E-WEBSOCKET-AUTH-006

  // PAT-SD-API-CATEGORY-003: API/backend SDs have slightly lower thresholds (no E2E required)
  api: { retrospectiveQuality: 55, sdCompletion: 55, prdQuality: 65 },
  backend: { retrospectiveQuality: 55, sdCompletion: 55, prdQuality: 65 },

  // Feature SDs - Retrospective threshold lowered from 65 to 55 (2026-01-05)
  // ROOT CAUSE FIX: AI Russian Judge variance blocks valid retrospectives (57% vs 65%)
  // Retrospective quality is advisory; core validation is via sub-agents and handoffs
  feature: { retrospectiveQuality: 55, sdCompletion: 65, prdQuality: 65 },
  // LEO Protocol v4.4.1: Enhancement - lighter thresholds (improvements to existing features)
  enhancement: { retrospectiveQuality: 60, sdCompletion: 60, prdQuality: 60 },
  bugfix: { retrospectiveQuality: 60, sdCompletion: 60, prdQuality: 70 },
  refactor: { retrospectiveQuality: 60, sdCompletion: 60, prdQuality: 75 },
  database: { retrospectiveQuality: 65, sdCompletion: 65, prdQuality: 70 },
  security: { retrospectiveQuality: 70, sdCompletion: 70, prdQuality: 90 },
  performance: { retrospectiveQuality: 60, sdCompletion: 60, prdQuality: 85 },

  // Orchestrator: Parent SDs - thresholds based on child completion
  orchestrator: { retrospectiveQuality: 55, sdCompletion: 100, prdQuality: 50 },  // Must have all children complete

  // Default
  default: { retrospectiveQuality: 65, sdCompletion: 65, prdQuality: 70 }
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

  // Fallback: Use category field
  const category = (sd.category || '').toLowerCase();
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
    'feature', 'enhancement',  // LEO v4.4.1: enhancement = improvements to existing features
    'infrastructure', 'database', 'security',
    'documentation', 'docs',  // docs = alias for documentation
    'bugfix', 'refactor', 'performance', 'process',
    'orchestrator',  // Parent SDs with children - auto-set by trigger
    'qa'  // SD-E2E-WEBSOCKET-AUTH-006: test cleanup/review tasks
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
 *
 * @param {Object} sd - Strategic Directive object
 * @returns {boolean} True if infrastructure/documentation/process type
 */
export function isInfrastructureSDSync(sd) {
  if (!sd) return false;
  const declaredType = (sd.sd_type || sd.category || '').toLowerCase();
  return SD_TYPE_CATEGORIES.NON_CODE.includes(declaredType);
}

/**
 * Check if SD requires DESIGN→DATABASE validation gates (sync version)
 * Uses declared sd_type only - no AI call
 *
 * ROOT CAUSE FIX: SD-NAV-CMD-001A bugfix gate failure
 * The async version was being called without await in PlanToExecExecutor.getRequiredGates,
 * causing Promise to always be truthy. This sync version uses declared sd_type directly.
 *
 * Logic:
 * - Non-code types (infrastructure, documentation, process, qa, api, backend, orchestrator, bugfix*) → false
 * - Only feature and database types → true
 *
 * *Note: bugfix is CODE_PRODUCING but does NOT require DESIGN/DATABASE gates
 *        (quick fixes don't need full design architecture review)
 *
 * @param {Object} sd - Strategic Directive object
 * @returns {boolean} True if gates required, false otherwise
 */
export function requiresDesignDatabaseGatesSync(sd) {
  if (!sd) return true; // Default to requiring gates if no SD (safe default)

  const declaredType = (sd.sd_type || sd.category || '').toLowerCase();

  // Non-code SDs never need design/database gates
  if (SD_TYPE_CATEGORIES.NON_CODE.includes(declaredType)) {
    return false;
  }

  // Only feature and database SDs need design/database gates
  // bugfix, refactor, performance etc. are code-producing but don't need these gates
  return SD_TYPE_CATEGORIES.DESIGN_DATABASE_GATES.includes(declaredType);
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
 * Get PRD quality threshold for SD type (sync version)
 * SD-LEO-PROTOCOL-V435-001 US-002: Type-specific PRD quality thresholds
 *
 * @param {Object} sd - Strategic Directive object
 * @returns {number} PRD quality threshold (50-90)
 */
export function getPRDQualityThresholdSync(sd) {
  if (!sd) return THRESHOLD_PROFILES.default.prdQuality;
  const declaredType = (sd.sd_type || sd.category || '').toLowerCase();
  const profile = THRESHOLD_PROFILES[declaredType] || THRESHOLD_PROFILES.default;
  return profile.prdQuality || THRESHOLD_PROFILES.default.prdQuality;
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

// ============================================================================
// STREAM FUNCTIONS (SD-LEO-STREAMS-001)
// Design & Architecture stream requirements by SD type
// ============================================================================

// Stream requirement cache (keyed by SD type)
const streamRequirementsCache = new Map();

/**
 * Get stream requirements for an SD type from database
 *
 * @param {string} sdType - SD type (feature, enhancement, bugfix, etc.)
 * @param {Object} supabase - Supabase client instance
 * @returns {Promise<Array>} Stream requirements with levels and metadata
 */
export async function getStreamRequirements(sdType, supabase) {
  if (!sdType || !supabase) {
    return [];
  }

  const normalizedType = sdType.toLowerCase();

  // Check cache first
  if (streamRequirementsCache.has(normalizedType)) {
    return streamRequirementsCache.get(normalizedType);
  }

  try {
    const { data, error } = await supabase
      .from('sd_stream_requirements')
      .select('*')
      .eq('sd_type', normalizedType)
      .order('stream_category')
      .order('stream_name');

    if (error) {
      console.warn(`Failed to fetch stream requirements: ${error.message}`);
      return [];
    }

    // Cache the results
    streamRequirementsCache.set(normalizedType, data || []);
    return data || [];
  } catch (err) {
    console.warn(`Stream requirements lookup error: ${err.message}`);
    return [];
  }
}

/**
 * Evaluate which conditional streams should activate based on PRD content
 *
 * @param {string} prdText - Full text of PRD (description + requirements)
 * @param {string} sdType - SD type
 * @param {Object} supabase - Supabase client instance
 * @returns {Promise<Array>} Activated conditional streams with match details
 */
export async function evaluateConditionalStreams(prdText, sdType, supabase) {
  if (!prdText || !sdType || !supabase) {
    return [];
  }

  const streams = await getStreamRequirements(sdType, supabase);
  const conditionalStreams = streams.filter(s => s.requirement_level === 'conditional');
  const normalizedText = prdText.toLowerCase();

  const activatedStreams = [];

  for (const stream of conditionalStreams) {
    const keywords = stream.conditional_keywords || [];
    const matches = keywords.filter(kw => normalizedText.includes(kw.toLowerCase()));

    // Require 2+ keyword matches to activate (conservative approach)
    if (matches.length >= 2) {
      activatedStreams.push({
        stream_name: stream.stream_name,
        stream_category: stream.stream_category,
        activated: true,
        matched_keywords: matches,
        match_count: matches.length,
        minimum_depth: stream.minimum_depth,
        validation_sub_agent: stream.validation_sub_agent
      });
    }
  }

  return activatedStreams;
}

/**
 * Validate stream completion status for an SD
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} supabase - Supabase client instance
 * @param {Object} options - Options
 * @param {string} options.prdText - PRD text for conditional evaluation
 * @returns {Promise<Object>} Completion status with missing streams and score
 */
export async function validateStreamCompletion(sdId, supabase, options = {}) {
  if (!sdId || !supabase) {
    return { complete: false, missing: [], score: 0, error: 'Invalid parameters' };
  }

  try {
    // Get the SD to determine type
    const { data: sd, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('sd_type, id')
      .eq('id', sdId)
      .single();

    if (sdError || !sd) {
      return { complete: false, missing: [], score: 0, error: 'SD not found' };
    }

    const sdType = (sd.sd_type || 'feature').toLowerCase();

    // Get required and conditional streams for this SD type
    const allStreams = await getStreamRequirements(sdType, supabase);

    // Separate by requirement level
    const requiredStreams = allStreams.filter(s => s.requirement_level === 'required');
    let conditionalStreams = [];

    // Evaluate conditional streams if PRD text provided
    if (options.prdText) {
      conditionalStreams = await evaluateConditionalStreams(options.prdText, sdType, supabase);
    }

    // Get completion records for this SD
    const { data: completions, error: compError } = await supabase
      .from('sd_stream_completions')
      .select('stream_name, status, completed_at')
      .eq('sd_id', sdId);

    if (compError) {
      return { complete: false, missing: [], score: 0, error: compError.message };
    }

    const completedStreamNames = new Set(
      (completions || [])
        .filter(c => c.status === 'completed')
        .map(c => c.stream_name)
    );

    // Check required streams
    const missingRequired = requiredStreams
      .filter(s => !completedStreamNames.has(s.stream_name))
      .map(s => s.stream_name);

    // Check activated conditional streams
    const missingConditional = conditionalStreams
      .filter(s => !completedStreamNames.has(s.stream_name))
      .map(s => s.stream_name);

    const allMissing = [...missingRequired, ...missingConditional];
    const totalRequired = requiredStreams.length + conditionalStreams.length;
    const completedCount = totalRequired - allMissing.length;
    const score = totalRequired > 0 ? Math.round((completedCount / totalRequired) * 100) : 100;

    return {
      complete: allMissing.length === 0,
      missing: allMissing,
      missingRequired,
      missingConditional,
      score,
      totalRequired,
      completedCount,
      sdType
    };
  } catch (err) {
    return { complete: false, missing: [], score: 0, error: err.message };
  }
}

/**
 * Get applicable streams for an SD with activation status
 * Returns all streams with their requirement level and activation status
 *
 * @param {string} sdType - SD type
 * @param {string} prdText - Optional PRD text for conditional evaluation
 * @param {Object} supabase - Supabase client instance
 * @returns {Promise<Object>} Categorized streams (design/architecture) with activation status
 */
export async function getApplicableStreams(sdType, prdText, supabase) {
  const allStreams = await getStreamRequirements(sdType, supabase);
  const conditionalActivations = prdText
    ? await evaluateConditionalStreams(prdText, sdType, supabase)
    : [];

  const activatedNames = new Set(conditionalActivations.map(s => s.stream_name));

  const result = {
    design: [],
    architecture: [],
    summary: {
      required: 0,
      optional: 0,
      conditional_activated: 0,
      skip: 0
    }
  };

  for (const stream of allStreams) {
    const isActivated = stream.requirement_level === 'conditional' && activatedNames.has(stream.stream_name);
    const effectiveLevel = isActivated ? 'required' : stream.requirement_level;

    const streamInfo = {
      name: stream.stream_name,
      requirement_level: stream.requirement_level,
      effective_level: effectiveLevel,
      activated: isActivated,
      minimum_depth: stream.minimum_depth,
      validation_sub_agent: stream.validation_sub_agent,
      description: stream.description
    };

    if (stream.stream_category === 'design') {
      result.design.push(streamInfo);
    } else {
      result.architecture.push(streamInfo);
    }

    // Update summary
    if (effectiveLevel === 'required') result.summary.required++;
    else if (effectiveLevel === 'optional') result.summary.optional++;
    else if (effectiveLevel === 'skip') result.summary.skip++;

    if (isActivated) result.summary.conditional_activated++;
  }

  return result;
}

/**
 * Clear stream requirements cache (useful for testing)
 */
export function clearStreamCache() {
  streamRequirementsCache.clear();
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
  requiresDesignDatabaseGatesSync,
  getScoringWeights,
  getThresholdProfile,
  getPRDQualityThresholdSync,
  getSkippedSubAgents,
  clearCache,
  getCacheStats,
  // Stream functions (SD-LEO-STREAMS-001)
  getStreamRequirements,
  evaluateConditionalStreams,
  validateStreamCompletion,
  getApplicableStreams,
  clearStreamCache,
  // Constants
  SD_TYPE_CATEGORIES,
  SCORING_WEIGHTS,
  THRESHOLD_PROFILES
};
