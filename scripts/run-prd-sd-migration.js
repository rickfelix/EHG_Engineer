#!/usr/bin/env node
/**
 * PRD sd_uuid → sd_id Migration Script
 *
 * Migrates product_requirements_v2.sd_uuid (containing SD.uuid_id values)
 * to product_requirements_v2.sd_id (containing SD.id values)
 *
 * Part of SD ID Schema Cleanup - standardizing on strategic_directives_v2.id
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root
config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runMigration() {
  console.log('='.repeat(60));
  console.log('PRD sd_uuid → sd_id Migration');
  console.log('='.repeat(60));
  console.log('');

  try {
    // Step 1: Check current schema state
    console.log('Step 1: Checking current schema state...');
    const { data: prds, error: prdErr } = await supabase
      .from('product_requirements_v2')
      .select('id, sd_uuid, sd_id, directive_id')
      .limit(5);

    if (prdErr) {
      console.error('Error checking PRDs:', prdErr.message);
      return;
    }

    // Check column existence by inspecting returned data
    const sample = prds[0] || {};
    const hasUuid = 'sd_uuid' in sample;
    const hasSdId = 'sd_id' in sample;

    console.log('Sample PRD columns:', Object.keys(sample).join(', '));
    console.log('sd_uuid column exists:', hasUuid);
    console.log('sd_id column exists:', hasSdId);

    if (!hasUuid) {
      console.log('\n✅ Migration already complete - sd_uuid column does not exist');

      // Verify sd_id is populated
      const { count } = await supabase
        .from('product_requirements_v2')
        .select('*', { count: 'exact', head: true })
        .not('sd_id', 'is', null);

      console.log('PRDs with sd_id populated:', count);
      return;
    }

    // Step 2: Get all PRDs that need migration
    console.log('\nStep 2: Fetching PRDs that need migration...');
    const { data: allPrds, error: allErr } = await supabase
      .from('product_requirements_v2')
      .select('id, sd_uuid, directive_id');

    if (allErr) {
      console.error('Error fetching PRDs:', allErr.message);
      return;
    }

    const prdsWithUuid = allPrds.filter(p => p.sd_uuid);
    console.log('Total PRDs:', allPrds.length);
    console.log('PRDs with sd_uuid:', prdsWithUuid.length);

    // Step 3: Build SD mapping
    console.log('\nStep 3: Building SD uuid_id → id mapping...');
    const { data: sds, error: sdErr } = await supabase
      .from('strategic_directives_v2')
      .select('id, uuid_id, legacy_id');

    if (sdErr) {
      console.error('Error fetching SDs:', sdErr.message);
      return;
    }

    // Create lookup maps
    const uuidToId = new Map();
    const anyToId = new Map();

    sds.forEach(sd => {
      if (sd.uuid_id) {
        uuidToId.set(sd.uuid_id, sd.id);
        anyToId.set(sd.uuid_id, sd.id);
      }
      anyToId.set(sd.id, sd.id);
      if (sd.legacy_id) {
        anyToId.set(sd.legacy_id, sd.id);
      }
    });

    console.log('SD count:', sds.length);
    console.log('uuid_id mappings:', uuidToId.size);

    // Step 4: Check if sd_id column needs to be created
    if (!hasSdId) {
      console.log('\nStep 4: sd_id column does not exist - needs manual DDL');
      console.log('Please run this SQL in Supabase SQL Editor:');
      console.log('');
      console.log('ALTER TABLE product_requirements_v2 ADD COLUMN sd_id VARCHAR(50);');
      console.log('');
      console.log('Then re-run this script.');
      return;
    }

    // Step 5: Update PRDs
    console.log('\nStep 5: Updating PRDs with sd_id values...');
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    let alreadySet = 0;

    for (const prd of allPrds) {
      // Skip if already has sd_id
      if (prd.sd_id) {
        alreadySet++;
        continue;
      }

      // Find the correct SD.id value
      let newSdId = null;

      // Try uuid_id mapping first (most common case)
      if (prd.sd_uuid) {
        newSdId = uuidToId.get(prd.sd_uuid);

        // Maybe sd_uuid already contains SD.id?
        if (!newSdId) {
          newSdId = anyToId.get(prd.sd_uuid);
        }
      }

      // Fallback to directive_id
      if (!newSdId && prd.directive_id) {
        newSdId = anyToId.get(prd.directive_id);
      }

      if (!newSdId) {
        const uuidPreview = prd.sd_uuid ? prd.sd_uuid.substring(0, 8) + '...' : 'null';
        console.log(`  Skip PRD ${prd.id}: No SD match for sd_uuid=${uuidPreview}`);
        skipped++;
        continue;
      }

      // Update the PRD
      const { error: updateErr } = await supabase
        .from('product_requirements_v2')
        .update({ sd_id: newSdId })
        .eq('id', prd.id);

      if (updateErr) {
        console.log(`  Fail PRD ${prd.id}: ${updateErr.message}`);
        failed++;
        continue;
      }

      updated++;
      if (updated % 50 === 0) {
        console.log(`  Progress: ${updated} updated...`);
      }
    }

    console.log('\nUpdate Results:');
    console.log('  Already set:', alreadySet);
    console.log('  Updated:', updated);
    console.log('  Skipped:', skipped);
    console.log('  Failed:', failed);

    // Step 6: Verification
    console.log('\nStep 6: Verification...');

    const { data: verifyData, count: totalCount } = await supabase
      .from('product_requirements_v2')
      .select('*', { count: 'exact', head: true });

    const { count: withSdId } = await supabase
      .from('product_requirements_v2')
      .select('*', { count: 'exact', head: true })
      .not('sd_id', 'is', null);

    console.log('Total PRDs:', totalCount);
    console.log('PRDs with sd_id:', withSdId);

    // Step 7: Test FK lookup
    console.log('\nStep 7: Testing FK lookup...');
    const { data: testJoin, error: joinErr } = await supabase
      .from('product_requirements_v2')
      .select(`
        id,
        sd_id,
        strategic_directives_v2!fk_prd_sd_id (
          id,
          title
        )
      `)
      .not('sd_id', 'is', null)
      .limit(3);

    if (joinErr) {
      console.log('FK join test (may fail if FK not created):', joinErr.message);

      // Manual join test
      const { data: manualTest } = await supabase
        .from('product_requirements_v2')
        .select('id, sd_id')
        .not('sd_id', 'is', null)
        .limit(3);

      if (manualTest && manualTest.length > 0) {
        console.log('Manual join verification:');
        for (const prd of manualTest) {
          const { data: sd } = await supabase
            .from('strategic_directives_v2')
            .select('id, title')
            .eq('id', prd.sd_id)
            .single();

          if (sd) {
            console.log(`  PRD ${prd.id} → SD ${sd.id}: ${sd.title.substring(0, 40)}...`);
          } else {
            console.log(`  PRD ${prd.id} → SD ${prd.sd_id}: NOT FOUND`);
          }
        }
      }
    } else {
      console.log('FK join test passed:');
      testJoin.forEach(p => {
        const sd = p.strategic_directives_v2;
        if (sd) {
          console.log(`  PRD ${p.id} → SD ${sd.id}: ${sd.title.substring(0, 40)}...`);
        }
      });
    }

    console.log('\n' + '='.repeat(60));
    console.log('Migration Complete');
    console.log('='.repeat(60));
    console.log('');
    console.log('Next steps:');
    console.log('1. If sd_uuid column still exists, drop it in Supabase SQL Editor:');
    console.log('   ALTER TABLE product_requirements_v2 DROP COLUMN sd_uuid;');
    console.log('');
    console.log('2. Update code to use sd_id instead of sd_uuid');
    console.log('');

  } catch (error) {
    console.error('Migration error:', error.message);
    console.error(error.stack);
  }
}

runMigration();
