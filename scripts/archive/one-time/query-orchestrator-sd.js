import { createDatabaseClient } from './lib/supabase-connection.js';

(async () => {
  const client = await createDatabaseClient('engineer', { verify: false });

  try {
    // Get original orchestrator SD
    const orchestratorResult = await client.query(`
      SELECT * FROM strategic_directives
      WHERE sd_id = 'SD-E2E-TEST-ORCHESTRATOR'
    `);

    console.log('=== ORIGINAL ORCHESTRATOR SD ===');
    console.log(JSON.stringify(orchestratorResult.rows[0], null, 2));

    // Get all child SDs
    const childrenResult = await client.query(`
      SELECT * FROM strategic_directives
      WHERE parent_sd_id = 'SD-E2E-TEST-ORCHESTRATOR'
      ORDER BY created_at
    `);

    console.log('\n=== CHILD SDs (Count: ' + childrenResult.rows.length + ') ===');
    childrenResult.rows.forEach((child, idx) => {
      console.log(`\n--- Child ${idx + 1}: ${child.sd_id} ---`);
      console.log(JSON.stringify(child, null, 2));
    });
  } finally {
    await client.end();
  }
})();
