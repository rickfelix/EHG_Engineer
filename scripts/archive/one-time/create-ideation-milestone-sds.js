#!/usr/bin/env node

/**
 * Create EHG Ideation Milestone Strategic Directives
 *
 * Creates 1 vision parent SD + 3 foundation SDs + 6 stage SDs for Stages 1-6 vision.
 * Uses parent-child relationships (parent_sd_id) for proper hierarchy.
 *
 * Hierarchy:
 * SD-IDEATION-VISION-001 (PARENT)
 * +-- SD-IDEATION-DATA-001 (Foundation - Critical)
 * |   +-- SD-IDEATION-STAGE1-001 (Enhanced Idea Capture)
 * |   \-- SD-IDEATION-STAGE5-001 (Profitability Forecasting)
 * +-- SD-IDEATION-AGENTS-001 (Foundation - Critical)
 * |   +-- SD-IDEATION-STAGE2-001 (AI Review)
 * |   +-- SD-IDEATION-STAGE3-001 (Comprehensive Validation)
 * |   \-- SD-IDEATION-STAGE4-001 (Competitive Intelligence)
 * \-- SD-IDEATION-PATTERNS-001 (Foundation - High)
 *     \-- SD-IDEATION-STAGE6-001 (Risk Evaluation)
 *
 * Refactored to use shared modules for SD creation utilities.
 */

import {
  upsertSDs,
  printHeader,
  printResultsSummary,
  printNextSteps,
  printErrorAndExit,
  printSuccess
} from './modules/sd-creation/index.js';

import {
  visionParentSD,
  dataFoundationSD,
  agentsFoundationSD,
  patternsFoundationSD,
  stage1SD,
  stage2SD,
  stage3SD,
  stage4SD,
  stage5SD,
  stage6SD,
  HIERARCHY_STRUCTURE,
  NEXT_STEPS
} from './modules/sd-creation/ideation-milestone/index.js';

/**
 * Get all SDs with timestamps
 * @returns {Array<object>}
 */
function prepareSDsForInsertion() {
  const now = new Date().toISOString();

  const allSDs = [
    visionParentSD,
    dataFoundationSD,
    agentsFoundationSD,
    patternsFoundationSD,
    stage1SD,
    stage2SD,
    stage3SD,
    stage4SD,
    stage5SD,
    stage6SD
  ];

  return allSDs.map(sd => ({
    ...sd,
    created_at: sd.created_at || now,
    updated_at: now
  }));
}

/**
 * Print processing status for each SD
 * @param {Array<{sd: object, type: string}>} sdList
 */
function printProcessingPlan(sdList) {
  const types = [
    'VISION PARENT',
    'FOUNDATION (Data)',
    'FOUNDATION (Agents)',
    'FOUNDATION (Patterns)',
    'STAGE 1',
    'STAGE 2',
    'STAGE 3',
    'STAGE 4',
    'STAGE 5',
    'STAGE 6'
  ];

  console.log('\nProcessing SDs in hierarchy order:\n');
  sdList.forEach((sd, i) => {
    console.log(`  ${types[i]}: ${sd.id}`);
    console.log(`     Title: ${sd.title}`);
    console.log(`     Priority: ${sd.priority}`);
    console.log(`     Parent: ${sd.parent_sd_id || 'None (Root)'}`);
  });
}

/**
 * Main execution function
 */
async function createIdeationMilestoneSDs() {
  printHeader('Creating EHG Ideation Milestone Strategic Directives');

  const sdList = prepareSDsForInsertion();
  printProcessingPlan(sdList);

  console.log('\nInserting SDs...\n');
  const results = await upsertSDs(sdList);

  printResultsSummary(results);

  console.log('\nHIERARCHY STRUCTURE:');
  console.log(HIERARCHY_STRUCTURE);

  printNextSteps(NEXT_STEPS);

  return results;
}

// Execute
createIdeationMilestoneSDs()
  .then(results => {
    if (results.failed.length === 0) {
      printSuccess('All Strategic Directives created successfully!');
      process.exit(0);
    } else {
      console.log('\n[WARN] Some Strategic Directives failed to create');
      process.exit(1);
    }
  })
  .catch(error => {
    printErrorAndExit('Fatal error', error);
  });
