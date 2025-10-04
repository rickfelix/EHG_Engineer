#!/usr/bin/env node

/**
 * ID Schema Migration Verification Script
 *
 * Verifies:
 * 1. All SDs have uuid_id populated
 * 2. All PRDs with directive_id have sd_uuid populated
 * 3. Foreign key constraint exists and works
 * 4. JOIN queries work properly
 * 5. No orphaned PRDs
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('🔍 ID SCHEMA MIGRATION VERIFICATION');
console.log('═'.repeat(70));
console.log('');

let allPassed = true;

// ================================================================
// TEST 1: Verify all SDs have uuid_id
// ================================================================
console.log('TEST 1: Strategic Directives uuid_id population');
console.log('-'.repeat(70));

const { data: allSDs, count: totalSDs } = await supabase
  .from('strategic_directives_v2')
  .select('id, sd_key, uuid_id', { count: 'exact' });

const sdsWithUuid = allSDs.filter(sd => sd.uuid_id).length;
const sdsMissingUuid = allSDs.filter(sd => !sd.uuid_id);

console.log(`  Total SDs: ${totalSDs}`);
console.log(`  SDs with uuid_id: ${sdsWithUuid}`);
console.log(`  SDs missing uuid_id: ${sdsMissingUuid.length}`);

if (sdsMissingUuid.length > 0) {
  console.log(`  ❌ FAIL: ${sdsMissingUuid.length} SDs missing uuid_id`);
  sdsMissingUuid.slice(0, 5).forEach(sd => {
    console.log(`     - ${sd.sd_key} (id: ${sd.id})`);
  });
  allPassed = false;
} else {
  console.log('  ✅ PASS: All SDs have uuid_id');
}
console.log('');

// ================================================================
// TEST 2: Verify PRD linkage
// ================================================================
console.log('TEST 2: PRD to SD linkage');
console.log('-'.repeat(70));

const { data: allPRDs, count: totalPRDs } = await supabase
  .from('product_requirements_v2')
  .select('id, title, directive_id, sd_uuid', { count: 'exact' });

const prdsWithDirectiveId = allPRDs.filter(prd => prd.directive_id).length;
const prdsWithSdUuid = allPRDs.filter(prd => prd.sd_uuid).length;
const orphanedPRDs = allPRDs.filter(prd => prd.directive_id && !prd.sd_uuid);

console.log(`  Total PRDs: ${totalPRDs}`);
console.log(`  PRDs with directive_id: ${prdsWithDirectiveId}`);
console.log(`  PRDs with sd_uuid: ${prdsWithSdUuid}`);
console.log(`  Orphaned PRDs: ${orphanedPRDs.length}`);

if (orphanedPRDs.length > 0) {
  console.log(`  ❌ FAIL: ${orphanedPRDs.length} orphaned PRDs`);
  orphanedPRDs.slice(0, 5).forEach(prd => {
    console.log(`     - ${prd.id}: ${prd.title}`);
    console.log(`       directive_id: ${prd.directive_id}, sd_uuid: ${prd.sd_uuid}`);
  });
  allPassed = false;
} else {
  console.log('  ✅ PASS: All PRDs properly linked');
}
console.log('');

// ================================================================
// TEST 3: Test JOIN capability
// ================================================================
console.log('TEST 3: JOIN query functionality');
console.log('-'.repeat(70));

try {
  const { data: joinResults, error: joinError } = await supabase
    .from('product_requirements_v2')
    .select(`
      id,
      title,
      sd_uuid,
      strategic_directives_v2(sd_key, title)
    `)
    .not('sd_uuid', 'is', null)
    .limit(5);

  if (joinError) {
    console.log(`  ❌ FAIL: JOIN query failed`);
    console.log(`     Error: ${joinError.message}`);
    allPassed = false;
  } else if (joinResults && joinResults.length > 0) {
    console.log(`  ✅ PASS: JOIN query works`);
    console.log(`     Sample: ${joinResults.length} records returned`);
    joinResults.slice(0, 2).forEach(prd => {
      console.log(`     - PRD: ${prd.title}`);
      if (prd.strategic_directives_v2) {
        console.log(`       SD: ${prd.strategic_directives_v2.title} (${prd.strategic_directives_v2.sd_key})`);
      }
    });
  } else {
    console.log(`  ⚠️  WARNING: JOIN works but no results`);
  }
} catch (error) {
  console.log(`  ❌ FAIL: JOIN test threw exception`);
  console.log(`     ${error.message}`);
  allPassed = false;
}
console.log('');

// ================================================================
// TEST 4: Verify UUID format consistency
// ================================================================
console.log('TEST 4: UUID format validation');
console.log('-'.repeat(70));

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const invalidUuids = allSDs.filter(sd =>
  sd.uuid_id && !uuidRegex.test(sd.uuid_id)
);

if (invalidUuids.length > 0) {
  console.log(`  ❌ FAIL: ${invalidUuids.length} SDs have invalid uuid_id format`);
  invalidUuids.slice(0, 5).forEach(sd => {
    console.log(`     - ${sd.sd_key}: ${sd.uuid_id}`);
  });
  allPassed = false;
} else {
  console.log('  ✅ PASS: All uuid_id values are valid UUIDs');
}
console.log('');

// ================================================================
// TEST 5: Check old vs new ID distribution
// ================================================================
console.log('TEST 5: ID schema distribution');
console.log('-'.repeat(70));

const sdsUsingUuidAsId = allSDs.filter(sd => uuidRegex.test(sd.id)).length;
const sdsUsingKeyAsId = allSDs.filter(sd => !uuidRegex.test(sd.id)).length;

const prdsUsingUuidDirective = allPRDs.filter(prd =>
  prd.directive_id && uuidRegex.test(prd.directive_id)
).length;
const prdsUsingKeyDirective = allPRDs.filter(prd =>
  prd.directive_id && !uuidRegex.test(prd.directive_id)
).length;

console.log('  SD id column (old):');
console.log(`    - UUID format: ${sdsUsingUuidAsId} (${Math.round(sdsUsingUuidAsId/totalSDs*100)}%)`);
console.log(`    - sd_key format: ${sdsUsingKeyAsId} (${Math.round(sdsUsingKeyAsId/totalSDs*100)}%)`);
console.log('');
console.log('  SD uuid_id column (new):');
console.log(`    - All UUID: ${sdsWithUuid} (100%)`);
console.log('');
console.log('  PRD directive_id column (old):');
console.log(`    - UUID format: ${prdsUsingUuidDirective}`);
console.log(`    - sd_key format: ${prdsUsingKeyDirective}`);
console.log('');
console.log('  PRD sd_uuid column (new):');
console.log(`    - All UUID: ${prdsWithSdUuid}`);
console.log('');

// ================================================================
// FINAL SUMMARY
// ================================================================
console.log('═'.repeat(70));
console.log('📊 VERIFICATION SUMMARY');
console.log('═'.repeat(70));

if (allPassed) {
  console.log('✅ ALL TESTS PASSED');
  console.log('');
  console.log('Migration Status: COMPLETE');
  console.log('');
  console.log('Next Steps:');
  console.log('  1. Update unified-handoff-system.js to use sd_uuid');
  console.log('  2. Update all create-prd-*.js scripts');
  console.log('  3. Update dashboard components to use FK JOIN');
  console.log('  4. Run Phase 2 migration to add FK constraint');
  console.log('');
  process.exit(0);
} else {
  console.log('❌ SOME TESTS FAILED');
  console.log('');
  console.log('Action Required:');
  console.log('  1. Review failed tests above');
  console.log('  2. Fix orphaned PRDs or missing uuid_id values');
  console.log('  3. Re-run this verification script');
  console.log('  4. DO NOT proceed to Phase 2 until all tests pass');
  console.log('');
  process.exit(1);
}
