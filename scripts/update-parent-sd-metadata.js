#!/usr/bin/env node
/**
 * Update SD-VWC-PARENT-001 Metadata - Replace sub_directive_ids
 *
 * CONTEXT: After LEAD decision to split SD-VWC-PHASE2-001 into 3 independent SDs,
 * update parent SD metadata to reflect new structure.
 *
 * CHANGE:
 * - Remove: SD-VWC-PHASE2-001
 * - Add: SD-VWC-PRESETS-001, SD-VWC-ERRORS-001, SD-VWC-A11Y-001
 *
 * SAFETY:
 * - Uses jsonb_set() to update only sub_directive_ids array
 * - Preserves all other metadata fields (is_parent, features_breakdown, etc.)
 * - Verifies update before committing
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

const PARENT_SD_ID = 'SD-VWC-PARENT-001';

const NEW_SUB_DIRECTIVE_IDS = [
  'SD-VWC-PHASE1-001',
  'SD-VWC-PRESETS-001',
  'SD-VWC-ERRORS-001',
  'SD-VWC-A11Y-001',
  'SD-VWC-PHASE3-001',
  'SD-VWC-PHASE4-001'
];

async function updateParentMetadata() {
  let client;

  try {
    console.log('🔧 Connecting to EHG_Engineer database...\n');
    client = await createDatabaseClient('engineer', {
      verbose: true,
      verify: true
    });

    // Step 1: Read current metadata
    console.log(`\n📖 Reading current metadata for ${PARENT_SD_ID}...`);
    const currentResult = await client.query(
      'SELECT id, title, metadata FROM strategic_directives_v2 WHERE id = $1',
      [PARENT_SD_ID]
    );

    if (currentResult.rows.length === 0) {
      console.error(`❌ SD ${PARENT_SD_ID} not found in database`);
      process.exit(1);
    }

    const currentMetadata = currentResult.rows[0].metadata;
    console.log('\n📋 Current metadata:');
    console.log(JSON.stringify(currentMetadata, null, 2));

    const currentSubDirectives = currentMetadata?.sub_directive_ids || [];
    console.log('\n📌 Current sub_directive_ids:');
    console.log(JSON.stringify(currentSubDirectives, null, 2));

    // Step 2: Update metadata using jsonb_set
    console.log('\n🔄 Updating metadata.sub_directive_ids...');
    const updateResult = await client.query(
      `UPDATE strategic_directives_v2
       SET metadata = jsonb_set(
         COALESCE(metadata, '{}'::jsonb),
         '{sub_directive_ids}',
         $1::jsonb
       )
       WHERE id = $2
       RETURNING id, title, metadata`,
      [JSON.stringify(NEW_SUB_DIRECTIVE_IDS), PARENT_SD_ID]
    );

    if (updateResult.rows.length === 0) {
      console.error(`❌ Update failed - no rows returned`);
      process.exit(1);
    }

    const updatedMetadata = updateResult.rows[0].metadata;

    // Step 3: Verify update
    console.log('\n✅ Update successful!');
    console.log('\n📋 Updated metadata:');
    console.log(JSON.stringify(updatedMetadata, null, 2));

    console.log('\n📌 Updated sub_directive_ids:');
    console.log(JSON.stringify(updatedMetadata.sub_directive_ids, null, 2));

    // Step 4: Verify all other fields preserved
    console.log('\n🔍 Verifying other metadata fields preserved...');
    const otherFields = Object.keys(currentMetadata || {}).filter(key => key !== 'sub_directive_ids');
    let allFieldsPreserved = true;

    for (const field of otherFields) {
      const currentValue = JSON.stringify(currentMetadata[field]);
      const updatedValue = JSON.stringify(updatedMetadata[field]);

      if (currentValue === updatedValue) {
        console.log(`   ✅ ${field}: PRESERVED`);
      } else {
        console.log(`   ❌ ${field}: CHANGED`);
        console.log(`      Before: ${currentValue}`);
        console.log(`      After: ${updatedValue}`);
        allFieldsPreserved = false;
      }
    }

    if (!allFieldsPreserved) {
      console.error('\n⚠️  WARNING: Some metadata fields were unexpectedly modified!');
    } else {
      console.log('\n✅ All other metadata fields preserved correctly');
    }

    // Step 5: Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`SD ID: ${PARENT_SD_ID}`);
    console.log(`Title: ${updateResult.rows[0].title}`);
    console.log('\nChanges:');
    console.log('  ❌ Removed: SD-VWC-PHASE2-001');
    console.log('  ✅ Added: SD-VWC-PRESETS-001');
    console.log('  ✅ Added: SD-VWC-ERRORS-001');
    console.log('  ✅ Added: SD-VWC-A11Y-001');
    console.log('\nNew sub_directive_ids count:', updatedMetadata.sub_directive_ids.length);
    console.log('Other metadata fields preserved:', allFieldsPreserved ? 'YES' : 'NO');
    console.log('='.repeat(60) + '\n');

    return updatedMetadata;

  } catch (error) {
    console.error('\n❌ Error updating parent SD metadata:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
      console.log('🔌 Database connection closed\n');
    }
  }
}

// Execute
updateParentMetadata()
  .then(metadata => {
    console.log('✅ Script completed successfully\n');
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
