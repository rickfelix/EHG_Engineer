#!/usr/bin/env node
/**
 * Check the trigger function that's validating quality_score
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

async function checkTrigger() {
  console.log('🔍 Checking trigger function...\n');

  const client = await createDatabaseClient('engineer', {
    verbose: false
  });

  try {
    // Get the trigger function definition
    console.log('Trigger function: auto_validate_retrospective_quality()\n');
    const funcDef = await client.query(`
      SELECT
        pg_get_functiondef(oid) AS function_definition
      FROM pg_proc
      WHERE proname = 'auto_validate_retrospective_quality'
    `);

    if (funcDef.rows.length > 0) {
      console.log(funcDef.rows[0].function_definition);
    } else {
      console.log('Function not found!');
    }
    console.log('');

  } catch (error) {
    console.error('\n❌ Check failed:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

// Run check
checkTrigger()
  .then(() => {
    console.log('✅ Check complete!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
