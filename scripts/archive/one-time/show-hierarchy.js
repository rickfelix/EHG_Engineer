#!/usr/bin/env node
import { createDatabaseClient } from './lib/supabase-connection.js';

(async () => {
  const client = await createDatabaseClient('engineer', { verify: false });

  const result = await client.query(`
    SELECT id, title, parent_sd_id
    FROM strategic_directives_v2
    WHERE id LIKE 'SD-UNIFIED-PATH%'
    ORDER BY id
  `);

  console.log('\n📊 FINAL FLATTENED HIERARCHY\n');
  console.log('Total SDs:', result.rows.length);
  console.log('');

  const roots = result.rows.filter(sd => !sd.parent_sd_id || !sd.parent_sd_id.startsWith('SD-UNIFIED-PATH'));
  for (const root of roots) {
    console.log(`📁 ${root.id}`);
    console.log(`   ${root.title}`);
    const children = result.rows.filter(sd => sd.parent_sd_id === root.id);
    for (const child of children) {
      console.log(`   ├─ ${child.id}`);
      console.log(`   │  ${child.title}`);
      const grandchildren = result.rows.filter(sd => sd.parent_sd_id === child.id);
      for (const gc of grandchildren) {
        console.log(`   │  └─ ${gc.id}`);
        console.log(`   │     ${gc.title}`);
      }
    }
    console.log('');
  }

  await client.end();
})();
