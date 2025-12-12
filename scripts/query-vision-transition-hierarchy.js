import { createDatabaseClient } from './lib/supabase-connection.js';

(async () => {
  const client = await createDatabaseClient('engineer', { verify: false });

  try {
    console.log('=== VISION TRANSITION SD HIERARCHY ===\n');

    // Query all Vision Transition SDs
    const result = await client.query(`
      SELECT
        id,
        title,
        status,
        current_phase,
        parent_sd_id,
        sequence_rank,
        metadata,
        created_at
      FROM strategic_directives_v2
      WHERE id LIKE 'SD-VISION-TRANSITION-001%'
      ORDER BY id
    `);

    console.log(`Found ${result.rows.length} Vision Transition SDs:\n`);

    result.rows.forEach(sd => {
      console.log(`${sd.id}`);
      console.log(`  Title: ${sd.title}`);
      console.log(`  Status: ${sd.status}`);
      console.log(`  Phase: ${sd.current_phase || 'N/A'}`);
      console.log(`  Parent: ${sd.parent_sd_id || 'None (root)'}`);
      console.log(`  Sequence Rank: ${sd.sequence_rank || 'N/A'}`);
      console.log(`  Created: ${sd.created_at}`);

      if (sd.metadata) {
        console.log(`  Metadata Keys: ${Object.keys(sd.metadata).join(', ')}`);

        // Show Kochel integration scope if present
        if (sd.id === 'SD-VISION-TRANSITION-001D' && sd.metadata) {
          console.log('  --- Kochel Integration Scope ---');
          console.log(JSON.stringify(sd.metadata, null, 4));
        }
      }
      console.log('');
    });

    // Check for SD-001F specifically
    const hasF = result.rows.find(sd => sd.id === 'SD-VISION-TRANSITION-001F');
    console.log('\n=== SD-VISION-TRANSITION-001F Status ===');
    console.log(hasF ? 'EXISTS ✅' : 'DOES NOT EXIST ❌');

    // Check draft status SDs
    console.log('\n=== DRAFT STATUS SDs ===');
    const drafts = result.rows.filter(sd => sd.status === 'draft');
    if (drafts.length > 0) {
      drafts.forEach(sd => {
        console.log(`  - ${sd.id}: ${sd.title}`);
      });
    } else {
      console.log('  None in draft status');
    }

    // Show parent-child relationships
    console.log('\n=== HIERARCHY TREE ===');
    const roots = result.rows.filter(sd => !sd.parent_sd_id);
    const children = result.rows.filter(sd => sd.parent_sd_id);

    roots.forEach(root => {
      console.log(`${root.id} [${root.status}]`);
      const rootChildren = children.filter(c => c.parent_sd_id === root.id);
      rootChildren.forEach(child => {
        console.log(`  └─ ${child.id} [${child.status}]`);
        const grandChildren = children.filter(c => c.parent_sd_id === child.id);
        grandChildren.forEach(gc => {
          console.log(`      └─ ${gc.id} [${gc.status}]`);
        });
      });
    });

    // Check for gaps in sequence
    console.log('\n=== SEQUENCE GAP ANALYSIS ===');
    const suffixes = result.rows.map(sd => sd.id.replace('SD-VISION-TRANSITION-001', ''));
    const expectedSuffixes = ['', 'A', 'B', 'C', 'D', 'E', 'F'];
    const missing = expectedSuffixes.filter(s => !suffixes.includes(s));

    if (missing.length > 0) {
      console.log('Missing SDs:', missing.map(s => `SD-VISION-TRANSITION-001${s}`).join(', '));
    } else {
      console.log('No gaps found in sequence (base through F)');
    }

  } catch (error) {
    console.error('Error querying database:', error.message);
    console.error(error.stack);
  } finally {
    await client.end();
  }
})();
