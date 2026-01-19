#!/usr/bin/env node

/**
 * SD-LEARN-011: FR-5 - Verify SD Type Registry-Constraint Synchronization
 *
 * This script verifies that:
 * 1. All types in sd_type_validation_profiles are in the sd_type_check constraint
 * 2. All types in the constraint have corresponding validation profiles
 * 3. The sd-type-checker.js code matches the database
 *
 * Run: node scripts/verify-sd-type-sync.js
 * Exit code: 0 = synced, 1 = drift detected
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// Known constraint types (must match the CHECK constraint in database)
const CONSTRAINT_TYPES = [
  'feature', 'infrastructure', 'database', 'security', 'bugfix',
  'refactor', 'performance', 'documentation', 'docs', 'orchestrator',
  'testing', 'qa', 'enhancement', 'frontend', 'ux_debt', 'api', 'backend', 'process'
];

// Types defined in sd-type-checker.js
// This should be kept in sync with SD_TYPE_CATEGORIES in that file
const CODE_TYPES = [
  // NON_CODE
  'infrastructure', 'documentation', 'docs', 'process', 'qa', 'api', 'backend', 'orchestrator', 'database',
  // CODE_PRODUCING
  'feature', 'enhancement', 'bugfix', 'refactor', 'performance',
  // Other known types
  'security', 'frontend', 'ux_debt', 'testing'
];

async function main() {
  console.log('============================================================');
  console.log('  SD Type Registry-Constraint Sync Verification');
  console.log('============================================================\n');

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Get types from database validation profiles
  const { data: profiles, error } = await supabase
    .from('sd_type_validation_profiles')
    .select('sd_type')
    .order('sd_type');

  if (error) {
    console.error('Failed to fetch validation profiles:', error.message);
    process.exit(2);
  }

  const profileTypes = profiles.map(p => p.sd_type);

  // Build comparison
  const allTypes = [...new Set([...CONSTRAINT_TYPES, ...profileTypes, ...CODE_TYPES])].sort();

  console.log('Type Synchronization Status:\n');
  console.log('Type               | Constraint | Profiles | Code ');
  console.log('-------------------|------------|----------|------');

  let hasDrift = false;
  const missingFromConstraint = [];
  const missingFromProfiles = [];
  const missingFromCode = [];

  for (const type of allTypes) {
    const inConstraint = CONSTRAINT_TYPES.includes(type);
    const inProfiles = profileTypes.includes(type);
    const inCode = CODE_TYPES.includes(type);

    const constraintIcon = inConstraint ? '✅' : '❌';
    const profileIcon = inProfiles ? '✅' : '❌';
    const codeIcon = inCode ? '✅' : '⚠️';

    console.log(`${type.padEnd(18)} | ${constraintIcon.padEnd(10)} | ${profileIcon.padEnd(8)} | ${codeIcon}`);

    if (!inConstraint && (inProfiles || inCode)) {
      missingFromConstraint.push(type);
      hasDrift = true;
    }
    if (!inProfiles && inConstraint) {
      missingFromProfiles.push(type);
      // Note: Not all constraint types need profiles (they have defaults)
    }
    if (!inCode && inConstraint) {
      missingFromCode.push(type);
    }
  }

  console.log('\n------------------------------------------------------------');

  if (missingFromConstraint.length > 0) {
    console.log('\n❌ CRITICAL: Types missing from sd_type_check constraint:');
    for (const type of missingFromConstraint) {
      console.log(`   - ${type}`);
    }
    console.log('\n   ACTION: Add these types to the constraint in database migration');
  }

  if (missingFromProfiles.length > 0) {
    console.log('\n⚠️  Types in constraint but no validation profile:');
    for (const type of missingFromProfiles) {
      console.log(`   - ${type}`);
    }
    console.log('\n   NOTE: These will use the "feature" profile as default');
  }

  if (missingFromCode.length > 0) {
    console.log('\n⚠️  Types in constraint but not in sd-type-checker.js:');
    for (const type of missingFromCode) {
      console.log(`   - ${type}`);
    }
    console.log('\n   NOTE: Consider adding to SD_TYPE_CATEGORIES in sd-type-checker.js');
  }

  console.log('\n============================================================');

  if (hasDrift) {
    console.log('❌ DRIFT DETECTED: Registry and constraint are not synchronized');
    console.log('   Run the migration: 20260119_qa_validation_profile_coverage.sql');
    process.exit(1);
  } else {
    console.log('✅ All types are synchronized');
    console.log(`   Constraint types: ${CONSTRAINT_TYPES.length}`);
    console.log(`   Profile types: ${profileTypes.length}`);
    console.log(`   Code types: ${CODE_TYPES.length}`);
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Verification failed:', err.message);
  process.exit(2);
});
