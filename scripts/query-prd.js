#!/usr/bin/env node
/**
 * Query PRD details for a specific SD
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

const SD_ID = process.argv[2] || 'SD-VWC-A11Y-001';

async function queryPRD() {
  const client = await createDatabaseClient('engineer', { verbose: true });

  try {
    console.log(`\nQuerying PRD for: ${SD_ID}\n`);

    const result = await client.query(
      `SELECT
        functional_requirements,
        technical_requirements,
        acceptance_criteria,
        performance_requirements,
        test_scenarios,
        phase,
        progress,
        status
       FROM product_requirements_v2
       WHERE sd_id = $1`,
      [SD_ID]
    );

    if (result.rows.length === 0) {
      console.error(`No PRD found for ${SD_ID}`);
      process.exit(1);
    }

    const prd = result.rows[0];

    console.log('=== PRD OVERVIEW ===');
    console.log(`Phase: ${prd.phase}`);
    console.log(`Progress: ${prd.progress}%`);
    console.log(`Status: ${prd.status}`);

    console.log('\n=== FUNCTIONAL REQUIREMENTS ===');
    console.log(JSON.stringify(prd.functional_requirements, null, 2));

    console.log('\n=== TECHNICAL REQUIREMENTS ===');
    console.log(JSON.stringify(prd.technical_requirements, null, 2));

    console.log('\n=== ACCEPTANCE CRITERIA ===');
    console.log(JSON.stringify(prd.acceptance_criteria, null, 2));

    console.log('\n=== PERFORMANCE REQUIREMENTS ===');
    console.log(JSON.stringify(prd.performance_requirements, null, 2));

    console.log('\n=== TEST SCENARIOS ===');
    console.log(JSON.stringify(prd.test_scenarios, null, 2));

  } catch (error) {
    console.error('Error querying PRD:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

queryPRD();
