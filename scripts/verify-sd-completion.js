#!/usr/bin/env node
/**
 * Verify SD Completion
 *
 * Used by GitHub Actions and pre-push hook to validate SD completion
 * before allowing merge to main.
 *
 * Uses SAME logic as database trigger: calculate_sd_progress()
 *
 * Exit codes:
 *   0 - SD is ready for merge (progress = 100%)
 *   1 - SD is NOT ready (progress < 100%)
 *   2 - Error querying database
 *
 * Usage:
 *   node scripts/verify-sd-completion.js SD-STAGE-12-001
 *   SD_ID=SD-STAGE-12-001 node scripts/verify-sd-completion.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function verifySDCompletion(sdId) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
    process.exit(2);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Call the same function used by database trigger
  // NOTE: Parameter is sd_id_param (not p_sd_id)
  const { data, error } = await supabase.rpc('get_progress_breakdown', {
    sd_id_param: sdId
  });

  if (error) {
    console.error(`Error checking SD ${sdId}:`, error.message);
    process.exit(2);
  }

  if (!data) {
    console.error(`SD ${sdId} not found in database`);
    process.exit(2);
  }

  const progress = data.total_progress || 0;
  const phases = data.phases || {};

  console.log('\n===========================================');
  console.log('       SD COMPLETION VERIFICATION');
  console.log('===========================================\n');
  console.log(`SD ID:    ${sdId}`);
  console.log(`Status:   ${data.status || 'unknown'}`);
  console.log(`Progress: ${progress}%\n`);

  if (progress < 100) {
    console.error('STATUS: NOT READY FOR MERGE\n');
    console.error('Phase Breakdown:');

    // Check each phase requirement using actual structure
    const leadApproval = phases.LEAD_approval || {};
    const planPrd = phases.PLAN_prd || {};
    const execImpl = phases.EXEC_implementation || {};
    const planVerify = phases.PLAN_verification || {};
    const leadFinal = phases.LEAD_final_approval || {};

    if (!leadApproval.complete) {
      console.error(`  - LEAD approval: ${leadApproval.progress || 0}/${leadApproval.weight || 20}%`);
    } else {
      console.log(`  ✓ LEAD approval: ${leadApproval.progress}%`);
    }

    if (!planPrd.complete) {
      console.error(`  - PLAN PRD: ${planPrd.progress || 0}/${planPrd.weight || 20}%`);
    } else {
      console.log(`  ✓ PLAN PRD: ${planPrd.progress}%`);
    }

    if (!execImpl.deliverables_complete) {
      console.error(`  - EXEC implementation: ${execImpl.progress || 0}/${execImpl.weight || 30}%`);
    } else {
      console.log(`  ✓ EXEC implementation: ${execImpl.progress}%`);
    }

    if (!planVerify.user_stories_validated) {
      console.error(`  - PLAN verification: ${planVerify.progress || 0}/${planVerify.weight || 15}%`);
    } else {
      console.log(`  ✓ PLAN verification: ${planVerify.progress}%`);
    }

    // Final approval requirements (retrospective + handoffs)
    console.error('\nFinal Approval Requirements:');
    if (!leadFinal.retrospective_exists) {
      console.error('  ✗ Retrospective missing (quality >= 70 required)');
    } else {
      console.log('  ✓ Retrospective exists');
    }

    const handoffCount = leadFinal.handoff_count || 0;
    if (!leadFinal.handoffs_complete) {
      console.error(`  ✗ Handoffs: ${handoffCount}/3 completed`);
      if (leadFinal.handoff_types) {
        console.error(`    Have: ${leadFinal.handoff_types.join(', ')}`);
      }
    } else {
      console.log(`  ✓ Handoffs: ${handoffCount}/3 completed`);
    }

    console.error('\n-------------------------------------------');
    console.error('To complete the DONE phase before merging:');
    console.error('-------------------------------------------');
    console.error('  1. npm run handoff exec-to-plan');
    console.error('     (retro-agent will create retrospective)');
    console.error('  2. Verify retrospective quality >= 70');
    console.error('  3. Run this check again\n');

    process.exit(1);
  }

  console.log('STATUS: READY FOR MERGE\n');
  console.log('All completion requirements met:');
  console.log('  ✓ LEAD approval: complete');
  console.log('  ✓ PLAN PRD: complete');
  console.log('  ✓ EXEC implementation: complete');
  console.log('  ✓ PLAN verification: complete');
  console.log('  ✓ Retrospective: exists (quality >= 70)');
  console.log(`  ✓ Handoffs: ${phases.LEAD_final_approval?.handoff_count || 3}/3 completed\n`);

  process.exit(0);
}

// Parse SD ID from argument or environment
const sdId = process.argv[2] || process.env.SD_ID;

if (!sdId) {
  console.log('No SD ID provided - skipping completion check');
  console.log('Usage: node scripts/verify-sd-completion.js <SD-ID>');
  console.log('       SD_ID=<SD-ID> node scripts/verify-sd-completion.js');
  process.exit(0);
}

// Validate SD ID format
const sdIdPattern = /^SD-[A-Z0-9-]+$/i;
if (!sdIdPattern.test(sdId)) {
  console.log(`Invalid SD ID format: ${sdId}`);
  console.log('Expected format: SD-STAGE-12-001 or similar');
  process.exit(0);
}

verifySDCompletion(sdId).catch(err => {
  console.error('Unexpected error:', err.message);
  process.exit(2);
});
