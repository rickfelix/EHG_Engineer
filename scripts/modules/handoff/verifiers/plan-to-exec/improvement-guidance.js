/**
 * Improvement Guidance for PLAN-TO-EXEC Verifier
 *
 * Generates specific improvement guidance when handoff is rejected.
 *
 * Extracted from scripts/verify-handoff-plan-to-exec.js for maintainability.
 * Part of SD-LEO-REFACTOR-HANDOFF-001
 */

/**
 * Generate specific improvement guidance based on rejection reason
 *
 * @param {string} reasonCode - Rejection reason code
 * @param {Object} details - Additional details about the rejection
 * @returns {Object} - Guidance with required, actions, timeEstimate, instructions
 */
export function generateImprovementGuidance(reasonCode, details = {}) {
  const guidance = {
    required: [],
    actions: [],
    timeEstimate: '30-60 minutes',
    instructions: ''
  };

  switch (reasonCode) {
    case 'NO_PRD':
      guidance.required = ['Create comprehensive PRD using create-prd-script.js'];
      guidance.actions = ['Run PRD creation script', 'Validate PRD quality', 'Resubmit handoff'];
      guidance.timeEstimate = '2-3 hours';
      guidance.instructions = 'Execute comprehensive PRD creation script and ensure all required fields are completed.';
      break;

    case 'PRD_QUALITY':
      const prdValidation = details.prdValidation;
      guidance.required = prdValidation?.errors || ['Improve PRD quality to meet minimum standards'];
      guidance.actions = [
        'Review PRD validation checklist',
        'Address all validation errors',
        'Enhance functional and technical requirements',
        'Improve acceptance criteria detail'
      ];
      guidance.timeEstimate = '1-2 hours';
      guidance.instructions = `Current PRD score: ${details.actualScore}%. Minimum required: ${details.requiredScore}%. Focus on completing missing fields and enhancing requirement detail.`;
      break;

    case 'PLAN_INCOMPLETE':
      guidance.required = ['Complete PLAN phase activities', 'Update PRD status to approved'];
      guidance.actions = ['Review PLAN checklist', 'Complete outstanding items', 'Update PRD status'];
      guidance.timeEstimate = '45-90 minutes';
      guidance.instructions = 'Complete all PLAN phase checklist items before requesting EXEC handoff.';
      break;

    case 'NO_USER_STORIES':
      guidance.required = ['Generate user stories from PRD via Product Requirements Expert sub-agent'];
      guidance.actions = [
        'Trigger Product Requirements Expert sub-agent',
        'Generate user stories from PRD acceptance criteria',
        'Map user stories to E2E test scenarios',
        'Store user stories in database',
        'Retry PLAN->EXEC handoff'
      ];
      guidance.timeEstimate = '30-45 minutes';
      guidance.instructions = 'User stories are MANDATORY for testing validation. Run Product Requirements Expert to generate user stories from PRD before proceeding to EXEC phase.';
      break;

    case 'USER_STORIES_ERROR':
      guidance.required = ['Fix database access issues for user_stories table'];
      guidance.actions = ['Check database connectivity', 'Verify user_stories table exists', 'Retry handoff'];
      guidance.timeEstimate = '15-20 minutes';
      guidance.instructions = 'Database error accessing user_stories table. Verify table exists and permissions are correct.';
      break;

    case 'USER_STORY_QUALITY':
      // SD-CAPABILITY-LIFECYCLE-001: User story quality gate
      const qualityValidation = details.qualityValidation;
      const qualityImprovements = details.improvements;

      guidance.required = qualityImprovements?.required || ['Improve user story quality to meet minimum standards'];
      guidance.actions = [
        'Review user story quality validation results',
        'Fix stories with boilerplate acceptance criteria',
        'Add specific, testable acceptance criteria (minimum 2 per story)',
        'Use Given-When-Then format for acceptance criteria',
        'Replace generic user_role with specific personas',
        'Ensure user_want describes actual functionality (>=20 chars)',
        'Ensure user_benefit explains value to user (>=15 chars)',
        'Re-run stories-agent to regenerate poor quality stories',
        'Retry PLAN->EXEC handoff'
      ];
      guidance.timeEstimate = qualityImprovements?.timeEstimate || '30-60 minutes';
      guidance.instructions = qualityImprovements?.instructions ||
        `User story quality score is ${qualityValidation?.averageScore || 0}% (minimum 70%). ` +
        `${qualityValidation?.qualityDistribution?.poor || 0} stories scored below 70. ` +
        'Focus on stories with blocking issues first. Use the stories-agent skill for guidance.';
      break;

    case 'PRD_BOILERPLATE':
      // SD-CAPABILITY-LIFECYCLE-001: PRD content quality gate
      const prdQualityValidation = details.qualityValidation;
      const prdImprovements = details.improvements;

      guidance.required = prdImprovements?.required || ['Replace placeholder content in PRD with specific requirements'];
      guidance.actions = [
        'Review PRD boilerplate detection results',
        'Replace "To be defined" with specific functional requirements',
        'Add SD-specific acceptance criteria (not generic "all tests passing")',
        'Define specific test scenarios with inputs and expected outputs',
        'Write a detailed executive summary for this SD',
        'Document implementation approach with specific steps',
        'Add system architecture details',
        'Retry PLAN->EXEC handoff'
      ];
      guidance.timeEstimate = prdImprovements?.timeEstimate || '30-60 minutes';
      guidance.instructions = prdImprovements?.instructions ||
        `PRD content quality score is ${prdQualityValidation?.score || 0}% (minimum 70%). ` +
        'Focus on replacing placeholder text with specific, measurable content unique to this SD.';
      break;

    case 'HANDOFF_INVALID':
      guidance.required = ['Fix handoff document to meet LEO Protocol standards'];
      guidance.actions = ['Review handoff validation errors', 'Update handoff document', 'Ensure all 7 elements present'];
      guidance.timeEstimate = '30-45 minutes';
      guidance.instructions = 'Handoff document must include all 7 required elements per LEO Protocol v4.1.2.';
      break;

    case 'PLAN_PRESENTATION_INVALID':
      const ppValidation = details.planPresentationValidation;
      guidance.required = ppValidation?.errors || ['Add complete plan_presentation to handoff metadata'];
      guidance.actions = [
        'Review plan_presentation template structure in leo_handoff_templates',
        'Add plan_presentation object to handoff metadata',
        'Ensure goal_summary <=300 chars',
        'Include file_scope (create/modify/delete)',
        'Define execution_plan steps',
        'Specify testing_strategy (unit_tests + e2e_tests)',
        'Resubmit handoff'
      ];
      guidance.timeEstimate = '20-30 minutes';
      guidance.instructions = 'PLAN->EXEC handoffs require plan_presentation in metadata per SD-PLAN-PRESENT-001. Include implementation goals, file scope, execution steps, and testing strategy.';
      break;

    case 'WORKFLOW_REVIEW_FAILED':
      const workflowAnalysis = details.workflowAnalysis;
      const requiredActions = details.requiredActions || [];

      guidance.required = requiredActions.map(action =>
        `[${action.priority}] ${action.action}: ${action.rationale}`
      );

      if (guidance.required.length === 0) {
        guidance.required = ['Fix workflow validation issues detected by Design Sub-Agent'];
      }

      // Count issues across all dimensions
      const vr = workflowAnalysis?.validation_results || {};
      const allIssues = [
        ...(vr.dead_ends || []),
        ...(vr.circular_flows || []),
        ...(vr.error_recovery || []),
        ...(vr.loading_states || []),
        ...(vr.confirmations || []),
        ...(vr.form_validation || []),
        ...(vr.state_management || []),
        ...(vr.accessibility || [])
      ];
      const criticalCount = allIssues.filter(i => i.severity === 'CRITICAL').length;
      const highCount = allIssues.filter(i => i.severity === 'HIGH').length;

      guidance.actions = [
        'RECOMMENDED: Use interactive workflow review CLI',
        '   -> node scripts/review-workflow.js <SD-ID>',
        '   -> Human-in-loop iteration with intelligent recommendations',
        '   -> Automatically applies fixes to user stories',
        '   -> Max 3 iterations with re-analysis after each fix',
        '',
        'OR manually fix issues:',
        `   1. Review ${allIssues.length} workflow issue(s) (${criticalCount} CRITICAL, ${highCount} HIGH)`,
        '   2. Update user story acceptance_criteria or implementation_context',
        '   3. Re-run Design Sub-Agent: node scripts/execute-subagent.js --code DESIGN --sd-id <SD-ID> --workflow-review',
        '   4. Retry PLAN->EXEC handoff'
      ];

      const issues = [];
      if (vr.dead_ends?.length > 0) {
        issues.push(`${vr.dead_ends.length} dead ends`);
      }
      if (vr.circular_flows?.length > 0) {
        issues.push(`${vr.circular_flows.length} circular flows`);
      }
      if (criticalCount > 0) {
        issues.push(`${criticalCount} CRITICAL`);
      }
      if (highCount > 0) {
        issues.push(`${highCount} HIGH`);
      }
      if (workflowAnalysis?.ux_impact_score < 6.0) {
        issues.push(`UX score ${workflowAnalysis.ux_impact_score}/10`);
      }

      guidance.timeEstimate = criticalCount > 3 ? '1-2 hours' : '30-60 minutes';
      guidance.instructions = `Workflow validation failed with ${issues.join(', ')}.

RECOMMENDED: node scripts/review-workflow.js <SD-ID>

Interactive tool features:
- Adaptive analysis depth (DEEP/STANDARD/LIGHT based on story risk)
- Pattern learning from existing codebase
- Confidence-based recommendations (>=90%: auto-apply, 60-89%: options, <60%: ask human)
- Direct user story updates in database
- Iterative re-analysis (max 3 rounds)

After iteration complete, retry handoff.`;
      break;

    default:
      guidance.required = ['Address system errors and retry'];
      guidance.actions = ['Check system status', 'Verify database connectivity', 'Retry handoff'];
      guidance.timeEstimate = '15-30 minutes';
      guidance.instructions = 'System error encountered. Check logs and retry handoff verification.';
  }

  return guidance;
}
