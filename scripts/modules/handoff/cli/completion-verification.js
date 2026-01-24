/**
 * SD Completion Verification
 *
 * Functions for verifying SD completion and finding pending approval SDs.
 * SYSTEMIC FIX (PAT-WF-NEXT-001): Ensures SDs are truly complete before claiming done.
 *
 * Extracted from scripts/handoff.js for maintainability.
 * Part of SD-LEO-REFACTOR-HANDOFF-001
 */

import { createClient } from '@supabase/supabase-js';
import { getSDWorkflow } from './sd-workflow.js';

/**
 * Verify SD completion
 * Checks all required handoffs exist and SD is truly completed
 *
 * @param {string} sdId - SD identifier (UUID, legacy_id, or sd_key)
 * @returns {Promise<Object>} - Completion verification result
 */
export async function verifySDCompletion(sdId) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  // Get SD details (supports UUID and sd_key)
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, status, current_phase, sd_type, intensity_level, category')
    .or(`id.eq.${sdId},sd_key.eq.${sdId}`)
    .single();

  if (sdError || !sd) {
    return { error: `SD not found: ${sdId}`, isComplete: false };
  }

  // Get workflow requirements for this SD type
  const workflowInfo = await getSDWorkflow(sd.sd_key || sd.id);
  const requiredHandoffs = workflowInfo.workflow?.required || [];

  // Get existing handoffs for this SD
  const { data: handoffs } = await supabase
    .from('leo_handoff_executions')
    .select('handoff_type, status, created_at')
    .eq('sd_id', sd.id)
    .eq('status', 'accepted')
    .order('created_at', { ascending: true });

  const existingHandoffs = (handoffs || []).map(h => h.handoff_type.toUpperCase());

  // Check which required handoffs are missing
  const missingHandoffs = requiredHandoffs.filter(
    h => !existingHandoffs.includes(h.toUpperCase())
  );

  // Check if LEAD-FINAL-APPROVAL exists
  const hasFinalApproval = existingHandoffs.includes('LEAD-FINAL-APPROVAL');

  // Determine completion status
  const isComplete = sd.status === 'completed' && missingHandoffs.length === 0 && hasFinalApproval;

  return {
    sd,
    isComplete,
    status: sd.status,
    requiredHandoffs,
    existingHandoffs,
    missingHandoffs,
    hasFinalApproval,
    workflow: workflowInfo.workflow
  };
}

/**
 * Get SDs stuck in pending_approval status
 *
 * @returns {Promise<Object>} - Result with sds array or error
 */
export async function getPendingApprovalSDs() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const { data: sds, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, status, current_phase, sd_type, updated_at')
    .eq('status', 'pending_approval')
    .eq('is_active', true)
    .order('updated_at', { ascending: true });

  if (error) {
    return { error: error.message, sds: [] };
  }

  return { sds: sds || [] };
}

/**
 * Display SDs stuck in pending_approval
 *
 * @param {Object} result - Result from getPendingApprovalSDs
 */
export function displayPendingSDs(result) {
  console.log('');
  console.log('SDs AWAITING FINAL APPROVAL');
  console.log('='.repeat(60));

  if (result.error) {
    console.log(`   Error: ${result.error}`);
    console.log('='.repeat(60));
    return;
  }

  if (result.sds.length === 0) {
    console.log('   [OK] No SDs stuck in pending_approval');
    console.log('='.repeat(60));
    return;
  }

  console.log(`   Found ${result.sds.length} SD(s) awaiting LEAD-FINAL-APPROVAL:`);
  console.log('');

  for (const sd of result.sds) {
    const hoursPending = Math.round((Date.now() - new Date(sd.updated_at).getTime()) / (1000 * 60 * 60));
    console.log(`   ${sd.sd_key || sd.id}`);
    console.log(`      Title: ${sd.title}`);
    console.log(`      Type: ${sd.sd_type || 'unknown'}`);
    console.log(`      Pending: ${hoursPending} hours`);
    console.log(`      Action: node scripts/handoff.js execute LEAD-FINAL-APPROVAL ${sd.sd_key || sd.id}`);
    console.log('');
  }

  console.log('-'.repeat(60));
  console.log('   [!] These SDs are NOT complete until LEAD-FINAL-APPROVAL is run');
  console.log('='.repeat(60));
  console.log('');
}

/**
 * Display completion verification results
 *
 * @param {Object} result - Result from verifySDCompletion
 */
export function displayCompletionVerification(result) {
  console.log('');
  console.log('SD COMPLETION VERIFICATION');
  console.log('='.repeat(60));

  if (result.error) {
    console.log(`   Error: ${result.error}`);
    console.log('='.repeat(60));
    return;
  }

  const { sd, isComplete, status, requiredHandoffs, existingHandoffs, missingHandoffs, hasFinalApproval } = result;

  console.log(`   SD: ${sd.sd_key || sd.id}`);
  console.log(`   Title: ${sd.title}`);
  console.log(`   Status: ${status.toUpperCase()}`);
  console.log('');

  // Status check
  if (status === 'completed') {
    console.log('   [OK] Status Check: COMPLETED');
  } else {
    console.log(`   [X] Status Check: ${status.toUpperCase()} (not completed)`);
  }

  // Final approval check
  if (hasFinalApproval) {
    console.log('   [OK] Final Approval: LEAD-FINAL-APPROVAL executed');
  } else {
    console.log('   [X] Final Approval: LEAD-FINAL-APPROVAL NOT found');
  }

  // Handoff check
  console.log('');
  console.log('   REQUIRED HANDOFFS:');
  for (const handoff of requiredHandoffs) {
    const exists = existingHandoffs.includes(handoff.toUpperCase());
    const icon = exists ? '[OK]' : '[X]';
    console.log(`      ${icon} ${handoff}`);
  }

  if (missingHandoffs.length > 0) {
    console.log('');
    console.log('   [!] MISSING HANDOFFS:');
    for (const missing of missingHandoffs) {
      console.log(`      * ${missing}`);
    }
  }

  // Final verdict
  console.log('');
  console.log('-'.repeat(60));
  if (isComplete) {
    console.log('   VERDICT: SD IS COMPLETE');
    console.log('      You may now claim this SD is done.');
  } else {
    console.log('   VERDICT: SD IS NOT COMPLETE');
    console.log('      DO NOT claim this SD is done!');
    if (!hasFinalApproval) {
      console.log('');
      console.log('   -> NEXT ACTION: Run LEAD-FINAL-APPROVAL');
      console.log(`      node scripts/handoff.js execute LEAD-FINAL-APPROVAL ${sd.sd_key || sd.id}`);
    } else if (missingHandoffs.length > 0) {
      console.log('');
      console.log(`   -> NEXT ACTION: Run ${missingHandoffs[0]}`);
      console.log(`      node scripts/handoff.js execute ${missingHandoffs[0]} ${sd.sd_key || sd.id}`);
    }
  }
  console.log('='.repeat(60));
  console.log('');
}
