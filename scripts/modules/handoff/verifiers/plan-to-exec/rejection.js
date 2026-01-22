/**
 * Rejection Handler for PLAN-TO-EXEC Verifier
 *
 * Handles rejection of handoffs with improvement guidance.
 *
 * Extracted from PlanToExecVerifier.js for maintainability.
 * Part of SD-LEO-REFACTOR-HANDOFF-001
 */

import { generateImprovementGuidance } from './improvement-guidance.js';

/**
 * Reject handoff and provide improvement guidance
 *
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
    rejected_by: 'PLAN-EXEC-VERIFIER',
    return_to_agent: 'PLAN',
    details
  };

  // Provide specific improvement guidance based on reason
  const improvements = generateImprovementGuidance(reasonCode, details);
  rejection.required_improvements = improvements.required;
  rejection.recommended_actions = improvements.actions;
  rejection.estimated_fix_time = improvements.timeEstimate;
  rejection.retry_instructions = improvements.instructions;

  // Store rejection record
  try {
    await supabase.from('leo_handoff_rejections').insert(rejection);
    console.log(`📝 Rejection recorded: ${rejection.id}`);
  } catch (error) {
    console.warn('⚠️  Could not store rejection:', error.message);
  }

  // Display improvement guidance
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
