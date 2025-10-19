#!/usr/bin/env node
/**
 * Test script for migration 012: Add missing handoff execution columns
 * Tests that all new columns can be inserted and retrieved correctly
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function testMigration() {
  console.log('🧪 Testing migration 012: Add missing handoff execution columns');
  console.log('='.repeat(60));

  try {
    // Step 1: Get a real SD ID
    console.log('\n1. Fetching a real Strategic Directive...');
    const { data: sds, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .limit(1);

    if (sdError) {
      throw new Error(`Failed to fetch SD: ${sdError.message}`);
    }

    if (!sds || sds.length === 0) {
      throw new Error('No Strategic Directives found for testing');
    }

    const sdId = sds[0].id;
    console.log(`   Using SD: ${sdId}`);

    // Step 2: Create test data with all new columns
    const testId = randomUUID();
    const testData = {
      id: testId,
      sd_id: sdId,
      handoff_type: 'TEST-to-TEST',
      from_agent: 'TEST',
      to_agent: 'TEST',
      status: 'accepted',

      // NEW COLUMNS (migration 012):
      initiated_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      validation_passed: true,
      validation_details: {
        test: true,
        migration: '012_add_missing_handoff_execution_columns',
        timestamp: new Date().toISOString(),
        columns_tested: [
          'initiated_at',
          'completed_at',
          'validation_passed',
          'validation_details',
          'template_id',
          'prd_id'
        ]
      },
      template_id: null, // NULL for test (no template assigned)
      prd_id: 'PRD-TEST-001',

      validation_score: 100,
      created_by: 'MIGRATION-TEST-012'
    };

    // Step 3: Insert test record
    console.log('\n2. Inserting test record with all new columns...');
    const { data, error } = await supabase
      .from('sd_phase_handoffs')
      .insert(testData)
      .select();

    if (error) {
      throw new Error(`Insert failed: ${error.message}`);
    }

    console.log('   ✅ Insert successful!');

    // Step 4: Verify all new columns are present and retrievable
    console.log('\n3. Verifying new columns in returned data...');
    const record = data[0];

    const newColumns = {
      initiated_at: record.initiated_at,
      completed_at: record.completed_at,
      validation_passed: record.validation_passed,
      validation_details: record.validation_details,
      template_id: record.template_id,
      prd_id: record.prd_id
    };

    console.log('\n   New columns retrieved:');
    console.log(`   • initiated_at:       ${newColumns.initiated_at}`);
    console.log(`   • completed_at:       ${newColumns.completed_at}`);
    console.log(`   • validation_passed:  ${newColumns.validation_passed}`);
    console.log(`   • validation_details: ${JSON.stringify(newColumns.validation_details).substring(0, 50)}...`);
    console.log(`   • template_id:        ${newColumns.template_id}`);
    console.log(`   • prd_id:             ${newColumns.prd_id}`);

    // Verify all new columns are present
    const requiredColumns = [
      'initiated_at',
      'completed_at',
      'validation_passed',
      'validation_details',
      'template_id',
      'prd_id'
    ];

    const missingColumns = requiredColumns.filter(col => !(col in record));

    if (missingColumns.length > 0) {
      throw new Error(`Missing columns: ${missingColumns.join(', ')}`);
    }

    console.log('\n   ✅ All new columns present and accessible');

    // Step 5: Verify data types
    console.log('\n4. Verifying data types...');
    const typeChecks = [
      { col: 'initiated_at', expected: 'string', actual: typeof record.initiated_at },
      { col: 'completed_at', expected: 'string', actual: typeof record.completed_at },
      { col: 'validation_passed', expected: 'boolean', actual: typeof record.validation_passed },
      { col: 'validation_details', expected: 'object', actual: typeof record.validation_details },
      { col: 'prd_id', expected: 'string', actual: typeof record.prd_id }
    ];

    let typeErrors = [];
    typeChecks.forEach(check => {
      if (check.actual !== check.expected) {
        typeErrors.push(`${check.col}: expected ${check.expected}, got ${check.actual}`);
      } else {
        console.log(`   ✅ ${check.col}: ${check.expected}`);
      }
    });

    if (typeErrors.length > 0) {
      throw new Error(`Type check failed: ${typeErrors.join(', ')}`);
    }

    // Step 6: Clean up test record
    console.log('\n5. Cleaning up test record...');
    const { error: deleteError } = await supabase
      .from('sd_phase_handoffs')
      .delete()
      .eq('id', testId);

    if (deleteError) {
      console.warn(`   ⚠️  Cleanup warning: ${deleteError.message}`);
    } else {
      console.log('   ✅ Cleanup complete');
    }

    // Success!
    console.log('\n' + '='.repeat(60));
    console.log('✅ MIGRATION TEST PASSED');
    console.log('   All 6 new columns working correctly:');
    console.log('   • initiated_at, completed_at, validation_passed');
    console.log('   • validation_details, template_id, prd_id');
    console.log('='.repeat(60));

    process.exit(0);

  } catch (error) {
    console.error('\n❌ MIGRATION TEST FAILED:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run test
testMigration();
