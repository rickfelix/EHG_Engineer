#!/usr/bin/env node

import { createDatabaseClient } from './lib/supabase-connection.js';

(async () => {
  const client = await createDatabaseClient('engineer', { verify: false });

  console.log('=== SD-HARDENING-V2 Filter Analysis ===\n');

  const result = await client.query(`
    SELECT id, priority, sequence_rank
    FROM strategic_directives_v2
    WHERE id LIKE 'SD-HARDENING-V2%'
    ORDER BY id
  `);

  console.log('Status vs sd:next Filter Requirements:\n');
  console.log('Filter: .in(\'status\', [\'draft\', \'active\', \'in_progress\'])');
  console.log('Filter: .in(\'priority\', [\'critical\', \'high\'])');
  console.log('Filter: .not(\'sequence_rank\', \'is\', null)\n');

  let passCount = 0;

  result.rows.forEach(row => {
    const priorityOk = ['critical', 'high'].includes(row.priority);
    const rankOk = row.sequence_rank !== null;
    const passesFilter = priorityOk && rankOk;

    if (passesFilter) passCount++;

    const statusIcon = passesFilter ? '✅' : '❌';

    console.log(`${statusIcon} ${row.id}`);
    console.log(`   Priority: ${row.priority} ${priorityOk ? '✅' : '❌'}`);
    console.log(`   Sequence Rank: ${row.sequence_rank === null ? 'NULL' : row.sequence_rank} ${rankOk ? '✅' : '❌'}`);
    console.log('');
  });

  console.log('\n=== Summary ===');
  console.log(`Pass sd:next filters: ${passCount}/${result.rows.length}`);
  console.log(`Blocked by filters: ${result.rows.length - passCount}/${result.rows.length}\n`);

  if (passCount === 0) {
    console.log('⚠️  NONE of the SD-HARDENING-V2-* directives will appear in sd:next');
    console.log('\nTo fix:');
    console.log('1. Set priority to \'critical\' or \'high\'');
    console.log('2. Populate sequence_rank field');
    console.log('3. OR create execution baseline with: npm run sd:baseline\n');
  }

  await client.end();
})();
