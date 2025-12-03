/**
 * SD QUALITY VALIDATION MODULE
 *
 * Validates Strategic Directive quality and enforces retrospective gate
 * at SD completion.
 *
 * Detects:
 * 1. Empty/missing success_metrics
 * 2. Empty/missing risks
 * 3. Vague descriptions (too short, boilerplate)
 * 4. Empty strategic_objectives
 * 5. Missing retrospective at completion (gate enforcement)
 * 6. Boilerplate retrospective content
 *
 * @module sd-quality-validation
 * @version 1.0.0
 * @see SD-CAPABILITY-LIFECYCLE-001 - LEO Protocol quality improvements
 */

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
 * Validate Strategic Directive quality
 * @param {Object} sd - Strategic Directive object from database
 * @returns {Object} Validation result
 */
export function validateSDQuality(sd) {
  const issues = [];
  const warnings = [];
  let score = 100;

  const sdId = sd.id || 'Unknown';

  // ============================================
  // 1. CHECK FOR SD PRESENCE
  // ============================================
  if (!sd || Object.keys(sd).length === 0) {
    issues.push(`${sdId}: Strategic Directive is empty or missing`);
    return { sd_id: sdId, valid: false, issues, warnings, score: 0, details: {} };
  }

  // ============================================
  // 2. CHECK DESCRIPTION
  // ============================================
  if (!sd.description) {
    issues.push(`${sdId}: No description defined`);
    score -= 20;
  } else if (sd.description.length < MINIMUM_DESCRIPTION_LENGTH) {
    warnings.push(`${sdId}: Description too brief (${sd.description.length} chars, min ${MINIMUM_DESCRIPTION_LENGTH})`);
    score -= 10;
  } else {
    const isBoilerplate = isBoilerplateText(sd.description, BOILERPLATE_DESCRIPTIONS, MINIMUM_DESCRIPTION_LENGTH);
    if (isBoilerplate) {
      warnings.push(`${sdId}: Description appears to be boilerplate`);
      score -= 10;
    }
  }

  // ============================================
  // 3. CHECK STRATEGIC OBJECTIVES
  // ============================================
  const objectives = sd.strategic_objectives || [];
  if (objectives.length === 0) {
    issues.push(`${sdId}: No strategic_objectives defined`);
    score -= 20;
  } else if (objectives.length < MINIMUM_OBJECTIVES_COUNT) {
    warnings.push(`${sdId}: Only ${objectives.length} objectives (recommend ${MINIMUM_OBJECTIVES_COUNT}+)`);
    score -= 5;
  } else {
    const objCheck = checkArrayBoilerplate(objectives, BOILERPLATE_OBJECTIVES);
    if (objCheck.isBoilerplate) {
      warnings.push(`${sdId}: ${objCheck.percentage}% of objectives are boilerplate`);
      score -= 10;
    }
  }

  // ============================================
  // 4. CHECK SUCCESS METRICS
  // ============================================
  const metrics = sd.success_metrics || [];
  if (metrics.length === 0) {
    issues.push(`${sdId}: No success_metrics defined`);
    score -= 15;
  } else if (metrics.length < MINIMUM_SUCCESS_METRICS_COUNT) {
    warnings.push(`${sdId}: Only ${metrics.length} success metrics (recommend ${MINIMUM_SUCCESS_METRICS_COUNT}+)`);
    score -= 5;
  }

  // ============================================
  // 5. CHECK RISKS
  // ============================================
  const risks = sd.risks || [];
  if (risks.length === 0) {
    warnings.push(`${sdId}: No risks defined (every SD has some risk)`);
    score -= 10;
  } else if (risks.length < MINIMUM_RISKS_COUNT) {
    warnings.push(`${sdId}: Only ${risks.length} risks identified`);
    score -= 5;
  }

  // ============================================
  // 6. CHECK STATUS CONSISTENCY
  // ============================================
  if (sd.status === 'completed') {
    // Completed SDs should have all fields filled
    if (objectives.length === 0 || metrics.length === 0) {
      issues.push(`${sdId}: Completed SD missing required fields (objectives or metrics)`);
      score -= 15;
    }
  }

  return {
    sd_id: sdId,
    status: sd.status,
    valid: issues.length === 0,
    issues,
    warnings,
    score: Math.max(0, score),
    details: {
      description_length: sd.description?.length || 0,
      objectives_count: objectives.length,
      metrics_count: metrics.length,
      risks_count: risks.length
    }
  };
}

/**
 * Validate retrospective quality for an SD
 * @param {Object} retrospective - Retrospective object from database
 * @returns {Object} Validation result
 */
export function validateRetrospectiveQuality(retrospective) {
  const issues = [];
  const warnings = [];
  let score = 100;

  const retroId = retrospective?.id || 'Unknown';
  const sdId = retrospective?.sd_id || 'Unknown';

  if (!retrospective) {
    issues.push(`${sdId}: No retrospective found`);
    return { retro_id: retroId, sd_id: sdId, valid: false, issues, warnings, score: 0, details: {} };
  }

  // ============================================
  // 1. CHECK KEY_LEARNINGS
  // ============================================
  let keyLearnings = retrospective.key_learnings || [];
  // Handle case where key_learnings might be a JSON string
  if (typeof keyLearnings === 'string') {
    try {
      keyLearnings = JSON.parse(keyLearnings);
    } catch {
      keyLearnings = [];
    }
  }
  if (!Array.isArray(keyLearnings)) keyLearnings = [];

  if (keyLearnings.length === 0) {
    issues.push(`${sdId}: No key_learnings in retrospective`);
    score -= 20;
  } else {
    // Check if items have is_boilerplate flag
    const boilerplateItems = keyLearnings.filter(item => {
      if (typeof item === 'object' && item.is_boilerplate !== undefined) {
        return item.is_boilerplate;
      }
      // Check against known boilerplate patterns
      const text = typeof item === 'string' ? item : (item.learning || '');
      return BOILERPLATE_RETRO_LEARNINGS.some(p => text.toLowerCase().includes(p));
    });

    if (boilerplateItems.length === keyLearnings.length && keyLearnings.length > 0) {
      issues.push(`${sdId}: All key_learnings are boilerplate`);
      score -= 25;
    } else if (boilerplateItems.length > 0) {
      warnings.push(`${sdId}: ${boilerplateItems.length}/${keyLearnings.length} key_learnings are boilerplate`);
      score -= 10;
    }
  }

  // ============================================
  // 2. CHECK ACTION_ITEMS
  // ============================================
  let actionItems = retrospective.action_items || [];
  if (typeof actionItems === 'string') {
    try {
      actionItems = JSON.parse(actionItems);
    } catch {
      actionItems = [];
    }
  }
  if (!Array.isArray(actionItems)) actionItems = [];

  if (actionItems.length === 0) {
    warnings.push(`${sdId}: No action_items in retrospective`);
    score -= 10;
  } else {
    const boilerplateActions = actionItems.filter(item => {
      if (typeof item === 'object' && item.is_boilerplate !== undefined) {
        return item.is_boilerplate;
      }
      const text = typeof item === 'string' ? item : (item.action || '');
      return BOILERPLATE_RETRO_ACTION_ITEMS.some(p => text.toLowerCase().includes(p));
    });

    if (boilerplateActions.length === actionItems.length && actionItems.length > 0) {
      warnings.push(`${sdId}: All action_items are boilerplate`);
      score -= 15;
    }
  }

  // ============================================
  // 3. CHECK WHAT_NEEDS_IMPROVEMENT
  // ============================================
  let improvements = retrospective.what_needs_improvement || [];
  if (typeof improvements === 'string') {
    try {
      improvements = JSON.parse(improvements);
    } catch {
      improvements = [];
    }
  }
  if (!Array.isArray(improvements)) improvements = [];

  if (improvements.length === 0) {
    // This was identified in the quality_issues field as well
    warnings.push(`${sdId}: No improvement areas identified (every SD has room for improvement)`);
    score -= 10;
  }

  // ============================================
  // 4. CHECK QUALITY SCORE
  // ============================================
  if (retrospective.quality_score !== null && retrospective.quality_score !== undefined) {
    if (retrospective.quality_score < 50) {
      warnings.push(`${sdId}: Retrospective quality_score is low (${retrospective.quality_score}%)`);
      score -= 10;
    }
  }

  // ============================================
  // 5. CHECK FOR EXISTING QUALITY ISSUES
  // ============================================
  if (retrospective.quality_issues && retrospective.quality_issues.length > 0) {
    warnings.push(`${sdId}: ${retrospective.quality_issues.length} existing quality issue(s) flagged`);
    score -= retrospective.quality_issues.length * 5;
  }

  return {
    retro_id: retroId,
    sd_id: sdId,
    valid: issues.length === 0,
    issues,
    warnings,
    score: Math.max(0, score),
    details: {
      key_learnings_count: keyLearnings.length,
      action_items_count: actionItems.length,
      improvements_count: improvements.length,
      quality_score: retrospective.quality_score,
      existing_quality_issues: retrospective.quality_issues?.length || 0
    }
  };
}

/**
 * Validate SD completion readiness (includes retrospective gate)
 * @param {Object} sd - Strategic Directive
 * @param {Object} retrospective - Optional retrospective (will be fetched if not provided)
 * @returns {Object} Validation result
 */
export function validateSDCompletionReadiness(sd, retrospective = null) {
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

  // Validate SD quality
  const sdQuality = validateSDQuality(sd);
  result.sdQuality = sdQuality;
  result.issues.push(...sdQuality.issues);
  result.warnings.push(...sdQuality.warnings);

  // Validate retrospective if provided
  if (retrospective) {
    const retroQuality = validateRetrospectiveQuality(retrospective);
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

    if (sd.issues.some(i => i.includes('description'))) {
      guidance.required.push('Expand description to explain business value and technical approach');
    }
  }

  // Retrospective-specific issues
  if (validationResult.retroQuality) {
    const retro = validationResult.retroQuality;

    if (retro.issues.some(i => i.includes('key_learnings'))) {
      guidance.required.push('Add specific, non-boilerplate key learnings from this SD');
    }

    if (retro.issues.some(i => i.includes('boilerplate'))) {
      guidance.required.push('Replace boilerplate learnings with SD-specific insights');
    }

    if (retro.warnings.some(w => w.includes('improvement'))) {
      guidance.recommended.push('Identify at least one area that could be improved');
    }
  }

  // Gate enforcement
  if (validationResult.issues.some(i => i.includes('No retrospective found'))) {
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
