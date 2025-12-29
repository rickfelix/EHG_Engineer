#!/usr/bin/env node
/**
 * Verify quality_score constraint is working correctly
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

async function verifyFix() {
  console.log('🔍 Verifying quality_score constraint fix...\n');

  const client = await createDatabaseClient('engineer', {
    verbose: false
  });

  try {
    // Test 1: Try quality_score = 70 (should succeed)
    console.log('Test 1: Inserting retrospective with quality_score = 70...');
    try {
      await client.query(`
        INSERT INTO retrospectives (
          sd_id, project_name, retro_type, title, description,
          conducted_date, what_went_well, what_needs_improvement,
          key_learnings, action_items, quality_score, status
        ) VALUES (
          'TEST-VERIFY-001', 'Test', 'TEST', 'Test', 'Test',
          NOW(), '["Test"]'::jsonb, '["Test"]'::jsonb, '["Test"]'::jsonb, '["Test"]'::jsonb,
          70, 'DRAFT'
        )
      `);

      // Clean up
      await client.query('DELETE FROM retrospectives WHERE sd_id = \'TEST-VERIFY-001\'');
      console.log('✅ Test 1 PASSED: quality_score = 70 accepted\n');
    } catch (_err) {
      console.log(`❌ Test 1 FAILED: quality_score = 70 rejected - ${err.message}\n`);
    }

    // Test 2: Try quality_score = 100 (should succeed)
    console.log('Test 2: Inserting retrospective with quality_score = 100...');
    try {
      await client.query(`
        INSERT INTO retrospectives (
          sd_id, project_name, retro_type, title, description,
          conducted_date, what_went_well, what_needs_improvement,
          key_learnings, action_items, quality_score, status
        ) VALUES (
          'TEST-VERIFY-002', 'Test', 'TEST', 'Test', 'Test',
          NOW(), '["Test"]'::jsonb, '["Test"]'::jsonb, '["Test"]'::jsonb, '["Test"]'::jsonb,
          100, 'DRAFT'
        )
      `);

      // Clean up
      await client.query('DELETE FROM retrospectives WHERE sd_id = \'TEST-VERIFY-002\'');
      console.log('✅ Test 2 PASSED: quality_score = 100 accepted\n');
    } catch (_err) {
      console.log(`❌ Test 2 FAILED: quality_score = 100 rejected - ${err.message}\n`);
    }

    // Test 3: Try quality_score = 69 (should fail)
    console.log('Test 3: Inserting retrospective with quality_score = 69...');
    try {
      await client.query(`
        INSERT INTO retrospectives (
          sd_id, project_name, retro_type, title, description,
          conducted_date, what_went_well, what_needs_improvement,
          key_learnings, action_items, quality_score, status
        ) VALUES (
          'TEST-VERIFY-003', 'Test', 'TEST', 'Test', 'Test',
          NOW(), '["Test"]'::jsonb, '["Test"]'::jsonb, '["Test"]'::jsonb, '["Test"]'::jsonb,
          69, 'DRAFT'
        )
      `);

      console.log('❌ Test 3 FAILED: quality_score = 69 was accepted (should be rejected)\n');
    } catch (_err) {
      console.log('✅ Test 3 PASSED: quality_score = 69 correctly rejected\n');
    }

    // Test 4: Try quality_score = 101 (should fail)
    console.log('Test 4: Inserting retrospective with quality_score = 101...');
    try {
      await client.query(`
        INSERT INTO retrospectives (
          sd_id, project_name, retro_type, title, description,
          conducted_date, what_went_well, what_needs_improvement,
          key_learnings, action_items, quality_score, status
        ) VALUES (
          'TEST-VERIFY-004', 'Test', 'TEST', 'Test', 'Test',
          NOW(), '["Test"]'::jsonb, '["Test"]'::jsonb, '["Test"]'::jsonb, '["Test"]'::jsonb,
          101, 'DRAFT'
        )
      `);

      console.log('❌ Test 4 FAILED: quality_score = 101 was accepted (should be rejected)\n');
    } catch (_err) {
      console.log('✅ Test 4 PASSED: quality_score = 101 correctly rejected\n');
    }

    // Check current constraint
    console.log('📊 Current constraint definition:');
    const constraintInfo = await client.query(`
      SELECT
        conname AS constraint_name,
        pg_get_constraintdef(oid) AS constraint_definition
      FROM pg_constraint
      WHERE conname = 'retrospectives_quality_score_check'
    `);

    if (constraintInfo.rows.length > 0) {
      console.log(`   Name: ${constraintInfo.rows[0].constraint_name}`);
      console.log(`   Definition: ${constraintInfo.rows[0].constraint_definition}\n`);
    } else {
      console.log('   ⚠️  Constraint not found!\n');
    }

  } catch (_error) {
    console.error('\n❌ Verification failed:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

// Run verification
verifyFix()
  .then(() => {
    console.log('✅ Verification complete!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
