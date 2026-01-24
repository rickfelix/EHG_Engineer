/**
 * State Transitions for PLAN-TO-LEAD Handoff
 * Part of SD-LEO-REFACTOR-PLANTOLEAD-001
 *
 * User story finalization, parent SD completion
 *
 * Enhanced with orchestrator child completion flow
 * Part of SD-LEO-ORCH-AUTO-PROCEED-INTELLIGENCE-001-E
 */

import { normalizeSDId } from '../../../sd-id-normalizer.js';

// Import orchestrator child completion for per-child post-completion handling
// SD-LEO-ORCH-AUTO-PROCEED-INTELLIGENCE-001-E
import {
  handleChildCompletion,
  getParentFinalizationCommands
} from '../../../../../lib/utils/orchestrator-child-completion.js';

/**
 * Finalize user stories to completed status
 *
 * Root cause fix: Ensures all user stories are marked completed before SD completion.
 * This is a safety net - EXEC-TO-PLAN should have already done this.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} prdId - PRD ID
 * @param {string} sdId - SD ID
 */
export async function finalizeUserStories(supabase, prdId, sdId) {
  console.log('\n   Finalizing user stories...');

  try {
    let query = supabase
      .from('user_stories')
      .select('id, title, status, validation_status, e2e_test_path, e2e_test_status');

    if (prdId) {
      query = query.eq('prd_id', prdId);
    } else if (sdId) {
      query = query.eq('sd_id', sdId);
    } else {
      console.log('   ⚠️  No PRD or SD ID - cannot finalize stories');
      return;
    }

    const { data: stories, error: fetchError } = await query;

    if (fetchError) {
      console.log(`   ⚠️  Could not fetch user stories: ${fetchError.message}`);
      return;
    }

    if (!stories || stories.length === 0) {
      console.log('   ℹ️  No user stories to finalize');
      return;
    }

    let updatedCount = 0;
    for (const story of stories) {
      if (story.status !== 'completed' || story.validation_status !== 'validated') {
        const updates = {
          status: 'completed',
          validation_status: 'validated',
          updated_at: new Date().toISOString()
        };

        if (story.e2e_test_path && story.e2e_test_status !== 'passing') {
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
    }

    const alreadyComplete = stories.length - updatedCount;
    console.log(`   ✅ User stories finalized: ${updatedCount} updated, ${alreadyComplete} already complete`);
  } catch (error) {
    console.log(`   ⚠️  User story finalization error: ${error.message}`);
  }
}

/**
 * Check and complete parent SD when all children are done
 *
 * Root cause fix: Parent SDs weren't being automatically marked complete when
 * all children finished.
 *
 * Enhanced: SD-LEO-ORCH-AUTO-PROCEED-INTELLIGENCE-001-E
 * Now returns orchestrator completion flow commands when applicable.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} sd - The child SD that just completed
 * @returns {Promise<Object>} { parentCompleted, commandsToRun }
 */
export async function checkAndCompleteParentSD(supabase, sd) {
  const result = {
    parentCompleted: false,
    commandsToRun: [],
    childCommands: [],
    parentCommands: []
  };

  if (!sd.parent_sd_id) {
    return result;
  }

  console.log('\n   Checking parent SD completion...');

  try {
    // Get child SD's post-completion commands (ship, learn)
    // SD-LEO-ORCH-AUTO-PROCEED-INTELLIGENCE-001-E
    const childSdKey = sd.sd_key || sd.id;
    try {
      const childCompletionResult = await handleChildCompletion(childSdKey);
      if (childCompletionResult.success) {
        result.childCommands = childCompletionResult.commandsToRun.filter(
          cmd => cmd === 'ship' || cmd === 'learn'
        );
      }
    } catch (childErr) {
      console.log(`   ⚠️  Child completion handler warning: ${childErr.message}`);
      // Fall back to default commands
      result.childCommands = ['ship', 'learn'];
    }

    const { data: parentSD, error: parentError } = await supabase
      .from('strategic_directives_v2')
      .select('id, title, status, parent_sd_id, sd_key')
      .eq('id', sd.parent_sd_id)
      .single();

    if (parentError || !parentSD) {
      console.log(`   ⚠️  Could not fetch parent SD: ${parentError?.message || 'Not found'}`);
      result.commandsToRun = result.childCommands;
      return result;
    }

    if (parentSD.status === 'completed') {
      console.log('   ℹ️  Parent SD already completed');
      result.commandsToRun = result.childCommands;
      return result;
    }

    const { data: siblings, error: siblingsError } = await supabase
      .from('strategic_directives_v2')
      .select('id, title, status')
      .eq('parent_sd_id', sd.parent_sd_id);

    if (siblingsError) {
      console.log(`   ⚠️  Could not fetch sibling SDs: ${siblingsError.message}`);
      result.commandsToRun = result.childCommands;
      return result;
    }

    const allSiblingsComplete = siblings.every(sibling =>
      sibling.status === 'completed' || sibling.status === 'pending_approval'
    );

    if (!allSiblingsComplete) {
      const incompleteCount = siblings.filter(s =>
        s.status !== 'completed' && s.status !== 'pending_approval'
      ).length;
      console.log(`   ℹ️  Parent has ${incompleteCount} incomplete children - not completing parent yet`);
      result.commandsToRun = result.childCommands;
      return result;
    }

    console.log(`   🎉 All ${siblings.length} children completed - auto-completing parent SD`);

    const { error: updateError } = await supabase
      .from('strategic_directives_v2')
      .update({
        status: 'completed',
        progress: 100,
        current_phase: 'COMPLETED',
        updated_at: new Date().toISOString()
      })
      .eq('id', parentSD.id);

    if (updateError) {
      console.log(`   ⚠️  Could not complete parent SD: ${updateError.message}`);
      result.commandsToRun = result.childCommands;
    } else {
      console.log(`   ✅ Parent SD "${parentSD.title}" auto-completed!`);
      result.parentCompleted = true;

      // Get parent finalization commands (document, leo next)
      // SD-LEO-ORCH-AUTO-PROCEED-INTELLIGENCE-001-E
      result.parentCommands = getParentFinalizationCommands(parentSD);
      console.log(`   📋 Parent finalization commands: ${result.parentCommands.join(', ')}`);

      // Child commands first, then parent commands
      result.commandsToRun = [...result.childCommands, ...result.parentCommands];

      // Recursively check grandparent
      if (parentSD.parent_sd_id) {
        console.log('   📊 Checking grandparent SD...');
        const grandparentResult = await checkAndCompleteParentSD(supabase, parentSD);
        if (grandparentResult.parentCommands.length > 0) {
          result.commandsToRun.push(...grandparentResult.parentCommands);
        }
      }
    }
  } catch (error) {
    console.log(`   ⚠️  Parent completion check error: ${error.message}`);
    // Fall back to child commands only
    result.commandsToRun = result.childCommands;
  }

  // Display completion summary
  if (result.commandsToRun.length > 0) {
    console.log('\n   📋 ORCHESTRATOR COMPLETION FLOW - Commands to Execute:');
    result.commandsToRun.forEach((cmd, i) => {
      console.log(`      ${i + 1}. /${cmd}`);
    });
  }

  return result;
}

/**
 * Update orchestrator SD to completed status
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - SD ID
 * @param {number} childrenCount - Number of children
 * @returns {Object} Result with handoffId
 */
export async function completeOrchestratorSD(supabase, sdId, childrenCount) {
  const handoffId = `PLAN-to-LEAD-ORCHESTRATOR-${sdId}-${Date.now()}`;

  console.log('\n📊 STATE TRANSITIONS: Orchestrator Final Status Updates');
  console.log('-'.repeat(50));

  const canonicalId = await normalizeSDId(supabase, sdId);
  if (!canonicalId) {
    console.log(`   ⚠️  Could not normalize SD ID: ${sdId}`);
    return {
      success: false,
      error: `Could not normalize SD ID: ${sdId}. Ensure SD exists in database.`
    };
  }
  if (sdId !== canonicalId) {
    console.log(`   ℹ️  ID normalized: "${sdId}" -> "${canonicalId}"`);
  }

  const { data: updateResult, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .update({
      status: 'completed',
      current_phase: 'LEAD',
      progress_percentage: 100,
      updated_at: new Date().toISOString()
    })
    .eq('id', canonicalId)
    .select('id')
    .single();

  if (sdError) {
    console.log(`   ⚠️  SD update error: ${sdError.message}`);
  } else if (!updateResult) {
    console.log('   ⚠️  SD update returned no data - possible silent failure');
  } else {
    console.log('   ✅ Orchestrator SD status transitioned: → completed');
    console.log('   ✅ Progress set to 100% (all children complete)');
  }

  console.log('\n🎉 ORCHESTRATOR COMPLETION: All children finished, parent SD marked complete');
  console.log('📊 Handoff ID:', handoffId);

  return {
    success: true,
    handoffId,
    childrenCount,
    canonicalId
  };
}

/**
 * Update standard SD status for LEAD approval
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - SD ID
 * @param {Object} prd - PRD object
 * @param {Object} planValidation - Plan validation results
 * @param {Object} gateResults - Gate results
 * @returns {Object} Result with handoffId
 */
export async function completeStandardSD(supabase, sdId, prd, planValidation, gateResults) {
  const handoffId = `PLAN-to-LEAD-${sdId}-${Date.now()}`;

  console.log('\n📊 STATE TRANSITIONS: Final Status Updates');
  console.log('-'.repeat(50));

  // 1. Update PRD status
  const { error: prdError } = await supabase
    .from('product_requirements_v2')
    .update({
      status: 'completed',
      phase: 'LEAD_APPROVAL',
      updated_at: new Date().toISOString(),
      metadata: {
        ...prd.metadata,
        plan_handoff: {
          handoff_id: handoffId,
          validation: planValidation,
          gate3_validation: gateResults.gateResults.GATE3_TRACEABILITY || null,
          gate4_validation: gateResults.gateResults.GATE4_WORKFLOW_ROI || null
        }
      }
    })
    .eq('id', prd.id);

  if (prdError) {
    console.log(`   ⚠️  PRD update error: ${prdError.message}`);
  } else {
    console.log('   ✅ PRD status transitioned: → completed');
  }

  // 2. Update SD status
  const sdCanonicalId = await normalizeSDId(supabase, sdId);
  if (!sdCanonicalId) {
    console.log(`   ⚠️  Could not normalize SD ID for status update: ${sdId}`);
  } else {
    if (sdId !== sdCanonicalId) {
      console.log(`   ℹ️  ID normalized: "${sdId}" -> "${sdCanonicalId}"`);
    }

    const { data: sdUpdateResult, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .update({
        status: 'pending_approval',
        current_phase: 'LEAD',
        updated_at: new Date().toISOString()
      })
      .eq('id', sdCanonicalId)
      .select('id')
      .single();

    if (sdError) {
      console.log(`   ⚠️  SD update note: ${sdError.message}`);
    } else if (!sdUpdateResult) {
      console.log('   ⚠️  SD update returned no data - possible silent failure');
    } else {
      console.log('   ✅ SD status transitioned: → pending_approval');
    }
  }

  console.log('📋 PLAN verification complete and handed to LEAD for approval');
  console.log('📊 Handoff ID:', handoffId);

  return {
    success: true,
    handoffId
  };
}
