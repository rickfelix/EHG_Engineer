/**
 * Recommendation Engine
 *
 * Generates intelligent, actionable recommendations for workflow issues
 * based on issue type, codebase patterns, and user story context.
 *
 * Features:
 * - Dimension-specific recommendations
 * - Pattern-based implementation guidance
 * - Context-aware priority and rationale
 * - Confidence scoring
 *
 * Added: 2025-01-15 (SD-DESIGN-WORKFLOW-REVIEW-001)
 */

/**
 * Generate recommendation for a workflow issue
 *
 * @param {Object} issue - Issue object with type, severity, description, context
 * @param {Object} codebasePatterns - Scanned codebase patterns
 * @param {Object} userStory - Associated user story (optional)
 * @returns {Object} Recommendation with priority, action, rationale, implementation
 */
export function generateRecommendation(issue, codebasePatterns = {}, userStory = null) {
  const dimension = issue.dimension || issue.type;

  switch (dimension) {
    case 'dead_ends':
      return generateDeadEndRecommendation(issue, userStory);

    case 'circular_flows':
      return generateCircularFlowRecommendation(issue, userStory);

    case 'error_recovery':
      return generateErrorRecoveryRecommendation(issue, codebasePatterns, userStory);

    case 'loading_states':
      return generateLoadingStateRecommendation(issue, codebasePatterns, userStory);

    case 'confirmations':
      return generateConfirmationRecommendation(issue, codebasePatterns, userStory);

    case 'form_validation':
      return generateFormValidationRecommendation(issue, codebasePatterns, userStory);

    case 'state_management':
      return generateStateManagementRecommendation(issue, userStory);

    case 'accessibility':
      return generateAccessibilityRecommendation(issue, userStory);

    case 'browser_controls':
      return generateBrowserControlsRecommendation(issue, userStory);

    case 'regressions':
      return generateRegressionRecommendation(issue, userStory);

    default:
      return generateGenericRecommendation(issue, userStory);
  }
}

/**
 * Generate recommendation for dead end issue
 */
function generateDeadEndRecommendation(issue, userStory) {
  const isGoalState = /success|complete|confirmation|thank you/i.test(issue.label || '');

  if (isGoalState) {
    return {
      priority: 'LOW',
      category: 'workflow',
      action: 'Document terminal state',
      rationale: 'This appears to be an intentional terminal state (goal reached)',
      implementation: `Add acceptance criteria: "User sees ${issue.label} and workflow completes"`,
      confidence: 0.85
    };
  }

  return {
    priority: issue.severity || 'HIGH',
    category: 'workflow',
    action: `Add next step or escape path after "${issue.label}"`,
    rationale: 'Dead end prevents user from continuing workflow',
    implementation: userStory
      ? `Update story "${userStory.story_key}": Add "Then user can [action] OR return to [state]" to implementation_context`
      : 'Add continuation path or "Return to X" option',
    confidence: 0.92
  };
}

/**
 * Generate recommendation for circular flow issue
 */
function generateCircularFlowRecommendation(issue, userStory) {
  const hasEscapePath = issue.path?.some(step =>
    /cancel|back|close|exit|skip/i.test(step)
  );

  if (hasEscapePath) {
    return {
      priority: 'MEDIUM',
      category: 'workflow',
      action: 'Add loop termination condition',
      rationale: 'Circular flow detected but escape path exists; add max retry or success condition',
      implementation: 'Add acceptance criteria: "Loop terminates after [condition] OR user clicks Cancel"',
      confidence: 0.78
    };
  }

  return {
    priority: 'CRITICAL',
    category: 'workflow',
    action: 'Break circular flow with escape path or confirmation',
    rationale: 'Infinite loop blocks user progress with no exit',
    implementation: userStory
      ? `Update story "${userStory.story_key}": Add "Cancel" button or "Maximum 3 retries" to acceptance_criteria`
      : 'Add Cancel button or max retry limit to break loop',
    confidence: 0.95
  };
}

/**
 * Generate recommendation for error recovery issue
 */
function generateErrorRecoveryRecommendation(issue, codebasePatterns, userStory) {
  const patterns = codebasePatterns.error_recovery || [];
  const primaryPattern = patterns[0];

  let implementation = 'Add error handling with retry and cancel options';

  if (primaryPattern && primaryPattern.confidence === 'high') {
    implementation = `Use existing ${primaryPattern.pattern} pattern (found ${primaryPattern.count}× in codebase)`;
  } else if (primaryPattern && primaryPattern.confidence === 'medium') {
    implementation = `Consider using ${primaryPattern.pattern} pattern (found ${primaryPattern.count}× in codebase) or add custom error handling`;
  }

  if (userStory) {
    implementation += `\nUpdate story "${userStory.story_key}" acceptance criteria: "On error, show [message] with Retry and Cancel buttons"`;
  }

  return {
    priority: issue.severity || 'HIGH',
    category: 'error_handling',
    action: `Add error recovery for "${issue.label || 'action'}"`,
    rationale: 'Users need ability to retry or cancel on failure',
    implementation,
    confidence: primaryPattern?.confidence === 'high' ? 0.90 : 0.75
  };
}

/**
 * Generate recommendation for loading state issue
 */
function generateLoadingStateRecommendation(issue, codebasePatterns, userStory) {
  const patterns = codebasePatterns.loading_patterns || [];
  const primaryPattern = patterns[0];

  let implementation = 'Add loading indicator (spinner, skeleton, or progress bar)';

  if (primaryPattern && primaryPattern.confidence === 'high') {
    implementation = `Use existing loading pattern from codebase (found ${primaryPattern.count}×): Spinner or Skeleton component`;
  } else if (primaryPattern && primaryPattern.confidence === 'medium') {
    implementation = `Consider existing pattern (found ${primaryPattern.count}×) or add <Spinner /> during async operations`;
  }

  if (userStory) {
    implementation += `\nUpdate story "${userStory.story_key}" acceptance criteria: "Loading indicator shown while fetching data"`;
  }

  return {
    priority: 'MEDIUM',
    category: 'ux',
    action: 'Add loading state indicator',
    rationale: 'Users need visual feedback during async operations',
    implementation,
    confidence: primaryPattern?.confidence === 'high' ? 0.88 : 0.70
  };
}

/**
 * Generate recommendation for confirmation issue
 */
function generateConfirmationRecommendation(issue, codebasePatterns, userStory) {
  const patterns = codebasePatterns.confirmation_modals || [];
  const primaryPattern = patterns[0];

  let implementation = 'Add confirmation dialog before destructive action';

  if (primaryPattern && primaryPattern.confidence === 'high') {
    implementation = `Use existing confirmation pattern (found ${primaryPattern.count}×): AlertDialog or ConfirmDialog component`;
  } else if (primaryPattern && primaryPattern.confidence === 'medium') {
    implementation = `Consider existing pattern (found ${primaryPattern.count}×) or add <AlertDialog> with Confirm/Cancel buttons`;
  }

  if (userStory) {
    implementation += `\nUpdate story "${userStory.story_key}" acceptance criteria: "Confirmation dialog shown with 'Are you sure?' message"`;
  }

  return {
    priority: 'HIGH',
    category: 'safety',
    action: `Add confirmation for "${issue.label || 'destructive action'}"`,
    rationale: 'Prevent accidental data loss or destructive actions',
    implementation,
    confidence: primaryPattern?.confidence === 'high' ? 0.95 : 0.80
  };
}

/**
 * Generate recommendation for form validation issue
 */
function generateFormValidationRecommendation(issue, codebasePatterns, userStory) {
  const patterns = codebasePatterns.form_validation || [];
  const primaryPattern = patterns[0];

  let implementation = 'Specify validation timing: inline (real-time), on-blur, or on-submit';

  if (primaryPattern && primaryPattern.confidence === 'high') {
    implementation = `Use existing validation pattern (found ${primaryPattern.count}×): Likely yup, zod, or react-hook-form`;
    implementation += '\nRecommended: Inline validation for immediate feedback on complex forms';
  } else {
    implementation += '\nRecommended approach:\n';
    implementation += '  - Simple forms (1-3 fields): On-submit validation\n';
    implementation += '  - Complex forms (4+ fields): Inline validation with debounce\n';
    implementation += '  - Email/password: On-blur validation';
  }

  if (userStory) {
    implementation += `\nUpdate story "${userStory.story_key}" acceptance criteria: "Validation shows errors [inline/on-blur/on-submit]"`;
  }

  return {
    priority: 'MEDIUM',
    category: 'ux',
    action: 'Specify form validation timing',
    rationale: 'Consistent validation improves user experience and reduces errors',
    implementation,
    confidence: primaryPattern?.confidence === 'high' ? 0.85 : 0.65
  };
}

/**
 * Generate recommendation for state management issue
 */
function generateStateManagementRecommendation(issue, userStory) {
  const isRefresh = issue.type === 'refresh_behavior';
  const isBackButton = issue.type === 'back_button';

  if (isRefresh) {
    return {
      priority: 'MEDIUM',
      category: 'state_management',
      action: 'Define page refresh behavior for multi-step flow',
      rationale: 'Users may accidentally refresh; define whether state persists or resets',
      implementation: userStory
        ? `Update story "${userStory.story_key}" acceptance criteria: "On refresh, [save progress to session] OR [restart from step 1]"`
        : 'Options: (1) Save progress to sessionStorage, (2) Warn before refresh, (3) Restart flow',
      confidence: 0.70
    };
  }

  if (isBackButton) {
    return {
      priority: 'LOW',
      category: 'state_management',
      action: 'Define browser back/forward button behavior',
      rationale: 'Clarify what happens when user uses browser navigation',
      implementation: userStory
        ? `Update story "${userStory.story_key}" acceptance criteria: "Back button [returns to previous step] OR [exits flow]"`
        : 'Options: (1) Navigate to previous step, (2) Show confirmation, (3) Exit flow',
      confidence: 0.65
    };
  }

  return {
    priority: 'MEDIUM',
    category: 'state_management',
    action: 'Define state persistence strategy',
    rationale: 'Multi-step flows need clear state management',
    implementation: 'Choose: sessionStorage, URL params, or in-memory state',
    confidence: 0.68
  };
}

/**
 * Generate recommendation for accessibility issue
 */
function generateAccessibilityRecommendation(issue, userStory) {
  return {
    priority: 'MEDIUM',
    category: 'accessibility',
    action: 'Add keyboard navigation support',
    rationale: 'Interactive elements must be accessible via keyboard for WCAG compliance',
    implementation: userStory
      ? `Update story "${userStory.story_key}" acceptance criteria: "All interactive elements accessible via Tab/Enter/Escape keys"`
      : 'Ensure: (1) Tab order logical, (2) Enter activates buttons, (3) Escape closes modals, (4) Focus visible',
    confidence: 0.75
  };
}

/**
 * Generate recommendation for browser controls issue
 */
function generateBrowserControlsRecommendation(issue, userStory) {
  return {
    priority: 'LOW',
    category: 'ux',
    action: 'Define browser controls behavior (back/forward/refresh)',
    rationale: 'Clarify expected behavior when user uses browser controls',
    implementation: userStory
      ? `Update story "${userStory.story_key}" acceptance criteria: "Browser back button [returns to previous page] with [saved/unsaved] state"`
      : 'Document: (1) Back button behavior, (2) Forward button behavior, (3) Refresh behavior',
    confidence: 0.60
  };
}

/**
 * Generate recommendation for regression issue
 */
function generateRegressionRecommendation(issue, userStory) {
  const isNavigationRegression = issue.type === 'navigation_pattern';

  if (isNavigationRegression) {
    return {
      priority: 'HIGH',
      category: 'migration',
      action: `Add redirect: ${issue.existing_pattern} → ${issue.new_pattern}`,
      rationale: `Preserve ${issue.affected_users} experience`,
      implementation: 'Add server-side redirect or client-side route redirect in router config',
      confidence: 0.92
    };
  }

  return {
    priority: 'HIGH',
    category: 'regression',
    action: 'Mitigate detected regression',
    rationale: issue.description || 'Prevent breaking existing user workflows',
    implementation: issue.recommendation || 'Add compatibility layer or migration path',
    confidence: 0.80
  };
}

/**
 * Generate generic recommendation (fallback)
 */
function generateGenericRecommendation(issue, userStory) {
  return {
    priority: issue.severity || 'MEDIUM',
    category: 'workflow',
    action: issue.recommendation || 'Review and address workflow issue',
    rationale: issue.description || 'Workflow improvement needed',
    implementation: userStory
      ? `Update story "${userStory.story_key}" to address: ${issue.description}`
      : 'Review user story and add missing specification',
    confidence: 0.60
  };
}

/**
 * Generate multiple recommendations for an issue (alternative approaches)
 *
 * @param {Object} issue - Issue object
 * @param {Object} codebasePatterns - Scanned codebase patterns
 * @param {Object} userStory - Associated user story
 * @returns {Array<Object>} Array of recommendations (primary + alternatives)
 */
export function generateRecommendations(issue, codebasePatterns = {}, userStory = null) {
  const recommendations = [];

  // Always generate primary recommendation
  const primary = generateRecommendation(issue, codebasePatterns, userStory);
  primary.is_primary = true;
  recommendations.push(primary);

  // Generate alternatives for specific issue types
  const dimension = issue.dimension || issue.type;

  if (dimension === 'error_recovery') {
    // Alternative: Inline error message instead of modal
    recommendations.push({
      priority: 'MEDIUM',
      category: 'error_handling',
      action: 'Show inline error message',
      rationale: 'Alternative to modal: less intrusive for minor errors',
      implementation: 'Add error text below form field or action button',
      confidence: 0.70,
      is_alternative: true
    });
  }

  if (dimension === 'confirmations') {
    // Alternative: Undo action instead of confirmation
    recommendations.push({
      priority: 'MEDIUM',
      category: 'safety',
      action: 'Add undo functionality',
      rationale: 'Alternative to confirmation: allow undo within 5 seconds',
      implementation: 'Show toast with "Undo" button after action',
      confidence: 0.75,
      is_alternative: true
    });
  }

  if (dimension === 'state_management' && issue.type === 'refresh_behavior') {
    // Alternative: Warn user instead of saving state
    recommendations.push({
      priority: 'LOW',
      category: 'state_management',
      action: 'Add beforeunload warning',
      rationale: 'Alternative to state persistence: warn user before refresh',
      implementation: 'Add window.onbeforeunload handler: "Progress will be lost"',
      confidence: 0.68,
      is_alternative: true
    });
  }

  return recommendations;
}

/**
 * Rank recommendations by priority and confidence
 *
 * @param {Array<Object>} recommendations - Array of recommendations
 * @returns {Array<Object>} Sorted recommendations (highest priority/confidence first)
 */
export function rankRecommendations(recommendations) {
  const priorityOrder = {
    'CRITICAL': 4,
    'HIGH': 3,
    'MEDIUM': 2,
    'LOW': 1
  };

  return recommendations.sort((a, b) => {
    // Primary recommendations before alternatives
    if (a.is_primary && !b.is_primary) return -1;
    if (!a.is_primary && b.is_primary) return 1;

    // Sort by priority
    const priorityDiff = (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
    if (priorityDiff !== 0) return priorityDiff;

    // Sort by confidence
    return (b.confidence || 0) - (a.confidence || 0);
  });
}
