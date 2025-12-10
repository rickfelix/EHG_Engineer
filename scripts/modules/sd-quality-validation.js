/**
 * SD QUALITY VALIDATION MODULE (AI-POWERED)
 *
 * Uses AI-powered Russian Judge multi-criterion weighted scoring to validate:
 * 1. Strategic Directive quality (LEAD phase)
 * 2. Retrospective quality (PLAN→LEAD handoff)
 *
 * Replaced keyword/pattern-based validation with semantic AI evaluation using gpt-5-mini.
 * All assessments stored in ai_quality_assessments table for meta-analysis.
 *
 * @module sd-quality-validation
 * @version 2.0.0 (AI-powered Russian Judge)
 * @see /database/migrations/20251205_ai_quality_assessments.sql
 */

import { SDQualityRubric } from './rubrics/sd-quality-rubric.js';
import { RetrospectiveQualityRubric } from './rubrics/retrospective-quality-rubric.js';

// ============================================
// BOILERPLATE DETECTION PATTERNS
// ============================================

// Generic SD descriptions (boilerplate)
const BOILERPLATE_DESCRIPTIONS = [
  'imported from ehg backlog',
  'implement',
  'create',
  'add',
  'fix',
  'update',
  'build',
  'develop'
];

// Generic strategic objectives (boilerplate)
const BOILERPLATE_OBJECTIVES = [
  'implement all user stories',
  'pass all tests',
  'meet acceptance criteria',
  'follow best practices',
  'ensure quality',
  'deploy to production'
];

// Minimum requirements
const MINIMUM_DESCRIPTION_LENGTH = 50;
const MINIMUM_OBJECTIVES_COUNT = 2;
const MINIMUM_SUCCESS_METRICS_COUNT = 1;
const MINIMUM_RISKS_COUNT = 1;

// ============================================
// RETROSPECTIVE GATE PATTERNS
// ============================================

// Boilerplate retrospective content (already detected, but re-verify)
const BOILERPLATE_RETRO_LEARNINGS = [
  'database-first architecture maintained',
  'leo protocol phases followed',
  'sub-agent automation improved'
];

const BOILERPLATE_RETRO_ACTION_ITEMS = [
  'review retrospective learnings before next sd',
  'apply patterns from this sd',
  'update sub-agent instructions'
];

// ============================================
// VALIDATION FUNCTIONS
// ============================================

/**
 * Check if text is too short or boilerplate
 */
function isBoilerplateText(text, patterns, minLength = 50) {
  if (!text || text.length < minLength) return true;

  const normalized = text.toLowerCase();
  const words = normalized.split(/\s+/).filter(w => w.length > 2);

  // If mostly consists of boilerplate patterns
  const boilerplateWords = words.filter(w =>
    patterns.some(p => p.includes(w) || w.includes(p))
  );

  return boilerplateWords.length > words.length * 0.5;
}

/**
 * Check if array contains mostly boilerplate items
 */
function checkArrayBoilerplate(items, patterns) {
  if (!items || !Array.isArray(items) || items.length === 0) {
    return { isEmpty: true, isBoilerplate: false, percentage: 0 };
  }

  const boilerplateCount = items.filter(item => {
    const text = typeof item === 'string' ? item : (item.objective || item.metric || item.risk || JSON.stringify(item));
    const normalized = text.toLowerCase();
    return patterns.some(p => normalized.includes(p.toLowerCase()));
  }).length;

  const percentage = Math.round((boilerplateCount / items.length) * 100);

  return {
    isEmpty: false,
    isBoilerplate: percentage >= 75,
    percentage,
    boilerplateCount,
    totalCount: items.length
  };
}

/**
 * Validate Strategic Directive quality using AI-powered Russian Judge rubric
 * @param {Object} sd - Strategic Directive object from database
 * @returns {Promise<Object>} Validation result (async now - calls OpenAI)
 */
export async function validateSDQuality(sd) {
  const sdId = sd?.id || sd?.sd_id || 'Unknown';

  // Basic presence check (fast-fail before AI call)
  if (!sd || Object.keys(sd).length === 0) {
    return {
      sd_id: sdId,
      status: sd?.status,
      valid: false,
      passed: false,
      score: 0,
      issues: [`${sdId}: Strategic Directive is empty or missing`],
      warnings: [],
      details: {}
    };
  }

  try {
    // Use AI-powered Russian Judge rubric
    const rubric = new SDQualityRubric();
    const result = await rubric.validateSDQuality(sd);

    // Convert to legacy format for backward compatibility
    return {
      sd_id: sdId,
      status: sd.status,
      valid: result.passed,
      passed: result.passed,
      score: result.score,
      issues: result.issues,
      warnings: result.warnings,
      details: {
        ...result.details,
        // Add counts for backward compatibility
        description_length: sd.description?.length || 0,
        objectives_count: sd.strategic_objectives?.length || 0,
        metrics_count: sd.success_metrics?.length || 0,
        risks_count: sd.risks?.length || 0
      }
    };
  } catch (error) {
    console.error(`SD Quality Validation Error (${sdId}):`, error.message);

    // Fallback: return failed validation with error details
    return {
      sd_id: sdId,
      status: sd.status,
      valid: false,
      passed: false,
      score: 0,
      issues: [`AI quality assessment failed: ${error.message}. Manual review required.`],
      warnings: ['OpenAI API error - check OPENAI_API_KEY environment variable'],
      details: {
        error: error.message,
        description_length: sd.description?.length || 0,
        objectives_count: sd.strategic_objectives?.length || 0,
        metrics_count: sd.success_metrics?.length || 0,
        risks_count: sd.risks?.length || 0
      }
    };
  }
}

/**
 * Validate retrospective quality using AI-powered Russian Judge rubric
 * @param {Object} retrospective - Retrospective object from database
 * @returns {Promise<Object>} Validation result (async now - calls OpenAI)
 */
export async function validateRetrospectiveQuality(retrospective) {
  const retroId = retrospective?.id || 'Unknown';
  const sdId = retrospective?.sd_id || 'Unknown';

  // Basic presence check (fast-fail before AI call)
  if (!retrospective) {
    return {
      retro_id: retroId,
      sd_id: sdId,
      valid: false,
      passed: false,
      score: 0,
      issues: [`${sdId}: No retrospective found`],
      warnings: [],
      details: {}
    };
  }

  try {
    // Use AI-powered Russian Judge rubric
    const rubric = new RetrospectiveQualityRubric();
    const result = await rubric.validateRetrospectiveQuality(retrospective);

    // Parse arrays for backward compatibility
    let keyLearnings = retrospective.key_learnings || [];
    let actionItems = retrospective.action_items || [];
    let improvements = retrospective.what_needs_improvement || [];

    // Handle JSON string parsing
    if (typeof keyLearnings === 'string') {
      try { keyLearnings = JSON.parse(keyLearnings); } catch { keyLearnings = []; }
    }
    if (typeof actionItems === 'string') {
      try { actionItems = JSON.parse(actionItems); } catch { actionItems = []; }
    }
    if (typeof improvements === 'string') {
      try { improvements = JSON.parse(improvements); } catch { improvements = []; }
    }

    if (!Array.isArray(keyLearnings)) keyLearnings = [];
    if (!Array.isArray(actionItems)) actionItems = [];
    if (!Array.isArray(improvements)) improvements = [];

    // Convert to legacy format for backward compatibility
    return {
      retro_id: retroId,
      sd_id: sdId,
      valid: result.passed,
      passed: result.passed,
      score: result.score,
      issues: result.issues,
      warnings: result.warnings,
      details: {
        ...result.details,
        // Add counts for backward compatibility
        key_learnings_count: keyLearnings.length,
        action_items_count: actionItems.length,
        improvements_count: improvements.length,
        quality_score: retrospective.quality_score,
        existing_quality_issues: retrospective.quality_issues?.length || 0
      }
    };
  } catch (error) {
    console.error(`Retrospective Quality Validation Error (${sdId}):`, error.message);

    // Fallback: return failed validation with error details
    return {
      retro_id: retroId,
      sd_id: sdId,
      valid: false,
      passed: false,
      score: 0,
      issues: [`AI quality assessment failed: ${error.message}. Manual review required.`],
      warnings: ['OpenAI API error - check OPENAI_API_KEY environment variable'],
      details: {
        error: error.message
      }
    };
  }
}

/**
 * Validate SD completion readiness (includes retrospective gate)
 * @param {Object} sd - Strategic Directive
 * @param {Object} retrospective - Optional retrospective (will be fetched if not provided)
 * @returns {Promise<Object>} Validation result (async now - calls AI)
 */
export async function validateSDCompletionReadiness(sd, retrospective = null) {
  const result = {
    valid: true,
    sd_id: sd?.id || 'Unknown',
    score: 0,
    issues: [],
    warnings: [],
    sdQuality: null,
    retroQuality: null
  };

  if (!sd) {
    result.valid = false;
    result.issues.push('Strategic Directive is null or undefined');
    return result;
  }

  // Validate SD quality (async now)
  const sdQuality = await validateSDQuality(sd);
  result.sdQuality = sdQuality;
  result.issues.push(...sdQuality.issues);
  result.warnings.push(...sdQuality.warnings);

  // Validate retrospective if provided (async now)
  if (retrospective) {
    const retroQuality = await validateRetrospectiveQuality(retrospective);
    result.retroQuality = retroQuality;
    result.issues.push(...retroQuality.issues);
    result.warnings.push(...retroQuality.warnings);

    // Combined score (weighted: SD 60%, Retro 40%)
    result.score = Math.round(sdQuality.score * 0.6 + retroQuality.score * 0.4);
  } else {
    // No retrospective = gate blocked for completion
    if (sd.status === 'completed' || sd.status === 'active') {
      result.issues.push(`${sd.id}: No retrospective found (required for SD completion)`);
    }
    result.score = sdQuality.score;
  }

  result.valid = result.issues.length === 0;

  return result;
}

/**
 * Get improvement guidance for SD quality issues
 */
export function getSDImprovementGuidance(validationResult) {
  const guidance = {
    required: [],
    recommended: [],
    timeEstimate: '15-30 minutes',
    instructions: ''
  };

  // SD-specific issues
  if (validationResult.sdQuality) {
    const sd = validationResult.sdQuality;

    if (sd.details?.objectives_count === 0) {
      guidance.required.push('Add specific strategic objectives that describe WHAT will be built');
    }

    if (sd.details?.metrics_count === 0) {
      guidance.required.push('Add measurable success metrics (e.g., "Reduce page load time by 50%")');
    }

    if (sd.details?.risks_count === 0) {
      guidance.recommended.push('Identify at least one risk with mitigation strategy');
    }

    if (sd.issues?.some(i => i.includes('description'))) {
      guidance.required.push('Expand description to explain business value and technical approach');
    }
  }

  // Retrospective-specific issues
  if (validationResult.retroQuality) {
    const retro = validationResult.retroQuality;

    if (retro.issues?.some(i => i.includes('key_learnings'))) {
      guidance.required.push('Add specific, non-boilerplate key learnings from this SD');
    }

    if (retro.issues?.some(i => i.includes('boilerplate'))) {
      guidance.required.push('Replace boilerplate learnings with SD-specific insights');
    }

    if (retro.warnings?.some(w => w.includes('improvement'))) {
      guidance.recommended.push('Identify at least one area that could be improved');
    }
  }

  // Gate enforcement
  if (validationResult.issues?.some(i => i.includes('No retrospective found'))) {
    guidance.required.push('Create retrospective before marking SD as complete');
    guidance.required.push('Run: node scripts/execute-subagent.js --code RETRO --sd-id <SD-ID>');
  }

  guidance.instructions = `SD completion readiness score is ${validationResult.score}%. ` +
    'Focus on adding specific success metrics and ensuring retrospective has non-boilerplate learnings. ' +
    'The retrospective gate ensures every completed SD contributes to organizational learning.';

  return guidance;
}

export default {
  validateSDQuality,
  validateRetrospectiveQuality,
  validateSDCompletionReadiness,
  getSDImprovementGuidance
};
