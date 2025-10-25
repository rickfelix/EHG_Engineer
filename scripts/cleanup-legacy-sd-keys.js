import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function cleanupLegacySDKeys() {
  console.log('🧹 Cleanup: Legacy SD Keys & Data Integrity Check\n');
  console.log('='.repeat(80));

  // Step 1: Find records with non-UUID IDs
  console.log('\n📋 Step 1: Checking for non-UUID IDs...');
  const { data: nonUUIDs, error: uuidError } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, status')
    .not('id', 'like', '________-____-____-____-____________'); // Simple UUID pattern check

  if (uuidError) {
    console.error('❌ Error:', uuidError);
    return;
  }

  console.log(`Found ${nonUUIDs?.length || 0} records with non-UUID IDs`);

  if (nonUUIDs && nonUUIDs.length > 0) {
    console.log('\n⚠️  Records with non-UUID IDs:');
    nonUUIDs.forEach((sd, index) => {
      console.log(`  ${index + 1}. ID: ${sd.id}`);
      console.log(`     SD Key: ${sd.sd_key || '(null)'}`);
      console.log(`     Title: ${sd.title}`);
      console.log(`     Status: ${sd.status}`);
      console.log('');
    });
  }

  // Step 2: Find records with NULL sd_key
  console.log('\n📋 Step 2: Checking for NULL sd_keys...');
  const { data: nullKeys, error: nullError } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, status')
    .is('sd_key', null);

  if (nullError) {
    console.error('❌ Error:', nullError);
    return;
  }

  console.log(`Found ${nullKeys?.length || 0} records with NULL sd_key`);

  if (nullKeys && nullKeys.length > 0) {
    console.log('\n⚠️  Records with NULL sd_key:');
    nullKeys.forEach((sd, index) => {
      console.log(`  ${index + 1}. ID: ${sd.id}`);
      console.log('     SD Key: (null)');
      console.log(`     Title: ${sd.title}`);
      console.log(`     Status: ${sd.status}`);
      console.log('');
    });
  }

  // Step 3: Find duplicate sd_keys
  console.log('\n📋 Step 3: Checking for duplicate sd_keys...');
  const { data: duplicates, error: dupError } = await supabase
    .rpc('find_duplicate_sd_keys'); // Custom function if available

  // Alternative query if RPC doesn't exist
  const { data: allKeys } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, id, title')
    .not('sd_key', 'is', null);

  if (allKeys) {
    const keyCounts = {};
    allKeys.forEach(sd => {
      keyCounts[sd.sd_key] = (keyCounts[sd.sd_key] || []);
      keyCounts[sd.sd_key].push(sd);
    });

    const duplicateKeys = Object.entries(keyCounts).filter(([key, records]) => records.length > 1);

    if (duplicateKeys.length > 0) {
      console.log(`\n⚠️  Found ${duplicateKeys.length} duplicate SD keys:`);
      duplicateKeys.forEach(([key, records]) => {
        console.log(`\n  SD Key: ${key} (used ${records.length} times)`);
        records.forEach((sd, index) => {
          console.log(`    ${index + 1}. ID: ${sd.id} - ${sd.title}`);
        });
      });
    } else {
      console.log('✅ No duplicate sd_keys found');
    }
  }

  // Step 4: Summary
  console.log('\n' + '='.repeat(80));
  console.log('\n📊 Summary:');
  console.log(`  Non-UUID IDs: ${nonUUIDs?.length || 0}`);
  console.log(`  NULL sd_keys: ${nullKeys?.length || 0}`);
  console.log(`  Duplicate sd_keys: ${duplicates?.length || 0}`);

  const hasIssues = (nonUUIDs?.length > 0) || (nullKeys?.length > 0) || (duplicates?.length > 0);

  if (hasIssues) {
    console.log('\n⚠️  Issues found! Run the migration script to fix:');
    console.log('   node scripts/execute-migration.js database/migrations/add-sd-key-constraints.sql');
  } else {
    console.log('\n✅ No issues found! Database is clean.');
  }

  console.log('\n' + '='.repeat(80));
}

cleanupLegacySDKeys();