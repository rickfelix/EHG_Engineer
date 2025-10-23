#!/usr/bin/env node
/**
 * Check SD-VWC-PARENT-001 structure and verify references after Phase 2 split
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

async function checkVWCParent() {
  const client = await createDatabaseClient('engineer', { verbose: false });

  try {
    console.log('\n=== SD-VWC-PARENT-001 Details ===\n');

    // Get parent SD details
    const parentQuery = `
      SELECT
        id,
        title,
        status,
        progress,
        dependencies,
        metadata,
        description,
        implementation_guidelines,
        created_at,
        updated_at
      FROM strategic_directives_v2
      WHERE id = 'SD-VWC-PARENT-001';
    `;

    const parentResult = await client.query(parentQuery);

    if (parentResult.rows.length === 0) {
      console.log('Parent SD not found!');
      return;
    }

    const parent = parentResult.rows[0];
    console.log('ID:', parent.id);
    console.log('Title:', parent.title);
    console.log('Status:', parent.status);
    console.log('Progress:', parent.progress);
    console.log('\nDependencies:', JSON.stringify(parent.dependencies, null, 2));
    console.log('\nMetadata:', JSON.stringify(parent.metadata, null, 2));

    // Check for Phase 2 references
    console.log('\n=== Checking for SD-VWC-PHASE2-001 References ===\n');

    const hasPhase2InDeps = JSON.stringify(parent.dependencies || {}).includes('SD-VWC-PHASE2-001');
    const hasPhase2InMeta = JSON.stringify(parent.metadata || {}).includes('SD-VWC-PHASE2-001');
    const hasPhase2InDesc = (parent.description || '').includes('SD-VWC-PHASE2-001');
    const hasPhase2InImpl = (parent.implementation_guidelines || '').includes('SD-VWC-PHASE2-001');

    console.log('In dependencies:', hasPhase2InDeps ? 'YES' : 'NO');
    console.log('In metadata:', hasPhase2InMeta ? 'YES' : 'NO');
    console.log('In description:', hasPhase2InDesc ? 'YES' : 'NO');
    console.log('In implementation_guidelines:', hasPhase2InImpl ? 'YES' : 'NO');

    console.log('\n=== VWC SD Family Tree ===\n');

    // Get all VWC SDs
    const familyQuery = `
      SELECT
        id,
        title,
        status,
        progress,
        dependencies,
        metadata->>'parent_sd' as parent_sd,
        created_at
      FROM strategic_directives_v2
      WHERE id LIKE 'SD-VWC-%'
      ORDER BY
        CASE
          WHEN id LIKE '%-PARENT-%' THEN 1
          WHEN id LIKE '%-PHASE1-%' THEN 2
          WHEN id LIKE '%-PHASE2-%' THEN 3
          WHEN id LIKE '%-PHASE3-%' THEN 4
          WHEN id LIKE '%-PHASE4-%' THEN 5
          ELSE 6
        END,
        id;
    `;

    const familyResult = await client.query(familyQuery);

    familyResult.rows.forEach(sd => {
      console.log(`\n${sd.id}`);
      console.log(`  Title: ${sd.title}`);
      console.log(`  Status: ${sd.status}`);
      console.log(`  Progress: ${sd.progress}`);
      console.log(`  Parent: ${sd.parent_sd || 'None'}`);
      console.log(`  Dependencies: ${JSON.stringify(sd.dependencies || {})}`);
    });

    console.log('\n=== Analysis & Recommendations ===\n');

    // Count child SDs by status
    const children = familyResult.rows.filter(sd => sd.id !== 'SD-VWC-PARENT-001');
    const active = children.filter(sd => sd.status !== 'cancelled' && sd.status !== 'completed');
    const completed = children.filter(sd => sd.status === 'completed');
    const cancelled = children.filter(sd => sd.status === 'cancelled');

    console.log(`Total child SDs: ${children.length}`);
    console.log(`  Active: ${active.length}`);
    console.log(`  Completed: ${completed.length}`);
    console.log(`  Cancelled: ${cancelled.length}`);

    console.log('\nNew SDs created from Phase 2 split:');
    const newSDs = familyResult.rows.filter(sd =>
      sd.id === 'SD-VWC-PRESETS-001' ||
      sd.id === 'SD-VWC-ERRORS-001' ||
      sd.id === 'SD-VWC-A11Y-001'
    );

    if (newSDs.length > 0) {
      newSDs.forEach(sd => {
        console.log(`  - ${sd.id}: ${sd.status}`);
      });
    } else {
      console.log('  WARNING: No new SDs found! Expected SD-VWC-PRESETS-001, SD-VWC-ERRORS-001, SD-VWC-A11Y-001');
    }

    console.log('\nRecommendations:');
    if (hasPhase2InDeps || hasPhase2InMeta || hasPhase2InDesc || hasPhase2InImpl) {
      console.log('  ACTION REQUIRED: Parent SD contains references to SD-VWC-PHASE2-001');
      console.log('  Update parent SD to reference the 3 new SDs instead:');
      console.log('    - SD-VWC-PRESETS-001');
      console.log('    - SD-VWC-ERRORS-001');
      console.log('    - SD-VWC-A11Y-001');
    } else {
      console.log('  No action needed - parent SD does not reference Phase 2 directly');
    }

    console.log('\n');

  } catch (error) {
    console.error('Error querying database:', error);
    throw error;
  } finally {
    await client.end();
  }
}

checkVWCParent()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
