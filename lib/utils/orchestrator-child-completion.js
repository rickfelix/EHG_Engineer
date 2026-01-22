/**
 * Orchestrator Child Completion Flow
 *
 * Implements per-child post-completion with parent finalization.
 * - Each child runs /ship and /learn on completion
 * - /document runs at parent completion for full feature context
 * - /leo next runs after parent completes
 *
 * Created: 2026-01-22
 * SD: SD-LEO-ORCH-AUTO-PROCEED-INTELLIGENCE-001-E
 * Part of: AUTO-PROCEED Intelligence Enhancements
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import {
  getPostCompletionRequirements,
  getPostCompletionSequence,
  shouldSkipLearn
} from './post-completion-requirements.js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Child completion result
 * @typedef {Object} ChildCompletionResult
 * @property {boolean} success - Whether completion was successful
 * @property {string[]} commandsToRun - Commands to execute
 * @property {string} message - Status message
 * @property {Object} parentStatus - Parent SD status information
 */

/**
 * Handle completion of a child SD within an orchestrator pattern.
 *
 * This function:
 * 1. Validates the child SD is part of an orchestrator
 * 2. Gets child-specific post-completion commands (ship, learn)
 * 3. Checks if all siblings are complete
 * 4. If all complete, triggers parent finalization commands
 *
 * @param {string} childSdKey - The completed child SD key
 * @returns {Promise<ChildCompletionResult>} Completion result with commands to run
 */
export async function handleChildCompletion(childSdKey) {
  console.log('\n🎯 ORCHESTRATOR CHILD COMPLETION FLOW');
  console.log(`   Child SD: ${childSdKey}`);

  // Fetch the child SD
  const { data: childSd, error: childError } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, sd_type, status, parent_sd_id, source')
    .eq('sd_key', childSdKey)
    .single();

  if (childError || !childSd) {
    return {
      success: false,
      commandsToRun: [],
      message: `Child SD not found: ${childSdKey}`,
      parentStatus: null
    };
  }

  // Check if this is actually a child SD
  if (!childSd.parent_sd_id) {
    console.log('   Not a child SD (no parent) - using standard completion');
    const requirements = getPostCompletionRequirements(childSd.sd_type, {
      source: childSd.source
    });
    const sequence = getPostCompletionSequence(childSd.sd_type, {
      source: childSd.source
    });

    return {
      success: true,
      commandsToRun: sequence,
      message: 'Standard completion (not an orchestrator child)',
      parentStatus: null
    };
  }

  // Fetch the parent orchestrator
  const { data: parentSd, error: parentError } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, sd_type, status, progress')
    .eq('id', childSd.parent_sd_id)
    .single();

  if (parentError || !parentSd) {
    return {
      success: false,
      commandsToRun: [],
      message: `Parent SD not found for child ${childSdKey}`,
      parentStatus: null
    };
  }

  console.log(`   Parent SD: ${parentSd.sd_key}`);

  // Get child-specific post-completion commands
  const childCommands = getChildPostCompletionCommands(childSd);
  console.log(`   Child commands: ${childCommands.join(', ')}`);

  // Check if all siblings are complete
  const siblingStatus = await checkSiblingCompletion(parentSd.id);
  console.log(`   Siblings: ${siblingStatus.completed}/${siblingStatus.total} complete`);

  // Build result
  const result = {
    success: true,
    commandsToRun: [...childCommands],
    message: '',
    parentStatus: {
      sdKey: parentSd.sd_key,
      title: parentSd.title,
      siblingStatus
    }
  };

  // If all siblings complete, add parent finalization commands
  if (siblingStatus.allComplete) {
    console.log('   All siblings complete - adding parent finalization commands');
    const parentCommands = getParentFinalizationCommands(parentSd);
    result.commandsToRun.push(...parentCommands);
    result.message = `Child ${childSdKey} complete. All siblings done - parent finalization triggered.`;

    // Update parent status if not already complete
    if (parentSd.status !== 'completed') {
      await updateParentForFinalization(parentSd.id);
    }
  } else {
    result.message = `Child ${childSdKey} complete. ${siblingStatus.remaining} siblings remaining.`;
  }

  displayCompletionSummary(result);

  return result;
}

/**
 * Get post-completion commands specific to child SDs.
 * Children always run: ship, learn (if not from learn source)
 *
 * @param {Object} childSd - The child SD object
 * @returns {string[]} Commands to run
 */
export function getChildPostCompletionCommands(childSd) {
  const commands = ['ship'];

  // Check if learn should be skipped
  const learnCheck = shouldSkipLearn(childSd);
  if (!learnCheck.skip) {
    commands.push('learn');
  }

  return commands;
}

/**
 * Get finalization commands for parent orchestrator.
 * Parent finalization runs: document, leo next
 *
 * @param {Object} parentSd - The parent SD object
 * @returns {string[]} Commands to run
 */
export function getParentFinalizationCommands(parentSd) {
  // Document runs at parent level for full feature context
  // leo next queues up the next SD
  return ['document', 'leo next'];
}

/**
 * Check completion status of all sibling SDs.
 *
 * @param {number} parentSdId - The parent SD database ID
 * @returns {Promise<Object>} Sibling completion status
 */
export async function checkSiblingCompletion(parentSdId) {
  const { data: siblings, error } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, status, progress')
    .eq('parent_sd_id', parentSdId);

  if (error || !siblings) {
    return {
      total: 0,
      completed: 0,
      remaining: 0,
      allComplete: false,
      siblings: []
    };
  }

  const completed = siblings.filter(s => s.status === 'completed');
  const remaining = siblings.length - completed.length;

  return {
    total: siblings.length,
    completed: completed.length,
    remaining,
    allComplete: remaining === 0,
    siblings: siblings.map(s => ({
      sdKey: s.sd_key,
      status: s.status,
      isComplete: s.status === 'completed'
    }))
  };
}

/**
 * Update parent SD to prepare for finalization.
 *
 * @param {number} parentSdId - The parent SD database ID
 */
async function updateParentForFinalization(parentSdId) {
  await supabase
    .from('strategic_directives_v2')
    .update({
      progress: 100,
      status: 'ready_for_final'
    })
    .eq('id', parentSdId);
}

/**
 * Display completion summary to console.
 *
 * @param {ChildCompletionResult} result - The completion result
 */
function displayCompletionSummary(result) {
  console.log('\n');
  console.log('ORCHESTRATOR CHILD COMPLETION SUMMARY');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`   Status: ${result.success ? 'SUCCESS' : 'FAILED'}`);
  console.log(`   Message: ${result.message}`);
  console.log('');
  console.log('   Commands to execute:');
  result.commandsToRun.forEach((cmd, i) => {
    console.log(`      ${i + 1}. /${cmd}`);
  });

  if (result.parentStatus) {
    console.log('');
    console.log('   Parent Status:');
    console.log(`      SD: ${result.parentStatus.sdKey}`);
    console.log(`      Children: ${result.parentStatus.siblingStatus.completed}/${result.parentStatus.siblingStatus.total} complete`);

    if (result.parentStatus.siblingStatus.allComplete) {
      console.log('      All children complete - PARENT FINALIZATION TRIGGERED');
    }
  }
  console.log('════════════════════════════════════════════════════════════');
}

/**
 * Integration helper for AUTO-PROCEED.
 * Called when AUTO-PROCEED completes a child SD.
 *
 * @param {string} childSdKey - The completed child SD key
 * @returns {Promise<Object>} Commands to execute and status
 */
export async function autoProceedChildCompletion(childSdKey) {
  const result = await handleChildCompletion(childSdKey);

  return {
    childComplete: result.success,
    commandSequence: result.commandsToRun,
    parentReady: result.parentStatus?.siblingStatus?.allComplete ?? false,
    message: result.message
  };
}

/**
 * Check if an SD is a child of an orchestrator.
 *
 * @param {string} sdKey - The SD key to check
 * @returns {Promise<Object>} { isChild, parentSdKey, siblingCount }
 */
export async function isOrchestratorChild(sdKey) {
  const { data: sd } = await supabase
    .from('strategic_directives_v2')
    .select(`
      parent_sd_id,
      parent:strategic_directives_v2!parent_sd_id(sd_key, title)
    `)
    .eq('sd_key', sdKey)
    .single();

  if (!sd || !sd.parent_sd_id) {
    return { isChild: false, parentSdKey: null, siblingCount: 0 };
  }

  // Count siblings
  const { count } = await supabase
    .from('strategic_directives_v2')
    .select('id', { count: 'exact', head: true })
    .eq('parent_sd_id', sd.parent_sd_id);

  return {
    isChild: true,
    parentSdKey: sd.parent?.sd_key || null,
    siblingCount: count || 0
  };
}

// Export all functions
export default {
  handleChildCompletion,
  getChildPostCompletionCommands,
  getParentFinalizationCommands,
  checkSiblingCompletion,
  autoProceedChildCompletion,
  isOrchestratorChild
};
