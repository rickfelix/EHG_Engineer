/**
 * Improvement Guidance for LEAD-TO-PLAN Verifier
 *
 * Generates specific improvement guidance when handoff is rejected.
 * Enhanced with Task tool invocations (SD-LEO-INFRA-ACTIONABLE-REJECTION-TEMPLATES-001)
 *
 * Delegates to centralized rejection-subagent-mapping.js for Task tool invocations.
 * Preserves structured return shape: { required, actions, timeEstimate, instructions }
 */

import { getRemediation as getMappedRemediation } from '../../rejection-subagent-mapping.js';

/**
 * Append Task tool invocation from centralized mapping to instructions.
 * @param {string} instructions - Base instructions
 * @param {string} reasonCode - Rejection code
 * @param {Object} context - { sdId, gateName, details, score }
 * @returns {string} Instructions with Task invocation appended
 */
function appendTaskInvocation(instructions, reasonCode, context) {
  const mapped = getMappedRemediation(reasonCode, context);
  if (mapped && mapped.subagentType) {
    return instructions + '\n\n' + mapped.message;
  }
  return instructions;
}

/**
 * Generate specific improvement guidance based on rejection reason
 *
 * @param {string} reasonCode - Rejection reason code
 * @param {Object} details - Additional details about the rejection
 * @returns {Object} - Guidance with required, actions, timeEstimate, instructions
 */
export function generateImprovementGuidance(reasonCode, details = {}) {
  const context = { sdId: details.sdId || 'unknown', gateName: reasonCode, details };
  const guidance = {
    required: [],
    actions: [],
    timeEstimate: '45-90 minutes',
    instructions: ''
  };

  switch (reasonCode) {
    case 'SD_INCOMPLETE': {
      const sdValidation = details.sdValidation;
      guidance.required = sdValidation?.errors || ['Complete Strategic Directive required fields'];
      guidance.actions = [
        'Review SD validation checklist',
        'Enhance business objectives detail',
        'Add measurable success metrics',
        'Complete constraints and risk analysis'
      ];
      guidance.timeEstimate = '2-3 hours';
      guidance.instructions = appendTaskInvocation(
        `Current SD score: ${details.actualScore}%. Minimum required: ${details.requiredScore}%. Focus on business objectives and success metrics.`,
        reasonCode, context
      );
      break;
    }

    case 'SD_STATUS':
      guidance.required = ['Update Strategic Directive status to active or approved'];
      guidance.actions = ['Review SD content', 'Finalize strategic direction', 'Update status to active'];
      guidance.timeEstimate = '30-60 minutes';
      guidance.instructions = appendTaskInvocation(
        'Strategic Directive must be approved before technical planning can begin.',
        reasonCode, context
      );
      break;

    case 'FEASIBILITY':
      guidance.required = details.feasibilityIssues || ['Address feasibility concerns'];
      guidance.actions = ['Review timeline constraints', 'Add risk mitigation strategies', 'Validate priority alignment'];
      guidance.timeEstimate = '1-2 hours';
      guidance.instructions = appendTaskInvocation(
        'Ensure strategic directive is realistic and achievable within constraints.',
        reasonCode, context
      );
      break;

    case 'ENV_NOT_READY':
      guidance.required = details.envIssues || ['Fix development environment issues'];
      guidance.actions = ['Check database connectivity', 'Verify filesystem access', 'Create required directories'];
      guidance.timeEstimate = '30-45 minutes';
      guidance.instructions = appendTaskInvocation(
        'Development environment must be ready before planning phase can begin.',
        reasonCode, context
      );
      break;

    case 'HANDOFF_INVALID':
      guidance.required = ['Fix handoff document to meet LEO Protocol standards'];
      guidance.actions = ['Review handoff validation errors', 'Update handoff document', 'Ensure all 7 elements present'];
      guidance.timeEstimate = '30-45 minutes';
      guidance.instructions = appendTaskInvocation(
        'Handoff document must include all 7 required elements per LEO Protocol v4.1.2.',
        reasonCode, context
      );
      break;

    default:
      guidance.required = ['Address system errors and retry'];
      guidance.actions = ['Check system status', 'Verify database connectivity', 'Retry handoff'];
      guidance.timeEstimate = '15-30 minutes';
      guidance.instructions = appendTaskInvocation(
        'System error encountered. Check logs and retry handoff verification.',
        reasonCode, context
      );
  }

  return guidance;
}
