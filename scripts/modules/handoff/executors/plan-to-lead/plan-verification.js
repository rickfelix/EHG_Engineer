/**
 * Plan Verification for PLAN-TO-LEAD Handoff
 * Part of SD-LEO-REFACTOR-PLANTOLEAD-001
 *
 * Validates PLAN verification completeness
 * SD-LEO-FIX-COMPLETION-WORKFLOW-001: Use centralized SD type policy
 */

import { isLightweightSDType } from '../../validation/sd-type-applicability-policy.js';

/**
 * Validate PLAN verification completeness
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} prd - PRD object
 * @param {Object} sd - Strategic Directive object
 * @returns {Object} Validation result
 */
export async function validatePlanVerification(supabase, prd, sd) {
  const validation = {
    complete: false,
    score: 0,
    issues: [],
    warnings: []
  };

  // PARENT SD DETECTION
  const { data: childSDs } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, status')
    .eq('parent_sd_id', sd.id);

  const isParentSD = childSDs && childSDs.length > 0;
  const allChildrenComplete = isParentSD && childSDs.every(c => c.status === 'completed');

  // Parent SD with all children complete uses modified validation
  if (isParentSD && allChildrenComplete) {
    return validateParentSDCompletion(supabase, prd, childSDs, validation);
  }

  // STANDARD VALIDATION
  return validateStandardSDCompletion(supabase, prd, sd, validation);
}

/**
 * Validate parent SD completion
 */
async function validateParentSDCompletion(supabase, prd, childSDs, validation) {
  console.log(`   ℹ️  Parent orchestrator SD: ${childSDs.length} children, all completed`);
  console.log('   📝 Using modified validation (children completion = EXEC complete)');

  // PRD status check (relaxed for parent SDs)
  if (prd.status === 'verification' || prd.status === 'completed' || prd.status === 'in_progress') {
    validation.score += 30;
  } else {
    validation.issues.push(`PRD status is '${prd.status}', expected 'verification', 'completed', or 'in_progress' for parent SD`);
  }

  // Children completion substitutes for EXEC-TO-PLAN
  validation.score += 40;
  validation.warnings.push(`Parent SD: ${childSDs.length} completed children substitutes for EXEC-TO-PLAN`);

  // User stories check (may not have any if work is in children)
  const { data: userStories } = await supabase
    .from('user_stories')
    .select('id, status')
    .eq('prd_id', prd.id);

  if (!userStories || userStories.length === 0) {
    validation.score += 30;
    validation.warnings.push('Parent SD has no direct user stories (work tracked via children)');
  } else {
    const completedStories = userStories.filter(s =>
      s.status === 'completed' || s.status === 'validated'
    );
    if (completedStories.length === userStories.length) {
      validation.score += 30;
    } else {
      validation.warnings.push(`${completedStories.length}/${userStories.length} user stories completed`);
      validation.score += Math.round(30 * (completedStories.length / userStories.length));
    }
  }

  validation.complete = validation.score >= 70;
  return validation;
}

/**
 * Validate standard SD completion
 */
async function validateStandardSDCompletion(supabase, prd, sd, validation) {
  // SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-080: Track component scores for breakdown output
  let prdScore = 0, handoffScore = 0, storiesScore = 0;

  // Check PRD status
  // SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-094: Accept 'in_progress' alongside 'verification'/'completed'.
  // PLAN-TO-EXEC state transitions set PRD to 'in_progress', and this status persists through EXEC.
  // Rejecting it here creates a circular failure where the handoff that set it blocks the next handoff.
  if (prd.status === 'verification' || prd.status === 'completed' || prd.status === 'in_progress') {
    validation.score += 30;
    prdScore = 30;
  } else {
    validation.issues.push(`PRD status is '${prd.status}', expected 'verification', 'completed', or 'in_progress'`);
  }

  // Check EXEC→PLAN handoff exists (or skip for lightweight SDs)
  // SD-LEO-FIX-COMPLETION-WORKFLOW-001: Use centralized SD type policy
  const sdType = (sd.sd_type || '').toLowerCase();

  if (isLightweightSDType(sdType)) {
    validation.score += 40;
    handoffScore = 40;
    validation.warnings.push(`Infrastructure SD: EXEC-TO-PLAN is OPTIONAL (sd_type='${sdType}')`);
  } else {
    const { data: execHandoff } = await supabase
      .from('sd_phase_handoffs')
      .select('id, status')
      .eq('sd_id', sd.id)
      .eq('handoff_type', 'EXEC-TO-PLAN')
      .order('created_at', { ascending: false })
      .limit(1);

    if (execHandoff && execHandoff.length > 0) {
      validation.score += 40;
      handoffScore = 40;
    } else {
      validation.issues.push('No EXEC→PLAN handoff found');
    }
  }

  // Check user stories validation
  const { data: userStories } = await supabase
    .from('user_stories')
    .select('id, status')
    .eq('prd_id', prd.id);

  if (userStories && userStories.length > 0) {
    const completedStories = userStories.filter(s =>
      s.status === 'completed' || s.status === 'validated'
    );
    if (completedStories.length === userStories.length) {
      validation.score += 30;
      storiesScore = 30;
    } else {
      validation.warnings.push(`${completedStories.length}/${userStories.length} user stories completed`);
      storiesScore = Math.round(30 * (completedStories.length / userStories.length));
      validation.score += storiesScore;
    }
  }

  // SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-080: Show component score breakdown
  console.log('   📊 Plan Verification Breakdown:');
  console.log(`      PRD status:    ${prdScore}/30 ${prdScore === 30 ? '✅' : '❌'}`);
  console.log(`      EXEC handoff:  ${handoffScore}/40 ${handoffScore === 40 ? '✅' : isLightweightSDType(sdType) ? '(N/A - infra)' : '❌'}`);
  console.log(`      User stories:  ${storiesScore}/30 ${storiesScore === 30 ? '✅' : `(${userStories?.length || 0} total)`}`);
  console.log(`      Total:         ${validation.score}/100 (threshold: 70)`);

  validation.complete = validation.score >= 70;
  return validation;
}
