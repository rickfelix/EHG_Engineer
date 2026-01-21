/**
 * Handoff Execution Operations
 * Create handoff records and rejection handling
 *
 * Extracted from verify-handoff-lead-to-plan.js for modularity
 * SD-LEO-REFACTOR-VERIFY-L2P-001
 */

/**
 * Create handoff execution record
 * @param {Object} supabase - Supabase client
 * @param {Object} sd - Strategic Directive data
 * @param {Object} template - Handoff template
 * @param {Object} sdValidation - SD validation result
 * @param {Object|null} handoffValidation - Handoff document validation result
 * @returns {Promise<Object>} Created execution record
 */
export async function createHandoffExecution(supabase, sd, template, sdValidation, handoffValidation) {
  const executionId = `PLAN-${sd.id}-${Date.now()}`;

  const execution = {
    id: executionId,
    template_id: template?.id,
    from_agent: 'LEAD',
    to_agent: 'PLAN',
    sd_id: sd.id,
    handoff_type: 'LEAD-to-PLAN',
    status: 'accepted',

    executive_summary: sd.description?.substring(0, 200) + '...',

    validation_score: sdValidation.percentage,
    validation_passed: true,
    validation_details: {
      sd_validation: sdValidation,
      handoff_validation: handoffValidation,
      verified_at: new Date().toISOString(),
      verifier: 'verify-handoff-lead-to-plan.js'
    },

    completed_at: new Date().toISOString(),
    created_by: 'LEAD-PLAN-VERIFIER'
  };

  try {
    await supabase.from('sd_phase_handoffs').insert(execution);
    console.log(`📝 Handoff execution recorded: ${executionId}`);
  } catch (storeError) {
    console.warn('⚠️  Could not store handoff execution:', storeError.message);
  }

  return execution;
}

/**
 * Reject handoff and provide improvement guidance
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - Strategic Directive ID
 * @param {string} reasonCode - Rejection reason code
 * @param {string} message - Rejection message
 * @param {Object} details - Additional details
 * @returns {Promise<Object>} Rejection result
 */
export async function rejectHandoff(supabase, sdId, reasonCode, message, details = {}) {
  console.log('\n❌ HANDOFF REJECTED');
  console.log('='.repeat(50));
  console.log(`Reason: ${reasonCode}`);
  console.log(`Message: ${message}`);

  const rejection = {
    id: `REJ-${sdId}-${Date.now()}`,
    sd_id: sdId,
    reason_code: reasonCode,
    rejection_reason: message,
    rejected_by: 'LEAD-PLAN-VERIFIER',
    return_to_agent: 'LEAD',
    details
  };

  const improvements = generateImprovementGuidance(reasonCode, details);
  rejection.required_improvements = improvements.required;
  rejection.recommended_actions = improvements.actions;
  rejection.estimated_fix_time = improvements.timeEstimate;
  rejection.retry_instructions = improvements.instructions;

  try {
    await supabase.from('leo_handoff_rejections').insert(rejection);
    console.log(`📝 Rejection recorded: ${rejection.id}`);
  } catch (rejError) {
    console.warn('⚠️  Could not store rejection:', rejError.message);
  }

  console.log('\n🔧 REQUIRED IMPROVEMENTS');
  console.log('-'.repeat(30));
  improvements.required.forEach(item => console.log(`• ${item}`));

  console.log('\n📋 RECOMMENDED ACTIONS');
  console.log('-'.repeat(30));
  improvements.actions.forEach(item => console.log(`• ${item}`));

  console.log(`\n⏰ Estimated Fix Time: ${improvements.timeEstimate}`);
  console.log(`\n📝 Instructions: ${improvements.instructions}`);

  return {
    success: false,
    rejected: true,
    reasonCode,
    message,
    rejectionId: rejection.id,
    improvements
  };
}

/**
 * Generate specific improvement guidance based on rejection reason
 * @param {string} reasonCode - Rejection reason code
 * @param {Object} details - Rejection details
 * @returns {Object} Improvement guidance
 */
export function generateImprovementGuidance(reasonCode, details) {
  const guidance = {
    required: [],
    actions: [],
    timeEstimate: '45-90 minutes',
    instructions: ''
  };

  switch (reasonCode) {
    case 'SD_INCOMPLETE':
      const sdValidation = details.sdValidation;
      guidance.required = sdValidation?.errors || ['Complete Strategic Directive required fields'];
      guidance.actions = [
        'Review SD validation checklist',
        'Enhance business objectives detail',
        'Add measurable success metrics',
        'Complete constraints and risk analysis'
      ];
      guidance.timeEstimate = '2-3 hours';
      guidance.instructions = `Current SD score: ${details.actualScore}%. Minimum required: ${details.requiredScore}%. Focus on business objectives and success metrics.`;
      break;

    case 'SD_STATUS':
      guidance.required = ['Update Strategic Directive status to active or approved'];
      guidance.actions = ['Review SD content', 'Finalize strategic direction', 'Update status to active'];
      guidance.timeEstimate = '30-60 minutes';
      guidance.instructions = 'Strategic Directive must be approved before technical planning can begin.';
      break;

    case 'FEASIBILITY':
      guidance.required = details.feasibilityIssues || ['Address feasibility concerns'];
      guidance.actions = ['Review timeline constraints', 'Add risk mitigation strategies', 'Validate priority alignment'];
      guidance.timeEstimate = '1-2 hours';
      guidance.instructions = 'Ensure strategic directive is realistic and achievable within constraints.';
      break;

    case 'ENV_NOT_READY':
      guidance.required = details.envIssues || ['Fix development environment issues'];
      guidance.actions = ['Check database connectivity', 'Verify filesystem access', 'Create required directories'];
      guidance.timeEstimate = '30-45 minutes';
      guidance.instructions = 'Development environment must be ready before planning phase can begin.';
      break;

    case 'HANDOFF_INVALID':
      guidance.required = ['Fix handoff document to meet LEO Protocol standards'];
      guidance.actions = ['Review handoff validation errors', 'Update handoff document', 'Ensure all 7 elements present'];
      guidance.timeEstimate = '30-45 minutes';
      guidance.instructions = 'Handoff document must include all 7 required elements per LEO Protocol v4.1.2.';
      break;

    default:
      guidance.required = ['Address system errors and retry'];
      guidance.actions = ['Check system status', 'Verify database connectivity', 'Retry handoff'];
      guidance.timeEstimate = '15-30 minutes';
      guidance.instructions = 'System error encountered. Check logs and retry handoff verification.';
  }

  return guidance;
}

/**
 * Update SD status after successful handoff
 * @param {Object} supabase - Supabase client
 * @param {Object} sd - Strategic Directive data
 * @param {Object} sdValidation - Validation result
 * @param {Object} options - Additional options (orchestrator flags, etc.)
 */
export async function updateSdStatusAfterHandoff(supabase, sd, sdValidation, options = {}) {
  const metadata = {
    ...sd.metadata,
    handoff_to_plan: {
      verified_at: new Date().toISOString(),
      quality_score: sdValidation.percentage,
      verifier: 'verify-handoff-lead-to-plan.js',
      ...options.handoffMetadata
    }
  };

  if (options.isParent) {
    metadata.is_parent = true;
  }

  await supabase
    .from('strategic_directives_v2')
    .update({
      status: 'active',
      phase: 'PLAN',
      updated_at: new Date().toISOString(),
      metadata
    })
    .eq('id', sd.id);
}
