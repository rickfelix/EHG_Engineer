#!/usr/bin/env node

import { createDatabaseClient } from '../lib/supabase-connection.js';

(async () => {
  const client = await createDatabaseClient('engineer', { verify: false });

  try {
    const result = await client.query(`
      SELECT id, title,
             jsonb_array_length(success_criteria) as criteria_count,
             length(description) as desc_length,
             length(scope) as scope_length,
             updated_at,
             updated_by
      FROM strategic_directives_v2
      WHERE id LIKE 'SD-VISION-V2-%'
      ORDER BY id
    `);

    console.log(`\n${'='.repeat(80)}`);
    console.log('Vision V2 Strategic Directives - Update Summary');
    console.log(`${'='.repeat(80)}\n`);

    result.rows.forEach(row => {
      console.log(`${row.id}: ${row.title}`);
      console.log(`  Success Criteria: ${row.criteria_count} items`);
      console.log(`  Description: ${row.desc_length} chars`);
      console.log(`  Scope: ${row.scope_length || 0} chars`);
      console.log(`  Updated: ${row.updated_at}`);
      console.log(`  Updated By: ${row.updated_by}`);
      console.log();
    });

    console.log(`Total SDs Updated: ${result.rows.length}`);
    console.log(`${'='.repeat(80)}\n`);

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
