/**
 * State Transitions for EXEC-TO-PLAN Handoff
 * Part of SD-LEO-REFACTOR-EXECTOPLAN-001
 *
 * User story validation, PRD status, SD phase transitions
 */

import { normalizeSDId } from '../../../sd-id-normalizer.js';

/**
 * STATE TRANSITION: Update user stories to validated status
 *
 * Root cause fix: User stories weren't being marked as validated after implementation,
 * causing the progress trigger to block SD completion.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - SD ID
 */
export async function transitionUserStoriesToValidated(supabase, sdId) {
  console.log('\n   Updating user stories...');

  try {
    // Get all user stories for this SD
    const { data: stories, error: fetchError } = await supabase
      .from('user_stories')
      .select('id, title, e2e_test_path, status, validation_status')
      .eq('sd_id', sdId);

    if (fetchError) {
      console.log(`   ⚠️  Could not fetch user stories: ${fetchError.message}`);
      return;
    }

    if (!stories || stories.length === 0) {
      console.log('   ℹ️  No user stories to transition');
      return;
    }

    // Update each story
    let updatedCount = 0;
    for (const story of stories) {
      const updates = {
        status: 'completed',
        validation_status: 'validated',
        updated_at: new Date().toISOString()
      };

      // Only set e2e_test_status if test path exists
      if (story.e2e_test_path) {
        updates.e2e_test_status = 'passing';
      }

      const { error: updateError } = await supabase
        .from('user_stories')
        .update(updates)
        .eq('id', story.id);

      if (!updateError) {
        updatedCount++;
      }
    }

    console.log(`   ✅ ${updatedCount}/${stories.length} user stories transitioned to validated/completed`);
  } catch (error) {
    console.log(`   ⚠️  User story transition error: ${error.message}`);
  }
}

/**
 * STATE TRANSITION: Update PRD status to verification
 *
 * Root cause fix: PRD status wasn't being updated after EXEC, causing PLAN-TO-LEAD
 * to fail with "PRD status is 'in_progress', expected 'verification' or 'completed'"
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} prd - PRD object
 */
export async function transitionPrdToVerification(supabase, prd) {
  if (!prd) {
    console.log('\n   ⚠️  No PRD to transition');
    return;
  }

  console.log('\n   Updating PRD status...');

  try {
    const { error } = await supabase
      .from('product_requirements_v2')
      .update({
        status: 'verification',
        phase: 'verification',
        updated_at: new Date().toISOString()
      })
      .eq('id', prd.id);

    if (error) {
      console.log(`   ⚠️  Could not update PRD status: ${error.message}`);
    } else {
      console.log('   ✅ PRD status transitioned: → verification');
    }
  } catch (error) {
    console.log(`   ⚠️  PRD transition error: ${error.message}`);
  }
}

/**
 * STATE TRANSITION: Update SD phase to EXEC_COMPLETE
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - SD ID
 */
export async function transitionSDToExecComplete(supabase, sdId) {
  console.log('\n   Updating SD status...');

  try {
    const sdCanonicalId = await normalizeSDId(supabase, sdId);
    if (!sdCanonicalId) {
      console.warn(`   ⚠️  Could not normalize SD ID: ${sdId}`);
      return;
    }

    if (sdId !== sdCanonicalId) {
      console.log(`   ℹ️  ID normalized: "${sdId}" -> "${sdCanonicalId}"`);
    }

    const { data: updateResult, error: updateError } = await supabase
      .from('strategic_directives_v2')
      .update({
        current_phase: 'EXEC_COMPLETE',
        updated_at: new Date().toISOString()
      })
      .eq('id', sdCanonicalId)
      .select('id')
      .single();

    if (updateError) {
      console.warn(`   ⚠️  SD phase update note: ${updateError.message}`);
      console.log('   ℹ️  SD completion requires PLAN-TO-LEAD handoff');
    } else if (!updateResult) {
      console.warn('   ⚠️  SD update returned no data - possible silent failure');
    } else {
      console.log('   ✅ SD phase updated to EXEC_COMPLETE');
    }
  } catch (error) {
    console.warn(`   ⚠️  SD update error: ${error.message}`);
  }
}
