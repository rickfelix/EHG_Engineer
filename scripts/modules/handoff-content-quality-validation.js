/**
 * HANDOFF CONTENT QUALITY VALIDATION MODULE
 *
 * Validates handoff content quality to ensure handoffs contain
 * SD-specific information rather than generic templates.
 *
 * Detects:
 * 1. Boilerplate action_items (same items for every handoff)
 * 2. Generic deliverables_manifest (copy-paste checklists)
 * 3. Template executive_summary (no SD-specific insights)
 * 4. Formulaic key_decisions (no actual decisions)
 * 5. Missing context-specific content
 *
 * @module handoff-content-quality-validation
 * @version 1.0.0
 * @see SD-CAPABILITY-LIFECYCLE-001 - LEO Protocol quality improvements
 */

// ============================================
// BOILERPLATE DETECTION PATTERNS
// ============================================

// Generic action item patterns
const BOILERPLATE_ACTION_ITEMS = [
  'create comprehensive prd',
  'generate user stories from requirements',
  'validate prd completeness',
  'implement all user stories',
  'write unit tests for all components',
  'write e2e tests for user journeys',
  'generate documentation',
  'verify all deliverables met',
  'validate test coverage',
  'review documentation quality',
  'check e2e test mapping',
  'review final implementation',
  'validate strategic objectives met',
  'create retrospective',
  'mark sd as complete',
  'close feature branch',
  'address any sub-agent warnings'
];

// Generic deliverables manifest patterns
const BOILERPLATE_DELIVERABLES = [
  'strategic directive validated',
  'sub-agent validations complete',
  'sd status updated',
  'phase authorized',
  'prd created and validated',
  'user stories generated',
  'deliverables extracted',
  'bmad validation passed',
  'git branch enforcement verified',
  'all user stories implemented',
  'unit tests written and passing',
  'e2e tests written and passing',
  'documentation generated',
  'code committed to feature branch',
  'sub-agent validation passed',
  'all deliverables verified complete',
  'test coverage validated',
  'documentation quality confirmed',
  'e2e tests mapped to user stories',
  'sd ready for completion'
];

// Generic executive summary patterns
const BOILERPLATE_SUMMARIES = [
  'phase complete for',
  'strategic validation passed',
  'approved for plan phase',
  'prd created and validated',
  'all pre-exec requirements met',
  'exec implementation authorized',
  'implementation complete',
  'all deliverables met',
  'ready for plan verification',
  'verification complete',
  'ready for lead final approval'
];

// Generic key decision patterns
const BOILERPLATE_DECISIONS = [
  'strategic objectives: \\d+ defined',
  'success metrics: \\d+ measurable',
  'risks identified: \\d+',
  'sub-agent verdicts:',
  'prd created:',
  'branch:',
  'repository:',
  'bmad score:',
  'implementation complete:',
  'test coverage:',
  'documentation:',
  'verification status:',
  'quality score:'
];

// Minimum requirements
const MINIMUM_EXECUTIVE_SUMMARY_LENGTH = 100;
// Key decisions length checked via pattern matching, not raw length
// const MINIMUM_KEY_DECISIONS_LENGTH = 50;
const MINIMUM_ACTION_ITEMS_COUNT = 3;

// ============================================
// VALIDATION FUNCTIONS
// ============================================

/**
 * Check if text contains mostly boilerplate patterns
 */
function checkBoilerplateText(text, patterns, threshold = 75) {
  if (!text) return { isBoilerplate: false, percentage: 0, empty: true };

  const normalized = text.toLowerCase();
  const matchingPatterns = patterns.filter(pattern => {
    if (pattern.includes('\\d+')) {
      // Regex pattern
      return new RegExp(pattern, 'i').test(text);
    }
    return normalized.includes(pattern.toLowerCase());
  });

  const percentage = patterns.length > 0
    ? Math.round((matchingPatterns.length / Math.min(patterns.length, 10)) * 100)
    : 0;

  return {
    isBoilerplate: percentage >= threshold,
    percentage,
    matchingCount: matchingPatterns.length,
    totalPatterns: patterns.length
  };
}

/**
 * Check if action items are boilerplate
 */
function checkActionItemsBoilerplate(actionItems) {
  if (!actionItems) return { isBoilerplate: false, percentage: 0, empty: true };

  const normalized = actionItems.toLowerCase();
  const lines = normalized.split('\n').filter(l => l.trim());

  let boilerplateCount = 0;
  for (const line of lines) {
    const isBoilerplate = BOILERPLATE_ACTION_ITEMS.some(bp =>
      line.includes(bp.toLowerCase())
    );
    if (isBoilerplate) boilerplateCount++;
  }

  const percentage = lines.length > 0
    ? Math.round((boilerplateCount / lines.length) * 100)
    : 0;

  return {
    isBoilerplate: percentage >= 75,
    percentage,
    boilerplateCount,
    totalItems: lines.length
  };
}

/**
 * Check if deliverables manifest is boilerplate
 */
function checkDeliverablesBoilerplate(manifest) {
  if (!manifest) return { isBoilerplate: false, percentage: 0, empty: true };

  const normalized = manifest.toLowerCase();
  const lines = normalized.split('\n').filter(l => l.trim());

  let boilerplateCount = 0;
  for (const line of lines) {
    const isBoilerplate = BOILERPLATE_DELIVERABLES.some(bp =>
      line.includes(bp.toLowerCase())
    );
    if (isBoilerplate) boilerplateCount++;
  }

  const percentage = lines.length > 0
    ? Math.round((boilerplateCount / lines.length) * 100)
    : 0;

  return {
    isBoilerplate: percentage >= 75,
    percentage,
    boilerplateCount,
    totalItems: lines.length
  };
}

/**
 * Check for SD-specific content
 */
function checkSDSpecificContent(handoff) {
  const issues = [];
  let score = 100;

  const sdId = handoff.sd_id || 'Unknown';

  // Check if executive_summary mentions SD-specific details
  if (handoff.executive_summary) {
    // Should contain more than just the SD ID
    const summaryWithoutId = handoff.executive_summary.replace(sdId, '');
    const hasSpecificInsights = summaryWithoutId.length > MINIMUM_EXECUTIVE_SUMMARY_LENGTH &&
      !checkBoilerplateText(handoff.executive_summary, BOILERPLATE_SUMMARIES, 50).isBoilerplate;

    if (!hasSpecificInsights) {
      issues.push('executive_summary lacks SD-specific insights');
      score -= 10;
    }
  }

  // Check if key_decisions has actual decisions
  if (handoff.key_decisions) {
    const decisionsCheck = checkBoilerplateText(handoff.key_decisions, BOILERPLATE_DECISIONS, 75);
    if (decisionsCheck.isBoilerplate) {
      issues.push('key_decisions is mostly template placeholders');
      score -= 15;
    }

    // Check for actual decision content vs just metadata
    const hasActualDecisions = handoff.key_decisions.toLowerCase().includes('decided') ||
      handoff.key_decisions.toLowerCase().includes('chose') ||
      handoff.key_decisions.toLowerCase().includes('selected') ||
      handoff.key_decisions.toLowerCase().includes('approved');

    if (!hasActualDecisions) {
      issues.push('key_decisions contains no actual decisions (just metadata)');
      score -= 10;
    }
  }

  // Check known_issues for actual issues vs boilerplate
  if (handoff.known_issues) {
    const isBoilerplate = handoff.known_issues.toLowerCase().includes('no critical issues identified') ||
      handoff.known_issues.toLowerCase().includes('no issues identified') ||
      handoff.known_issues === 'See validation_details for full analysis';

    if (isBoilerplate && !handoff.known_issues.includes('\n')) {
      // Single line boilerplate
      issues.push('known_issues is boilerplate (no actual issues documented)');
      score -= 5;
    }
  }

  return { issues, score };
}

/**
 * Validate handoff content quality
 * @param {Object} handoff - Handoff record from database
 * @returns {Object} Validation result
 */
export function validateHandoffContentQuality(handoff) {
  const issues = [];
  const warnings = [];
  let score = 100;

  const handoffId = handoff.id || 'Unknown';
  const sdId = handoff.sd_id || 'Unknown';

  // ============================================
  // 1. CHECK FOR HANDOFF PRESENCE
  // ============================================
  if (!handoff || Object.keys(handoff).length === 0) {
    issues.push(`${handoffId}: Handoff record is empty or missing`);
    return { handoff_id: handoffId, valid: false, issues, warnings, score: 0, boilerplateDetails: {} };
  }

  // ============================================
  // 2. CHECK ACTION ITEMS
  // ============================================
  const actionItemsCheck = checkActionItemsBoilerplate(handoff.action_items);
  if (actionItemsCheck.empty) {
    issues.push(`${sdId}: No action_items defined`);
    score -= 15;
  } else if (actionItemsCheck.isBoilerplate) {
    issues.push(`${sdId}: action_items are ${actionItemsCheck.percentage}% boilerplate`);
    score -= 20;
  } else if (actionItemsCheck.totalItems < MINIMUM_ACTION_ITEMS_COUNT) {
    warnings.push(`${sdId}: Only ${actionItemsCheck.totalItems} action items (recommend ${MINIMUM_ACTION_ITEMS_COUNT}+)`);
    score -= 5;
  }

  // ============================================
  // 3. CHECK DELIVERABLES MANIFEST
  // ============================================
  const deliverablesCheck = checkDeliverablesBoilerplate(handoff.deliverables_manifest);
  if (deliverablesCheck.empty) {
    issues.push(`${sdId}: No deliverables_manifest defined`);
    score -= 15;
  } else if (deliverablesCheck.isBoilerplate) {
    warnings.push(`${sdId}: deliverables_manifest is ${deliverablesCheck.percentage}% boilerplate`);
    score -= 10;
  }

  // ============================================
  // 4. CHECK EXECUTIVE SUMMARY
  // ============================================
  if (!handoff.executive_summary) {
    issues.push(`${sdId}: No executive_summary defined`);
    score -= 15;
  } else {
    const summaryCheck = checkBoilerplateText(handoff.executive_summary, BOILERPLATE_SUMMARIES, 60);
    if (summaryCheck.isBoilerplate) {
      warnings.push(`${sdId}: executive_summary is mostly template-based`);
      score -= 10;
    }

    if (handoff.executive_summary.length < MINIMUM_EXECUTIVE_SUMMARY_LENGTH) {
      warnings.push(`${sdId}: executive_summary too brief (${handoff.executive_summary.length} chars)`);
      score -= 5;
    }
  }

  // ============================================
  // 5. CHECK KEY DECISIONS
  // ============================================
  if (!handoff.key_decisions) {
    warnings.push(`${sdId}: No key_decisions defined`);
    score -= 10;
  } else {
    const decisionsCheck = checkBoilerplateText(handoff.key_decisions, BOILERPLATE_DECISIONS, 75);
    if (decisionsCheck.isBoilerplate) {
      warnings.push(`${sdId}: key_decisions is mostly metadata (no actual decisions)`);
      score -= 10;
    }
  }

  // ============================================
  // 6. CHECK FOR SD-SPECIFIC CONTENT
  // ============================================
  const sdSpecificCheck = checkSDSpecificContent(handoff);
  if (sdSpecificCheck.issues.length > 0) {
    warnings.push(...sdSpecificCheck.issues.map(i => `${sdId}: ${i}`));
    score = Math.min(score, sdSpecificCheck.score);
  }

  // ============================================
  // 7. CHECK COMPLETENESS REPORT
  // ============================================
  if (!handoff.completeness_report) {
    warnings.push(`${sdId}: No completeness_report defined`);
    score -= 5;
  }

  return {
    handoff_id: handoffId,
    sd_id: sdId,
    valid: issues.length === 0,
    issues,
    warnings,
    score: Math.max(0, score),
    boilerplateDetails: {
      action_items: actionItemsCheck,
      deliverables_manifest: deliverablesCheck,
      has_sd_specific_content: sdSpecificCheck.issues.length === 0
    }
  };
}

/**
 * Validate handoff for quality (used during handoff creation)
 */
export function validateHandoffForQuality(handoff, options = {}) {
  const {
    minimumScore = 60,  // Lower threshold for handoffs since they're generated
    blockOnWarnings = false
  } = options;

  const result = {
    valid: true,
    handoff_id: handoff?.id || 'Unknown',
    sd_id: handoff?.sd_id || 'Unknown',
    score: 0,
    minimumScore,
    issues: [],
    warnings: [],
    qualityDetails: null
  };

  if (!handoff) {
    result.valid = false;
    result.issues.push('Handoff object is null or undefined');
    return result;
  }

  // Run quality validation
  const qualityResult = validateHandoffContentQuality(handoff);
  result.qualityDetails = qualityResult;
  result.score = qualityResult.score;
  result.issues = qualityResult.issues;
  result.warnings = qualityResult.warnings;

  // Check if valid based on issues
  if (qualityResult.issues.length > 0) {
    result.valid = false;
  }

  // Check minimum score
  if (qualityResult.score < minimumScore) {
    result.valid = false;
    result.issues.push(`Handoff quality score (${qualityResult.score}%) is below minimum (${minimumScore}%)`);
  }

  // Check warnings if blocking
  if (blockOnWarnings && qualityResult.warnings.length > 0) {
    result.valid = false;
  }

  // Generate summary
  result.summary = generateValidationSummary(result);

  return result;
}

/**
 * Generate human-readable validation summary
 */
function generateValidationSummary(result) {
  const lines = [];

  lines.push('Handoff Content Quality Validation');
  lines.push(`   SD: ${result.sd_id}`);
  lines.push(`   Score: ${result.score}% (minimum: ${result.minimumScore}%)`);
  lines.push(`   Status: ${result.valid ? 'PASSED' : 'FAILED'}`);

  if (result.qualityDetails?.boilerplateDetails) {
    const bd = result.qualityDetails.boilerplateDetails;
    lines.push('   Analysis:');
    lines.push(`     - Action Items Boilerplate: ${bd.action_items?.percentage || 0}%`);
    lines.push(`     - Deliverables Boilerplate: ${bd.deliverables_manifest?.percentage || 0}%`);
    lines.push(`     - SD-Specific Content: ${bd.has_sd_specific_content ? 'Yes' : 'No'}`);
  }

  if (result.issues.length > 0) {
    lines.push(`   Blocking Issues: ${result.issues.length}`);
  }

  if (result.warnings.length > 0) {
    lines.push(`   Warnings: ${result.warnings.length}`);
  }

  return lines.join('\n');
}

/**
 * Get improvement guidance for handoff content
 */
export function getHandoffImprovementGuidance(validationResult) {
  const guidance = {
    required: [],
    recommended: [],
    timeEstimate: '15-30 minutes',
    instructions: ''
  };

  const boilerplateDetails = validationResult.qualityDetails?.boilerplateDetails;

  // Analyze issues
  if (boilerplateDetails?.action_items?.isBoilerplate) {
    guidance.required.push('Replace generic action_items with SD-specific tasks');
    guidance.required.push('Example: "Implement real-time data sync for Dashboard" instead of "Implement all user stories"');
  }

  if (validationResult.issues.some(i => i.includes('No action_items'))) {
    guidance.required.push('Add specific action items for the next phase');
  }

  if (validationResult.warnings.some(w => w.includes('executive_summary'))) {
    guidance.recommended.push('Add SD-specific insights to executive_summary');
    guidance.recommended.push('Include key technical decisions, risks addressed, and unique aspects');
  }

  if (validationResult.warnings.some(w => w.includes('key_decisions'))) {
    guidance.recommended.push('Document actual decisions made during this phase');
    guidance.recommended.push('Example: "Chose PostgreSQL over MongoDB for data consistency requirements"');
  }

  if (validationResult.warnings.some(w => w.includes('deliverables_manifest'))) {
    guidance.recommended.push('Add SD-specific deliverables to manifest');
    guidance.recommended.push('Reference actual file paths, component names, or API endpoints');
  }

  // Time estimate
  const totalIssues = validationResult.issues.length;
  if (totalIssues <= 2) {
    guidance.timeEstimate = '10-15 minutes';
  } else if (totalIssues <= 5) {
    guidance.timeEstimate = '15-30 minutes';
  } else {
    guidance.timeEstimate = '30-60 minutes';
  }

  guidance.instructions = `Handoff quality score is ${validationResult.score}% (minimum ${validationResult.minimumScore}%). ` +
    'Focus on replacing generic templates with SD-specific content. ' +
    'Each handoff should document unique decisions, risks, and deliverables for this specific SD.';

  return guidance;
}

export default {
  validateHandoffContentQuality,
  validateHandoffForQuality,
  getHandoffImprovementGuidance
};
