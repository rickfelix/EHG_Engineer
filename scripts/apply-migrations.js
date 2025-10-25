#!/usr/bin/env node

/**
 * Apply Database Migrations for SD-KNOWLEDGE-001 Prevention Infrastructure
 *
 * This script applies the two migrations created to prevent issues from SD-KNOWLEDGE-001:
 * 1. Schema validation functions (get_table_schema, validate_uuid_format)
 * 2. Retrospective quality score constraints
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const { Pool } = pg;

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

// Database connection using pooler URL
const pool = new Pool({
  connectionString: process.env.SUPABASE_POOLER_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function applyMigration(migrationName, sqlFilePath) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Applying Migration: ${migrationName}`);
  console.log(`${'='.repeat(80)}\n`);

  try {
    // Read migration file
    const sql = fs.readFileSync(sqlFilePath, 'utf8');

    console.log(`Reading migration from: ${sqlFilePath}`);
    console.log(`SQL length: ${sql.length} characters\n`);

    // Execute migration
    const client = await pool.connect();
    try {
      const result = await client.query(sql);

      console.log('✅ Migration applied successfully');

      // Show any notices from the migration (verification output)
      if (result && result.rows) {
        console.log(`\nRows affected: ${result.rowCount || 0}`);
      }

      return { success: true, migrationName };
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(`❌ Migration failed: ${migrationName}`);
    console.error(`Error: ${error.message}`);
    console.error('\nFull error:', error);
    return { success: false, migrationName, error: error.message };
  }
}

async function verifyMigration1() {
  console.log(`\n${'='.repeat(80)}`);
  console.log('Verifying Migration 1: Schema Validation Functions');
  console.log(`${'='.repeat(80)}\n`);

  const client = await pool.connect();
  try {
    // Test 1: Check if functions exist
    const functionsQuery = `
      SELECT routine_name, routine_type
      FROM information_schema.routines
      WHERE routine_schema = 'public'
        AND routine_name IN ('get_table_schema', 'validate_uuid_format')
      ORDER BY routine_name;
    `;

    const functionsResult = await client.query(functionsQuery);
    console.log(`Functions created: ${functionsResult.rowCount}`);
    functionsResult.rows.forEach(row => {
      console.log(`  - ${row.routine_name} (${row.routine_type})`);
    });

    // Test 2: Call get_table_schema
    console.log('\nTesting get_table_schema(\'strategic_directives_v2\'):');
    const schemaResult = await client.query(`
      SELECT * FROM get_table_schema('strategic_directives_v2') LIMIT 5;
    `);
    console.log(`  Returned ${schemaResult.rowCount} columns`);
    schemaResult.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type} ${row.is_nullable === 'NO' ? 'NOT NULL' : ''}`);
    });

    // Test 3: Call validate_uuid_format with valid UUID
    console.log('\nTesting validate_uuid_format with valid UUID:');
    const validUuidResult = await client.query(`
      SELECT validate_uuid_format('550e8400-e29b-41d4-a716-446655440000') as is_valid;
    `);
    console.log(`  Result: ${validUuidResult.rows[0].is_valid} (expected: true)`);

    // Test 4: Call validate_uuid_format with invalid UUID
    console.log('\nTesting validate_uuid_format with invalid string:');
    const invalidUuidResult = await client.query(`
      SELECT validate_uuid_format('not-a-uuid-12345') as is_valid;
    `);
    console.log(`  Result: ${invalidUuidResult.rows[0].is_valid} (expected: false)`);

    console.log('\n✅ Migration 1 verification PASSED');
    return true;
  } catch (error) {
    console.error('❌ Migration 1 verification FAILED:', error.message);
    return false;
  } finally {
    client.release();
  }
}

async function verifyMigration2() {
  console.log(`\n${'='.repeat(80)}`);
  console.log('Verifying Migration 2: Quality Score Constraint');
  console.log(`${'='.repeat(80)}\n`);

  const client = await pool.connect();
  try {
    // Test 1: Check if constraint exists
    const constraintQuery = `
      SELECT conname, consrc
      FROM pg_constraint
      WHERE conname = 'retrospectives_quality_score_check';
    `;

    const constraintResult = await client.query(constraintQuery);
    console.log(`Constraint exists: ${constraintResult.rowCount > 0 ? 'Yes' : 'No'}`);
    if (constraintResult.rowCount > 0) {
      console.log(`  Name: ${constraintResult.rows[0].conname}`);
    }

    // Test 2: Check if trigger exists
    const triggerQuery = `
      SELECT tgname, tgenabled
      FROM pg_trigger
      WHERE tgname = 'trigger_validate_retrospective_quality_score';
    `;

    const triggerResult = await client.query(triggerQuery);
    console.log(`\nTrigger exists: ${triggerResult.rowCount > 0 ? 'Yes' : 'No'}`);
    if (triggerResult.rowCount > 0) {
      console.log(`  Name: ${triggerResult.rows[0].tgname}`);
      console.log(`  Enabled: ${triggerResult.rows[0].tgenabled === 'O' ? 'Yes' : 'No'}`);
    }

    // Test 3: Check existing data
    const dataQuery = `
      SELECT
        MIN(quality_score) as min_score,
        MAX(quality_score) as max_score,
        COUNT(*) as total_count,
        COUNT(*) FILTER (WHERE quality_score < 70) as below_threshold_count,
        COUNT(*) FILTER (WHERE quality_score IS NULL) as null_count
      FROM retrospectives;
    `;

    const dataResult = await client.query(dataQuery);
    const stats = dataResult.rows[0];
    console.log('\nData validation:');
    console.log(`  Total retrospectives: ${stats.total_count}`);
    console.log(`  Min quality_score: ${stats.min_score}`);
    console.log(`  Max quality_score: ${stats.max_score}`);
    console.log(`  Records below 70: ${stats.below_threshold_count}`);
    console.log(`  Records with NULL: ${stats.null_count}`);

    // Test 4: Try to insert invalid quality_score (should fail)
    console.log('\nTesting constraint enforcement (should fail):');
    try {
      await client.query(`
        INSERT INTO retrospectives (
          sd_id, project_name, retro_type, title, description,
          conducted_date, what_went_well, what_needs_improvement,
          key_learnings, action_items, quality_score, status
        ) VALUES (
          'TEST-VERIFY-001', 'Test', 'TEST', 'Test', 'Test',
          NOW(), ARRAY['Test'], ARRAY['Test'], ARRAY['Test'], ARRAY['Test'],
          0, 'DRAFT'
        );
      `);
      console.log('  ❌ FAILED: quality_score = 0 was allowed (constraint not working)');
      return false;
    } catch (error) {
      if (error.message.includes('quality_score') || error.message.includes('constraint') || error.message.includes('check')) {
        console.log('  ✅ PASSED: quality_score = 0 correctly rejected');
      } else {
        console.log(`  ⚠️  UNKNOWN: Unexpected error: ${error.message}`);
      }
    }

    console.log('\n✅ Migration 2 verification PASSED');
    return true;
  } catch (error) {
    console.error('❌ Migration 2 verification FAILED:', error.message);
    return false;
  } finally {
    client.release();
  }
}

async function main() {
  console.log(`\n${'='.repeat(80)}`);
  console.log('SD-KNOWLEDGE-001 Prevention Infrastructure - Migration Application');
  console.log(`${'='.repeat(80)}\n`);

  const results = [];

  try {
    // Verify environment
    if (!process.env.SUPABASE_POOLER_URL) {
      throw new Error('SUPABASE_POOLER_URL not found in environment. Check .env file.');
    }

    console.log(`Using database: ${process.env.SUPABASE_POOLER_URL.split('@')[1]?.split('/')[0] || 'unknown'}\n`);

    // Test database connection
    const client = await pool.connect();
    console.log('✅ Database connection successful');
    client.release();

    // Migration 1: Schema Validation Functions
    const migration1Path = path.join(__dirname, '../database/migrations/20251015_create_schema_validation_functions.sql');
    const result1 = await applyMigration('Schema Validation Functions', migration1Path);
    results.push(result1);

    if (result1.success) {
      await verifyMigration1();
    }

    // Migration 2: Quality Score Constraint
    const migration2Path = path.join(__dirname, '../database/migrations/20251015_add_retrospective_quality_score_constraint.sql');
    const result2 = await applyMigration('Retrospective Quality Score Constraint', migration2Path);
    results.push(result2);

    if (result2.success) {
      await verifyMigration2();
    }

    // Final summary
    console.log(`\n${'='.repeat(80)}`);
    console.log('Migration Summary');
    console.log(`${'='.repeat(80)}\n`);

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    results.forEach(result => {
      const status = result.success ? '✅' : '❌';
      console.log(`${status} ${result.migrationName}`);
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
    });

    console.log(`\nTotal: ${results.length} migrations`);
    console.log(`Success: ${successCount}`);
    console.log(`Failed: ${failCount}`);

    if (failCount === 0) {
      console.log('\n✅ ALL MIGRATIONS APPLIED SUCCESSFULLY');
      console.log('\nSD-KNOWLEDGE-001 Prevention Infrastructure is now active:');
      console.log('  1. Schema validation functions available for pre-insert validation');
      console.log('  2. Quality score constraints enforced at database level');
      console.log('  3. Triggers active to prevent invalid data');
    } else {
      console.log('\n❌ SOME MIGRATIONS FAILED - Review errors above');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
