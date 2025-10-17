#!/usr/bin/env node
/**
 * Diagnose quality_score constraint issue
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

async function diagnose() {
  console.log('🔍 Diagnosing quality_score issue...\n');

  const client = await createDatabaseClient('engineer', {
    verbose: false
  });

  try {
    // Check column data type
    console.log('1. Column data type:');
    const colInfo = await client.query(`
      SELECT
        column_name,
        data_type,
        udt_name,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_name = 'retrospectives'
      AND column_name = 'quality_score'
    `);
    console.log(colInfo.rows[0], '\n');

    // Check all constraints on the column
    console.log('2. All constraints on retrospectives table:');
    const constraints = await client.query(`
      SELECT
        conname AS constraint_name,
        contype AS constraint_type,
        pg_get_constraintdef(oid) AS constraint_definition
      FROM pg_constraint
      WHERE conrelid = 'retrospectives'::regclass
      ORDER BY conname
    `);
    constraints.rows.forEach(row => {
      console.log(`   ${row.constraint_name} (${row.constraint_type}): ${row.constraint_definition}`);
    });
    console.log('');

    // Check if there's a trigger
    console.log('3. Triggers on retrospectives table:');
    const triggers = await client.query(`
      SELECT
        trigger_name,
        event_manipulation,
        action_statement
      FROM information_schema.triggers
      WHERE event_object_table = 'retrospectives'
      ORDER BY trigger_name
    `);
    if (triggers.rows.length > 0) {
      triggers.rows.forEach(row => {
        console.log(`   ${row.trigger_name} (${row.event_manipulation})`);
        console.log(`   Action: ${row.action_statement}`);
      });
    } else {
      console.log('   (No triggers found)');
    }
    console.log('');

    // Try to see what value is actually being checked
    console.log('4. Testing constraint evaluation:');
    const test = await client.query(`
      SELECT
        70 AS test_value,
        (70 >= 70) AS direct_compare,
        (70::INTEGER >= 70) AS cast_compare,
        (70::NUMERIC >= 70) AS numeric_compare,
        CAST(70 AS INTEGER) AS cast_result,
        pg_typeof(70) AS type_of_70
    `);
    console.log(test.rows[0], '\n');

    // Check existing data
    console.log('5. Existing quality_score values:');
    const existing = await client.query(`
      SELECT
        sd_id,
        quality_score,
        pg_typeof(quality_score) AS quality_score_type
      FROM retrospectives
      WHERE quality_score IS NOT NULL
      ORDER BY quality_score
      LIMIT 10
    `);
    if (existing.rows.length > 0) {
      existing.rows.forEach(row => {
        console.log(`   ${row.sd_id}: ${row.quality_score} (${row.quality_score_type})`);
      });
    } else {
      console.log('   (No retrospectives with quality_score found)');
    }
    console.log('');

  } catch (error) {
    console.error('\n❌ Diagnosis failed:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

// Run diagnosis
diagnose()
  .then(() => {
    console.log('✅ Diagnosis complete!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
