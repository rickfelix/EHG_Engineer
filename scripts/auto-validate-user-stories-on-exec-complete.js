#!/usr/bin/env node
/**
 * Auto-Validate User Stories on EXEC Completion
 *
 * **ROOT CAUSE FIX**: SD-TEST-MOCK-001 revealed that user stories were never
 * validated after EXEC completion, blocking PLAN_verification at 0% progress
 * despite all deliverables being complete.
 *
 * **PREVENTION**: This script performs TWO promotions at EXEC-TO-PLAN, in order:
 * 1. status='ready' → status='completed' when all sd_scope_deliverables are completed
 * 2. validation_status='pending' → 'validated' for stories that are status='completed'
 *
 * Both transitions are universally required at EXEC-TO-PLAN. Sampled feature SDs at
 * handoff (POST-LAUNCH-001, VISUAL-ASSETS-001, ARTIFACT-INTEGRATION-001, VISION-V2-006,
 * E2E-VENTURE-LIFECYCLE-003) all show stories ending in status=completed+validated.
 * See CLAUDE_EXEC.md "User stories at EXEC-TO-PLAN" for the protocol description.
 *
 * **Integration Point**: Called by EXEC-TO-PLAN gate pipeline (SD-LEO-FIX-STORIES-SUB-AGENT-001)
 *
 * **Usage**: node scripts/auto-validate-user-stories-on-exec-complete.js <SD-ID>
 */

import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import dotenv from 'dotenv';
dotenv.config();

/**
 * Auto-validate user stories for a given SD
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} [sbClient] - Optional Supabase client (creates one if not provided)
 * @returns {Promise<Object>} Validation result
 */
async function autoValidateUserStories(sdId, sbClient) {
  const supabase = sbClient || createSupabaseServiceClient();

  console.log(`🔍 Checking user stories for ${sdId}...`);

  // 1. Get all user stories for this SD
  const { data: stories, error: storiesError } = await supabase
    .from('user_stories')
    .select('id, title, status, validation_status')
    .eq('sd_id', sdId);

  if (storiesError) {
    console.error('❌ Error fetching user stories:', storiesError.message);
    return { validated: false, error: storiesError.message };
  }

  if (!stories || stories.length === 0) {
    console.log('✅ No user stories to validate (acceptable for infra/docs SDs)');
    return { validated: true, count: 0, message: 'No user stories' };
  }

  // 2. Check if all deliverables are complete
  const { data: deliverables, error: delError } = await supabase
    .from('sd_scope_deliverables')
    .select('deliverable_name, completion_status')
    .eq('sd_id', sdId);

  if (delError) {
    console.error('❌ Error fetching deliverables:', delError.message);
    return { validated: false, error: delError.message };
  }

  const allDeliverablesComplete = deliverables && deliverables.length > 0 &&
    deliverables.every(d => d.completion_status === 'completed');

  if (!allDeliverablesComplete) {
    console.log('⏸️  Deliverables not all complete, skipping auto-validation');
    return { validated: false, message: 'Deliverables incomplete' };
  }

  // 2b. Promote status='ready' -> 'completed' (deliverables prove the work landed)
  const readyStories = stories.filter(s => s.status === 'ready');
  if (readyStories.length > 0) {
    console.log(`📈 Promoting ${readyStories.length} ready stories to completed (deliverables done)...`);
    const { error: promoteError } = await supabase
      .from('user_stories')
      .update({ status: 'completed' })
      .eq('sd_id', sdId)
      .eq('status', 'ready');
    if (promoteError) {
      console.error('❌ Error promoting ready->completed:', promoteError.message);
      return { validated: false, error: promoteError.message };
    }
    readyStories.forEach(s => { s.status = 'completed'; });
  }

  // 3. Auto-validate completed user stories (must be both completed AND pending validation)
  const completedPendingStories = stories.filter(
    s => s.validation_status === 'pending' && s.status === 'completed'
  );

  if (completedPendingStories.length === 0) {
    const allValidated = stories.every(s => s.validation_status === 'validated');
    if (allValidated) {
      console.log('✅ All user stories already validated');
      return { validated: true, count: stories.length, message: 'Already validated' };
    } else {
      console.log('⏸️  User stories exist but not completed yet, skipping auto-validation');
      return { validated: false, message: 'Stories not completed' };
    }
  }

  console.log(`📝 Auto-validating ${completedPendingStories.length} completed user stories...`);

  const { data: updated, error: updateError } = await supabase
    .from('user_stories')
    .update({ validation_status: 'validated' })
    .eq('sd_id', sdId)
    .eq('status', 'completed')
    .eq('validation_status', 'pending')
    .select('id, title, status');

  if (updateError) {
    console.error('❌ Error updating user stories:', updateError.message);
    return { validated: false, error: updateError.message };
  }

  console.log('✅ Auto-validated user stories:');
  updated.forEach(s => console.log(`   ✓ ${s.title}`));

  return {
    validated: true,
    count: updated.length,
    message: `Auto-validated ${updated.length} user stories`
  };
}

// Run if called directly
const sdIdArg = process.argv[2];
const argv1 = process.argv[1] || '';
if (import.meta.url === `file://${argv1}` || import.meta.url === `file:///${argv1.replace(/\\/g, '/')}`) {
  if (!sdIdArg) {
    console.error('❌ Usage: node auto-validate-user-stories-on-exec-complete.js <SD-ID>');
    process.exit(1);
  }
  autoValidateUserStories(sdIdArg)
    .then(result => {
      console.log('\n📊 Result:', JSON.stringify(result, null, 2));
      process.exit(result.validated ? 0 : 1);
    })
    .catch(err => {
      console.error('❌ Fatal error:', err.message);
      process.exit(1);
    });
}

export { autoValidateUserStories };
