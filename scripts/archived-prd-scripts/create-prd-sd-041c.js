#!/usr/bin/env node

/**
 * Create PRD for SD-041C: AI-Powered Documentation Generator
 *
 * Creates a comprehensive PRD with:
 * - 6 functional requirements
 * - 30 acceptance criteria
 * - 14 test scenarios
 * - 6 database tables
 * - Technical architecture design
 *
 * Refactored to use shared modules for PRD content.
 */

import {
  getSupabaseClient,
  printHeader,
  printSeparator,
  printErrorAndExit
} from './modules/sd-creation/index.js';

import { createPrdData } from './modules/sd-creation/prd-sd-041c/index.js';

/**
 * Create and insert the PRD
 */
async function createPRD() {
  printHeader('PRD CREATION: SD-041C AI-Powered Documentation Generator');

  const supabase = getSupabaseClient();
  const prdData = createPrdData();

  const { data, error } = await supabase
    .from('product_requirements')
    .insert([prdData])
    .select();

  if (error) {
    console.error('   [FAIL] Error creating PRD:', error.message);

    console.log('   [INFO] Storing PRD in SD metadata...');
    const { error: metaError } = await supabase
      .from('strategic_directives_v2')
      .update({
        metadata: {
          prd: prdData
        }
      })
      .eq('sd_key', 'SD-041C');

    if (metaError) {
      console.error('   [FAIL] Metadata fallback failed:', metaError.message);
      process.exit(1);
    }
    console.log('   [OK] PRD stored in SD metadata');
  } else {
    console.log('   [OK] PRD created successfully!');
    console.log('   PRD ID:', data[0].id);
  }

  printSummary(prdData);
}

/**
 * Print PRD summary
 */
function printSummary(_prdData) {
  printSeparator('PRD SUMMARY');
  console.log('   SD: SD-041C');
  console.log('   Title: AI-Powered Documentation Generator');
  console.log('   Version: 1.0.0');
  console.log('   Functional Requirements: 6');
  console.log('   Acceptance Criteria: 30');
  console.log('   Test Scenarios: 14');
  console.log('   Database Tables: 6');
  console.log('   AI Provider: Anthropic Claude 3.5 Sonnet');
  console.log('   Estimated Hours: 10');
  console.log('\nNext: Trigger Design sub-agent for UI/UX review');
}

createPRD().catch(error => {
  printErrorAndExit('Fatal error', error);
});
