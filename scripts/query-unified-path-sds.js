import { createDatabaseClient } from './lib/supabase-connection.js';

(async () => {
  const client = await createDatabaseClient('engineer', { verify: false });

  try {
    const result = await client.query(`
      SELECT
        id,
        title,
        status,
        parent_sd_id,
        description,
        scope,
        sd_type,
        priority
      FROM strategic_directives_v2
      WHERE id LIKE 'SD-UNIFIED-PATH%'
      ORDER BY
        CASE WHEN parent_sd_id IS NULL THEN 0 ELSE 1 END,
        parent_sd_id NULLS FIRST,
        id
    `);

    console.log('\nUNIFIED-PATH Strategic Directives Hierarchy\n');
    console.log('='.repeat(80));

    const parentSDs = result.rows.filter(row => row.parent_sd_id === null);
    const childSDs = result.rows.filter(row => row.parent_sd_id !== null);

    parentSDs.forEach(parent => {
      console.log(`\n📋 PARENT: ${parent.id}`);
      console.log(`   Title: ${parent.title}`);
      console.log(`   Status: ${parent.status}`);
      console.log(`   Type: ${parent.sd_type || 'N/A'}`);
      console.log(`   Priority: ${parent.priority || 'N/A'}`);
      console.log(`   Description: ${parent.description || 'N/A'}`);
      console.log(`   Scope: ${parent.scope || 'N/A'}`);

      const children = childSDs.filter(child => child.parent_sd_id === parent.id);
      if (children.length > 0) {
        console.log('\n   CHILD SDs:');
        children.forEach(child => {
          console.log(`\n   └─ ${child.id}`);
          console.log(`      Title: ${child.title}`);
          console.log(`      Status: ${child.status}`);
          console.log(`      Type: ${child.sd_type || 'N/A'}`);
          console.log(`      Priority: ${child.priority || 'N/A'}`);
          console.log(`      Description: ${child.description || 'N/A'}`);
          console.log(`      Scope: ${child.scope || 'N/A'}`);
        });
      }
    });

    console.log(`\n${'='.repeat(80)}`);
    console.log(`Total UNIFIED-PATH SDs: ${result.rows.length}`);
    console.log(`Parents: ${parentSDs.length}, Children: ${childSDs.length}`);

  } finally {
    await client.end();
  }
})();
