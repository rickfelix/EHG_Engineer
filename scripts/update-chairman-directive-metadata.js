#!/usr/bin/env node

/**
 * Update Chairman Directive Metadata for D1-D6 Grandchildren SDs
 *
 * Updates metadata JSONB column for all 6 grandchildren SDs with:
 * 1. chairman_directive object
 * 2. Updated key_principles array
 */

import { createDatabaseClient } from '../lib/supabase-connection.js';

const SD_KEYS = [
  'vision-transition-001d1',
  'vision-transition-001d2',
  'vision-transition-001d3',
  'vision-transition-001d4',
  'vision-transition-001d5',
  'vision-transition-001d6'
];

const CHAIRMAN_DIRECTIVE = {
  issued_date: '2025-12-10',
  scope_policy: 'NO_REDUCTION',
  build_policy: 'FROM_SCRATCH',
  legacy_policy: 'LEARN_AND_DECOMMISSION',
  instructions: [
    'Build new implementations from scratch - do not simply polish existing',
    'Learn from existing 40-stage implementations but build fresh for 25-stage model',
    'Include ALL Golden Nuggets features in scope',
    'No scope reductions permitted',
    'Decommission legacy implementations after new ones are validated',
    'Complete developments to the letter - 100% implementation required'
  ]
};

const KEY_PRINCIPLES = [
  'Build from scratch for 40→25 stage transition',
  'Learn from legacy implementations, then decommission',
  'No scope reductions - 100% completion required',
  'Include all Golden Nuggets features',
  'Legacy code is reference only, not foundation'
];

async function updateChairmanDirectiveMetadata() {
  let client;

  try {
    console.log('🔌 Connecting to database...');
    client = await createDatabaseClient('engineer', { verify: false });

    console.log('\n📋 Updating metadata for 6 grandchildren SDs...\n');

    const results = [];

    for (const sdKey of SD_KEYS) {
      console.log(`Processing ${sdKey}...`);

      // First, get current metadata and key_principles
      const selectQuery = `
        SELECT id, title, metadata, key_principles
        FROM strategic_directives_v2
        WHERE sd_key = $1
      `;

      const selectResult = await client.query(selectQuery, [sdKey]);

      if (selectResult.rows.length === 0) {
        console.log(`  ❌ SD not found: ${sdKey}`);
        results.push({ sd_key: sdKey, status: 'NOT_FOUND' });
        continue;
      }

      const sd = selectResult.rows[0];
      const currentMetadata = sd.metadata || {};
      const currentPrinciples = sd.key_principles || [];

      // Merge chairman_directive into metadata
      const updatedMetadata = {
        ...currentMetadata,
        chairman_directive: CHAIRMAN_DIRECTIVE
      };

      // Merge new principles with existing (deduplicate)
      const allPrinciples = [...new Set([...currentPrinciples, ...KEY_PRINCIPLES])];

      // Update the SD
      const updateQuery = `
        UPDATE strategic_directives_v2
        SET
          metadata = $1::jsonb,
          key_principles = $2::jsonb,
          updated_at = CURRENT_TIMESTAMP,
          updated_by = 'database-agent:chairman-directive-update'
        WHERE sd_key = $3
        RETURNING id, title, sd_key
      `;

      const updateResult = await client.query(updateQuery, [
        JSON.stringify(updatedMetadata),
        JSON.stringify(allPrinciples),
        sdKey
      ]);

      if (updateResult.rows.length > 0) {
        console.log(`  ✅ Updated: ${sd.title}`);
        results.push({
          sd_key: sdKey,
          sd_id: sd.id,
          title: sd.title,
          status: 'SUCCESS',
          metadata: updatedMetadata,
          key_principles: allPrinciples
        });
      } else {
        console.log(`  ❌ Update failed: ${sdKey}`);
        results.push({ sd_key: sdKey, status: 'FAILED' });
      }
    }

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 UPDATE SUMMARY');
    console.log('='.repeat(80) + '\n');

    const successful = results.filter(r => r.status === 'SUCCESS');
    const failed = results.filter(r => r.status !== 'SUCCESS');

    console.log(`✅ Successful: ${successful.length}`);
    console.log(`❌ Failed: ${failed.length}`);

    if (successful.length > 0) {
      console.log('\n✅ Successfully updated SDs:');
      successful.forEach(r => {
        console.log(`  - ${r.sd_key} (${r.sd_id}): ${r.title}`);
      });
    }

    if (failed.length > 0) {
      console.log('\n❌ Failed updates:');
      failed.forEach(r => {
        console.log(`  - ${r.sd_key}: ${r.status}`);
      });
    }

    // Verification query
    console.log('\n' + '='.repeat(80));
    console.log('🔍 VERIFICATION');
    console.log('='.repeat(80) + '\n');

    const verifyQuery = `
      SELECT
        sd_key,
        id,
        title,
        metadata->>'chairman_directive' IS NOT NULL as has_chairman_directive,
        jsonb_array_length(key_principles) as principle_count
      FROM strategic_directives_v2
      WHERE sd_key = ANY($1)
      ORDER BY sd_key
    `;

    const verifyResult = await client.query(verifyQuery, [SD_KEYS]);

    console.log('Verification Results:');
    verifyResult.rows.forEach(row => {
      const status = row.has_chairman_directive ? '✅' : '❌';
      console.log(`  ${status} ${row.sd_key}: ${row.title}`);
      console.log(`     Chairman Directive: ${row.has_chairman_directive ? 'Present' : 'Missing'}`);
      console.log(`     Key Principles: ${row.principle_count} items`);
    });

    return results;

  } catch (error) {
    console.error('\n❌ Error updating metadata:', error.message);
    console.error(error.stack);
    throw error;
  } finally {
    if (client) {
      await client.end();
      console.log('\n🔌 Database connection closed');
    }
  }
}

// Execute
updateChairmanDirectiveMetadata()
  .then(() => {
    console.log('\n✅ Update complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Update failed:', error);
    process.exit(1);
  });
