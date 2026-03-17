#!/usr/bin/env node

/**
 * Create Master SD: SD-TEST-MANAGEMENT-001
 * Test Management System Orchestrator
 *
 * Origin: SD-E2E-UAT-COVERAGE-001 completion analysis + GPT 5.2 integration research
 *
 * HIERARCHY:
 * SD-TEST-MANAGEMENT-001 (Orchestrator)
 * ├── SD-TEST-MGMT-SCHEMA-001 (Database Schema)
 * ├── SD-TEST-MGMT-CLEANUP-001 (Cleanup & Migration)
 * ├── SD-TEST-MGMT-SCANNER-001 (Scanner & Auto-Registration)
 * ├── SD-TEST-MGMT-CICD-001 (CI/CD Integration)
 * ├── SD-TEST-MGMT-AUTOMATION-001 (Automation Workflows)
 * ├── SD-TEST-MGMT-SELECTION-001 (Smart Test Selection)
 * ├── SD-TEST-MGMT-LLM-CORE-001 (Core LLM Intelligence)
 * ├── SD-TEST-MGMT-LLM-ADV-001 (Advanced LLM Intelligence)
 * ├── SD-TEST-MGMT-DOCS-001 (Documentation & Integration)
 * └── SD-TEST-MGMT-EXEC-001 (Execution & Validation)
 *
 * Refactored to use shared modules for SD creation utilities.
 */

import {
  getSupabaseClient,
  printHeader,
  printSeparator,
  printErrorAndExit
} from './modules/sd-creation/index.js';

import {
  childSDs,
  createOrchestratorSD,
  createChildSDRecord
} from './modules/sd-creation/test-management/index.js';

/**
 * Create and insert the orchestrator SD
 * @returns {Promise<Object>} Created orchestrator SD
 */
async function createTestManagementOrchestrator() {
  console.log('Creating Orchestrator SD: SD-TEST-MANAGEMENT-001...\n');

  const supabase = getSupabaseClient();
  const orchestratorSD = createOrchestratorSD();

  const { data: existing } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('id', orchestratorSD.id)
    .single();

  if (existing) {
    console.log(`   [WARN] SD ${orchestratorSD.id} already exists. Updating...`);

    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .update(orchestratorSD)
      .eq('id', orchestratorSD.id)
      .select()
      .single();

    if (error) throw error;
    console.log(`   [OK] SD ${orchestratorSD.id} updated successfully!`);
    return data;
  }

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .insert(orchestratorSD)
    .select()
    .single();

  if (error) throw error;

  console.log(`   [OK] SD ${orchestratorSD.id} created successfully!`);
  printOrchestratorDetails(data, orchestratorSD);

  return data;
}

/**
 * Print orchestrator SD details
 */
function printOrchestratorDetails(data, orchestratorSD) {
  printSeparator('TEST MANAGEMENT SYSTEM ORCHESTRATOR');
  console.log(`ID:       ${data.id}`);
  console.log(`Title:    ${data.title}`);
  console.log(`Priority: ${data.priority}`);
  console.log(`Status:   ${data.status}`);

  console.log('\nCURRENT STATE:');
  console.log('   - 143+ tests with no central registry');
  console.log('   - Manual flakiness detection');
  console.log('   - No coverage mapping');
  console.log('   - Limited automation');

  console.log('\nTARGET STATE:');
  console.log('   - All tests in database registry');
  console.log('   - Auto-capture CI/CD results');
  console.log('   - Flaky tests auto-quarantined');
  console.log('   - Coverage gaps auto-detected');
  console.log('   - LLM-powered analysis');

  console.log('\nCHILDREN (10 Child SDs):');
  childSDs.forEach((child, i) => {
    console.log(`\n   ${i+1}. [Rank ${child.rank}] ${child.id}`);
    console.log(`      Title: ${child.title}`);
    console.log(`      Priority: ${child.priority.toUpperCase()}`);
    console.log(`      Effort: ${child.estimated_effort}`);
    console.log(`      Dependencies: ${child.dependencies.length > 0 ? child.dependencies.join(', ') : 'None'}`);
  });

  console.log('\nLLM FEATURES (9 total):');
  console.log('   Core (6):');
  console.log('   - Test Quality Scoring');
  console.log('   - Failure Root Cause Analysis');
  console.log('   - Test Generation from User Stories');
  console.log('   - Coverage Gap Identification');
  console.log('   - Flakiness Pattern Detection');
  console.log('   - Test Maintenance Suggestions');
  console.log('   Advanced (3):');
  console.log('   - Risk-Based Test Prioritization');
  console.log('   - Natural Language Test Search');
  console.log('   - Test Summary Generation');
  console.log('   Removed (4):');
  console.log('   x Test Deduplication Detection');
  console.log('   x Accessibility Test Generation');
  console.log('   x Test Data Generation');
  console.log('   x Visual Intelligence Assessment');

  console.log('\nAUTOMATION FEATURES:');
  orchestratorSD.metadata.automation_features.forEach(f => {
    console.log(`   - ${f}`);
  });

  console.log('\nSUMMARY:');
  console.log(`   Children: ${childSDs.length}`);
  console.log('   Total effort: 18-20 sessions');
  console.log('   LLM budget: $50/month');
  console.log('   Current tests: 143+');

  console.log('\nEXECUTION ORDER:');
  orchestratorSD.metadata.execution_order.forEach((id, i) => {
    const child = childSDs.find(c => c.id === id);
    console.log(`   ${i+1}. ${id} (${child.priority})`);
  });
}

/**
 * Create all child SDs
 * @param {string} parentId - Parent orchestrator SD ID
 * @returns {Promise<Object>} Results summary
 */
async function createChildSDs(parentId) {
  printSeparator('CREATING CHILD SDs');

  const supabase = getSupabaseClient();
  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const child of childSDs) {
    const childSD = createChildSDRecord(child, parentId);

    try {
      const { data: existing } = await supabase
        .from('strategic_directives_v2')
        .select('id')
        .eq('id', child.id)
        .single();

      if (existing) {
        const { error } = await supabase
          .from('strategic_directives_v2')
          .update(childSD)
          .eq('id', child.id);

        if (error) throw error;
        console.log(`   [WARN] Updated: ${child.id}`);
        updated++;
      } else {
        const { error } = await supabase
          .from('strategic_directives_v2')
          .insert(childSD);

        if (error) throw error;
        console.log(`   [OK] Created: ${child.id}`);
        created++;
      }
    } catch (error) {
      console.error(`   [FAIL] Failed: ${child.id} - ${error.message}`);
      failed++;
    }
  }

  console.log('\n' + '-'.repeat(80));
  console.log(`Child SD Summary: ${created} created, ${updated} updated, ${failed} failed`);

  return { created, updated, failed };
}

/**
 * Main execution function
 */
async function main() {
  printHeader('TEST MANAGEMENT SYSTEM - SD CREATION');
  console.log(`Date: ${new Date().toISOString()}\n`);

  const orchestrator = await createTestManagementOrchestrator();
  const childResults = await createChildSDs(orchestrator.id);

  printSeparator('CREATION COMPLETE');
  console.log(`Orchestrator: ${orchestrator.id}`);
  console.log(`Children: ${childResults.created + childResults.updated} successful`);
  console.log(`Total SDs: ${1 + childSDs.length}`);
  console.log('');
  console.log('Next: Run LEO Protocol LEAD phase for approval');
  console.log('Command: npm run sd:next');
}

main().catch(error => {
  printErrorAndExit('Fatal error', error);
});
