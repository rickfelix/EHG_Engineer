/**
 * Phase Utilities Domain
 * Handles phase flow, marking, and display utilities
 *
 * @module execute-phase/phase-utils
 */

import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Phase flow map for progression
 */
export const PHASE_FLOW = {
  'LEAD': 'PLAN',
  'PLAN': 'EXEC',
  'EXEC': 'VERIFICATION',
  'VERIFICATION': 'APPROVAL',
  'APPROVAL': null
};

/**
 * Phase complete status map
 */
export const PHASE_COMPLETE_MAP = {
  'LEAD': 'LEAD_COMPLETE',
  'PLAN': 'PLAN_COMPLETE',
  'EXEC': 'EXEC_COMPLETE',
  'VERIFICATION': 'VERIFICATION_COMPLETE',
  'APPROVAL': 'APPROVAL_COMPLETE'
};

/**
 * Load phase requirements from configuration
 * @returns {Object} Phase requirements configuration
 */
export async function loadPhaseRequirements() {
  const requirementsPath = path.join(__dirname, '..', 'config', 'phase-requirements.json');
  const data = await fs.readFile(requirementsPath, 'utf8');
  return JSON.parse(data);
}

/**
 * Get the next phase in the workflow
 * @param {string} currentPhase - Current phase name
 * @returns {string|null} Next phase name or null if at end
 */
export function getNextPhase(currentPhase) {
  return PHASE_FLOW[currentPhase];
}

/**
 * Mark a phase as complete
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - Strategic Directive ID
 * @param {string} phase - Phase name
 */
export async function markPhaseComplete(supabase, sdId, phase) {
  await supabase
    .from('strategic_directives_v2')
    .update({
      current_phase: PHASE_COMPLETE_MAP[phase],
      updated_at: new Date().toISOString()
    })
    .eq('id', sdId);
}

/**
 * Mark an SD as fully complete
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - Strategic Directive ID
 */
export async function markSDComplete(supabase, sdId) {
  try {
    console.log(chalk.blue(`   🏁 Marking ${sdId} as fully completed...`));

    const completionTimestamp = new Date().toISOString();

    const { data: sdUpdate, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .update({
        status: 'completed',
        is_working_on: false,
        current_phase: 'APPROVAL_COMPLETE',
        progress: 100,
        completion_date: completionTimestamp,
        updated_at: completionTimestamp,
        metadata: {
          completion_percentage: 100,
          completion_date: completionTimestamp,
          approved_by: 'LEO_PHASE_EXECUTOR',
          approval_date: completionTimestamp,
          final_status: 'SUCCESSFULLY_COMPLETED',
          leo_protocol_version: '4.2.0'
        }
      })
      .eq('id', sdId)
      .select();

    if (sdError) {
      console.log(chalk.yellow(`   ⚠️  Could not update SD status: ${sdError.message}`));
    } else {
      console.log(chalk.green(`   ✅ ${sdId} marked as completed`));
      console.log(chalk.gray('   Status: completed | Working On: false | Progress: 100%'));
    }

    // Update associated PRDs
    const { error: prdError } = await supabase
      .from('product_requirements_v2')
      .update({
        status: 'approved',
        progress: 100,
        updated_at: completionTimestamp
      })
      .eq('sd_id', sdId);

    if (prdError) {
      console.log(chalk.yellow(`   ⚠️  Could not update PRD status: ${prdError.message}`));
    } else {
      console.log(chalk.green('   ✅ Associated PRDs marked as approved'));
    }

  } catch (error) {
    console.log(chalk.yellow(`   ⚠️  Completion marking failed: ${error.message}`));
  }
}

/**
 * Show next steps after phase completion
 * @param {string} phase - Current phase name
 * @param {string|null} nextPhase - Next phase name
 * @param {Object} sd - Strategic Directive record
 */
export function showNextSteps(phase, nextPhase, sd) {
  console.log(chalk.cyan('\n📋 Next Steps:'));

  if (nextPhase) {
    console.log(`   1. Review ${phase} phase outputs`);
    console.log(`   2. Proceed to ${nextPhase} phase`);
    console.log(`   3. Execute: node templates/execute-phase.js ${nextPhase} ${sd.id}`);
  } else {
    console.log('   1. Review final outputs');
    console.log('   2. Generate retrospective');
    console.log('   3. Archive project artifacts');
  }

  if (phase === 'PLAN') {
    console.log(chalk.yellow('\n   📍 CRITICAL for EXEC phase:'));
    console.log('     • Navigate to the EHG application directory for implementation');
    console.log('     • Review PRD before starting');
    console.log('     • Implement based on priority order');
  }
}

/**
 * Get SD details from database
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - Strategic Directive ID
 * @returns {Object} SD record
 */
export async function getSDDetails(supabase, sdId) {
  const { data: sd } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', sdId)
    .single();

  return sd;
}

/**
 * Display SD status information
 * @param {Object} sd - Strategic Directive record
 */
export function displaySDStatus(sd) {
  console.log(chalk.green(`\n✅ Found SD: ${sd.title}`));
  console.log(`   Status: ${sd.status}`);
  console.log(`   Current Phase: ${sd.current_phase || 'N/A'}`);
  console.log(`   Priority: ${sd.priority}`);
}

export default {
  PHASE_FLOW,
  PHASE_COMPLETE_MAP,
  loadPhaseRequirements,
  getNextPhase,
  markPhaseComplete,
  markSDComplete,
  showNextSteps,
  getSDDetails,
  displaySDStatus
};
