/**
 * DESIGN Sub-Agent Workflow Scoring
 * Severity, confidence, and UX impact calculations
 *
 * Extracted from design.js for modularity
 * SD-LEO-REFACTOR-DESIGN-SUB-001
 */

import { getStepCount } from './utils.js';

/**
 * Determine analysis depth for a user story based on complexity and risk
 *
 * Returns DEEP (12 dimensions), STANDARD (8 dimensions), or LIGHT (4 dimensions)
 * based on story characteristics and impact.
 *
 * @param {Object} userStory - User story to analyze
 * @returns {Object} { depth: string, triggers: string[], rationale: string }
 */
export function determineAnalysisDepth(userStory) {
  const triggers = [];
  let depth = 'STANDARD'; // Default

  // Extract story text for pattern matching
  const storyText = [
    userStory.title,
    userStory.user_want,
    userStory.user_benefit,
    userStory.implementation_context,
    (userStory.acceptance_criteria || []).join(' ')
  ].join(' ').toLowerCase();

  // DEEP triggers (high risk/impact operations)

  // Financial transactions (highest risk)
  if (/payment|purchase|checkout|subscribe|billing|refund|transaction/i.test(storyText)) {
    depth = 'DEEP';
    triggers.push('Financial transaction detected');
  }

  // Destructive actions (data loss risk)
  if (/delete|remove|cancel\s+subscription|deactivate\s+account|terminate|purge/i.test(storyText)) {
    depth = 'DEEP';
    triggers.push('Destructive action detected');
  }

  // High complexity (story points)
  if (userStory.story_points && userStory.story_points >= 8) {
    depth = 'DEEP';
    triggers.push(`High complexity (${userStory.story_points} story points)`);
  }

  // First-time user experience (onboarding is critical)
  if (/onboarding|first[- ]time|signup|registration|getting\s+started|welcome/i.test(storyText)) {
    depth = 'DEEP';
    triggers.push('First-time user experience');
  }

  // Multi-step flows (error-prone)
  const stepCount = getStepCount(userStory);
  if (stepCount > 5) {
    depth = 'DEEP';
    triggers.push(`Multi-step flow (${stepCount} steps)`);
  }

  // Authentication/Authorization (security critical)
  if (/login|logout|authenticate|authorize|permission|access\s+control|security/i.test(storyText)) {
    depth = 'DEEP';
    triggers.push('Authentication/authorization flow');
  }

  // Data export/import (compliance risk)
  if (/export|import|download\s+data|backup|restore|migrate/i.test(storyText)) {
    depth = 'DEEP';
    triggers.push('Data export/import operation');
  }

  // LIGHT triggers (low risk/impact operations)
  // Only downgrade to LIGHT if no DEEP triggers exist

  if (depth === 'STANDARD') {
    // Read-only operations
    if (/^(view|display|see|read|show|list|browse)/i.test(userStory.title) &&
        !/edit|modify|change|update/i.test(storyText)) {
      depth = 'LIGHT';
      triggers.push('Read-only operation');
    }

    // Low priority features
    if (userStory.priority === 'low') {
      depth = 'LIGHT';
      triggers.push('Low priority feature');
    }

    // Simple single-step actions
    if (stepCount === 1 && userStory.story_points && userStory.story_points <= 2) {
      depth = 'LIGHT';
      triggers.push('Simple single-step action');
    }
  }

  // Generate rationale
  const rationale = triggers.length > 0
    ? `Analysis depth: ${depth} (${triggers.join(', ')})`
    : `Analysis depth: ${depth} (default)`;

  return {
    depth,
    triggers,
    rationale,
    story_id: userStory.id || userStory.story_key
  };
}

/**
 * Calculate intelligent severity for an issue based on context
 *
 * Uses contextual rules to determine if issue is CRITICAL, HIGH, MEDIUM, LOW, or INFO
 *
 * @param {Object} issue - Issue to score
 * @param {Object} context - Contextual information (story, flow characteristics)
 * @returns {string} Severity level
 */
export function calculateSeverity(issue, context = {}) {
  // CRITICAL: Blocks core functionality, causes data loss, financial risk
  if (issue.type === 'dead_end' && context.isRequiredPath) {
    return 'CRITICAL';
  }

  if (issue.type === 'error_recovery' &&
      context.isFinancialTransaction &&
      context.canLoseData) {
    return 'CRITICAL';
  }

  if (issue.type === 'circular_flow' &&
      !hasEscapePath(issue) &&
      issue.path && issue.path.length > 3) {
    return 'CRITICAL';
  }

  // HIGH: Significant user impact, poor UX, security/privacy concerns
  if (issue.type === 'confirmation' && context.isDestructiveAction) {
    return 'HIGH';
  }

  if (issue.type === 'navigation_regression' && context.hasExternalLinks) {
    return 'HIGH';
  }

  if (issue.type === 'error_recovery' && context.isUserFacingOperation) {
    return 'HIGH';
  }

  // MEDIUM: Usability improvements, edge case handling
  if (issue.type === 'loading_state' && context.expectedLoadTime > 2000) {
    return 'MEDIUM';
  }

  if (issue.type === 'form_validation' && context.formFieldCount > 5) {
    return 'MEDIUM';
  }

  if (issue.type === 'state_management') {
    return 'MEDIUM';
  }

  // LOW: Nice-to-have, minor enhancements
  if (issue.type === 'accessibility' && context.priority !== 'critical') {
    return 'LOW';
  }

  if (issue.type === 'browser_controls') {
    return 'LOW';
  }

  // Default to issue's own severity or MEDIUM
  return issue.severity || 'MEDIUM';
}

/**
 * Check if a circular flow has an escape path
 *
 * @param {Object} issue - Circular flow issue
 * @returns {boolean} True if escape path exists
 */
function hasEscapePath(issue) {
  if (!issue.path || !Array.isArray(issue.path)) {
    return false;
  }

  // Check if any node in the cycle has an exit (Cancel, Back, Close)
  return issue.path.some(nodeId =>
    /cancel|back|close|exit|skip/i.test(nodeId)
  );
}

/**
 * Determine if an issue should be flagged (auto-pass rules)
 *
 * Filters out non-issues based on context to reduce noise.
 *
 * @param {Object} issue - Issue to evaluate
 * @param {Object} context - Contextual information
 * @returns {boolean} True if issue should be reported
 */
export function shouldFlag(issue, context = {}) {
  // Don't flag error recovery for read-only views
  if (issue.type === 'error_recovery' && context.isReadOnly) {
    return false;
  }

  // Don't flag confirmation for non-destructive actions
  if (issue.type === 'confirmation' && !context.isDestructive) {
    return false;
  }

  // Don't flag validation timing for simple forms (<3 fields)
  if (issue.type === 'form_validation' && context.formFieldCount < 3) {
    return false;
  }

  // Don't flag loading states for synchronous operations
  if (issue.type === 'loading_state' && context.isSync) {
    return false;
  }

  // Don't flag accessibility for low priority, read-only content
  if (issue.type === 'accessibility' &&
      context.priority === 'low' &&
      context.isReadOnly) {
    return false;
  }

  // Don't flag state management for single-step flows
  if (issue.type === 'state_management' && context.stepCount <= 2) {
    return false;
  }

  // Don't flag dead ends if they're clearly terminal goal states
  if (issue.type === 'dead_end' &&
      /success|complete|confirmation|thank you|done/i.test(issue.label)) {
    return false;
  }

  // Flag everything else
  return true;
}

/**
 * Build context object for an issue from user story
 *
 * @param {Object} issue - Issue being evaluated
 * @param {Object} userStory - Related user story
 * @returns {Object} Context information
 */
export function getIssueContext(issue, userStory) {
  if (!userStory) {
    return {};
  }

  const storyText = [
    userStory.title,
    userStory.user_want,
    userStory.implementation_context,
    (userStory.acceptance_criteria || []).join(' ')
  ].join(' ').toLowerCase();

  return {
    isFinancialTransaction: /payment|purchase|checkout|billing/i.test(storyText),
    isDestructiveAction: /delete|remove|cancel.*subscription|deactivate/i.test(storyText),
    isReadOnly: /view|display|see|read|show/i.test(userStory.title),
    isUserFacingOperation: !/internal|admin|system/i.test(storyText),
    isRequiredPath: userStory.priority === 'critical' || userStory.priority === 'high',
    hasExternalLinks: /external|seo|bookmark|share/i.test(storyText),
    canLoseData: /form|input|data|save/i.test(storyText),
    isSync: !/async|await|fetch|api|load/i.test(storyText),
    formFieldCount: (storyText.match(/field|input/gi) || []).length,
    stepCount: getStepCount(userStory),
    expectedLoadTime: /slow|large|heavy/i.test(storyText) ? 3000 : 1000,
    priority: userStory.priority
  };
}

/**
 * Calculate confidence score for an issue/recommendation based on codebase patterns
 *
 * Returns confidence from 0.0 to 1.0 based on pattern frequency and context.
 *
 * @param {Object} issue - Issue or recommendation to score
 * @param {Object} codebasePatterns - Discovered patterns from codebase
 * @param {Object} userStory - Related user story
 * @returns {number} Confidence score (0.0 - 1.0)
 */
export function calculateConfidence(issue, codebasePatterns, userStory = null) {
  let confidence = 0.60; // Default medium confidence

  if (!codebasePatterns) {
    return confidence;
  }

  // High confidence (≥0.90): Pattern exists in codebase 10+ times
  if (issue.type === 'error_recovery' && codebasePatterns.error_recovery.length > 0) {
    const pattern = codebasePatterns.error_recovery[0];
    if (pattern.count >= 10) {
      confidence = 0.92;
    } else if (pattern.count >= 5) {
      confidence = 0.80;
    } else if (pattern.count >= 3) {
      confidence = 0.70;
    }
  }

  if (issue.type === 'confirmation' && codebasePatterns.confirmation_modals.length > 0) {
    const pattern = codebasePatterns.confirmation_modals[0];
    if (pattern.count >= 10) {
      confidence = 0.95; // Very high confidence for confirmations
    } else if (pattern.count >= 5) {
      confidence = 0.85;
    } else if (pattern.count >= 3) {
      confidence = 0.75;
    }
  }

  if (issue.type === 'form_validation' && codebasePatterns.form_validation.length > 0) {
    const pattern = codebasePatterns.form_validation[0];
    if (pattern.count >= 10) {
      confidence = 0.90;
    } else if (pattern.count >= 5) {
      confidence = 0.78;
    } else if (pattern.count >= 3) {
      confidence = 0.65;
    }
  }

  if (issue.type === 'loading_state' && codebasePatterns.loading_patterns.length > 0) {
    const pattern = codebasePatterns.loading_patterns[0];
    if (pattern.count >= 10) {
      confidence = 0.88;
    } else if (pattern.count >= 5) {
      confidence = 0.75;
    } else if (pattern.count >= 3) {
      confidence = 0.63;
    }
  }

  // Boost confidence for critical priority stories
  if (userStory && userStory.priority === 'critical') {
    confidence = Math.min(confidence + 0.05, 1.0);
  }

  // Boost confidence for financial transactions (extra important)
  if (userStory) {
    const storyText = [
      userStory.title,
      userStory.user_want
    ].join(' ').toLowerCase();

    if (/payment|checkout|billing/i.test(storyText)) {
      confidence = Math.min(confidence + 0.05, 1.0);
    }
  }

  // Round to 2 decimal places
  return Math.round(confidence * 100) / 100;
}

/**
 * Calculate overall confidence score for workflow analysis
 *
 * @param {Array<Object>} issues - All detected issues
 * @param {Object} codebasePatterns - Pattern analysis results
 * @returns {Object} Confidence metrics
 */
export function calculateOverallConfidenceScore(issues, _codebasePatterns) {
  if (issues.length === 0) {
    return {
      overall: 0.95,
      high_confidence_count: 0,
      medium_confidence_count: 0,
      low_confidence_count: 0
    };
  }

  const confidenceScores = issues
    .filter(i => i.confidence !== undefined)
    .map(i => i.confidence);

  if (confidenceScores.length === 0) {
    return {
      overall: 0.75,
      high_confidence_count: 0,
      medium_confidence_count: 0,
      low_confidence_count: 0
    };
  }

  const avgConfidence = confidenceScores.reduce((sum, c) => sum + c, 0) / confidenceScores.length;

  return {
    overall: Math.round(avgConfidence * 100) / 100,
    high_confidence_count: confidenceScores.filter(c => c >= 0.90).length,
    medium_confidence_count: confidenceScores.filter(c => c >= 0.60 && c < 0.90).length,
    low_confidence_count: confidenceScores.filter(c => c < 0.60).length
  };
}

/**
 * Calculate UX impact score across 4 dimensions
 */
export function calculateUXImpactScore(issues, newWorkflow, currentWorkflow) {
  const dimensions = {
    efficiency: 10,
    learnability: 10,
    satisfaction: 10,
    consistency: 10
  };

  // Efficiency: Penalize added steps
  const stepDelta = newWorkflow.steps.length - (currentWorkflow.steps?.length || 0);
  if (stepDelta > 0) {
    dimensions.efficiency -= Math.min(stepDelta * 0.5, 3);
  } else if (stepDelta < 0) {
    dimensions.efficiency = Math.min(dimensions.efficiency + Math.abs(stepDelta) * 0.3, 10);
  }

  // Learnability: Penalize new patterns
  const newPatterns = newWorkflow.steps.filter(s =>
    !currentWorkflow.steps?.some(cs => cs.toLowerCase().includes(s.action.toLowerCase()))
  );
  dimensions.learnability -= Math.min(newPatterns.length * 0.3, 4);

  // Satisfaction: Penalize dead ends and regressions
  dimensions.satisfaction -= Math.min(issues.deadEnds.length * 2, 5);
  dimensions.satisfaction -= Math.min(issues.regressions.length * 1.5, 3);

  // Consistency: Penalize circular flows
  dimensions.consistency -= Math.min(issues.circularFlows.length * 1.5, 4);

  // Clamp to 0-10 range
  Object.keys(dimensions).forEach(key => {
    dimensions[key] = Math.max(0, Math.min(10, dimensions[key]));
  });

  // Weighted average (efficiency 30%, learnability 20%, satisfaction 30%, consistency 20%)
  const overall = (
    dimensions.efficiency * 0.3 +
    dimensions.learnability * 0.2 +
    dimensions.satisfaction * 0.3 +
    dimensions.consistency * 0.2
  );

  return {
    overall: Math.round(overall * 10) / 10,
    dimensions
  };
}

/**
 * Generate workflow-specific recommendations
 */
export function generateWorkflowRecommendations(issues, uxScore, analysis) {
  const recommendations = [];

  // Critical: Dead ends
  issues.deadEnds.forEach(deadEnd => {
    recommendations.push({
      priority: 'CRITICAL',
      category: 'workflow',
      action: `Add navigation or action button to "${deadEnd.label}" state`,
      rationale: 'Prevents dead end that blocks users from progressing',
      implementation: `Add exit path or "Back" button in ${deadEnd.node_id}`
    });
  });

  // Critical: Circular flows
  issues.circularFlows.forEach((flow, _index) => {
    recommendations.push({
      priority: 'CRITICAL',
      category: 'workflow',
      action: `Break circular flow: ${flow.path.slice(0, 3).join(' → ')}...`,
      rationale: 'Prevents infinite loop that confuses users',
      implementation: 'Add confirmation step or terminal state to exit loop'
    });
  });

  // High: Navigation regressions
  issues.regressions.forEach(regression => {
    recommendations.push({
      priority: 'HIGH',
      category: 'navigation',
      action: regression.recommendation,
      rationale: regression.existing_pattern + ' no longer works',
      implementation: 'Server-side redirect or route preservation'
    });
  });

  // Medium: UX score improvements
  if (uxScore.overall < 7.0 && uxScore.overall >= 6.0) {
    if (uxScore.dimensions.efficiency < 7) {
      recommendations.push({
        priority: 'MEDIUM',
        category: 'ux',
        action: 'Reduce workflow steps or combine related actions',
        rationale: `Efficiency score ${uxScore.dimensions.efficiency}/10 below target`,
        implementation: 'Review workflow delta and consolidate where possible'
      });
    }

    if (uxScore.dimensions.learnability < 7) {
      recommendations.push({
        priority: 'MEDIUM',
        category: 'ux',
        action: 'Add user guidance or tooltips for new patterns',
        rationale: `Learnability score ${uxScore.dimensions.learnability}/10 indicates learning curve`,
        implementation: 'Onboarding tooltips or contextual help for new interactions'
      });
    }
  }

  // Low: Testing
  if (analysis.validation_results.graph_metrics.total_nodes > 5) {
    recommendations.push({
      priority: 'LOW',
      category: 'testing',
      action: 'Add E2E tests covering all workflow paths',
      rationale: 'Complex workflow requires comprehensive test coverage',
      implementation: `Playwright tests for ${analysis.validation_results.graph_metrics.total_nodes} interaction states`
    });
  }

  return recommendations;
}

/**
 * Calculate overall quality score for quality gate
 * Formula: 40% validation + 30% UX score + 20% regressions + 10% tests
 */
export function calculateOverallQualityScore(analysis) {
  const validationScore = analysis.status === 'PASS' ? 1.0 : 0.0;
  const uxScore = analysis.ux_impact_score / 10;
  const regressionScore = analysis.interaction_impact.regressions_detected.length === 0 ? 1.0 : 0.75;
  const testScore = 0.95; // Placeholder - actual test coverage evaluated later

  const overall = (
    validationScore * 0.4 +
    uxScore * 0.3 +
    regressionScore * 0.2 +
    testScore * 0.1
  );

  return Math.round(overall * 100) / 100;
}
