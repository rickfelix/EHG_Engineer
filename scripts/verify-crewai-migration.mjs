#!/usr/bin/env node
/**
 * Verify Migration: research_results column in venture_drafts
 * SD: SD-CREWAI-COMPETITIVE-INTELLIGENCE-001
 * Database: EHG app database (liapbndqlqxdcgpwntbv)
 * Date: 2025-11-07
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

async function verifyMigration() {
  let client;

  try {
    console.log('🔍 Migration Verification');
    console.log('========================\n');

    // Connect to EHG app database
    console.log('🔌 Connecting to EHG app database...');
    client = await createDatabaseClient('ehg', {
      verify: false,
      verbose: false
    });
    console.log('✅ Connected\n');

    // Check column existence and schema
    console.log('1️⃣ Verifying column schema...');
    const columnResult = await client.query(`
      SELECT
        column_name,
        data_type,
        column_default,
        is_nullable,
        character_maximum_length
      FROM information_schema.columns
      WHERE table_name = 'venture_drafts'
        AND column_name = 'research_results';
    `);

    if (columnResult.rows.length === 0) {
      console.error('❌ Column "research_results" does NOT exist');
      return { status: 'COLUMN_MISSING' };
    }

    const column = columnResult.rows[0];
    console.log('✅ Column exists:');
    console.log(`   Name: ${column.column_name}`);
    console.log(`   Type: ${column.data_type}`);
    console.log(`   Default: ${column.column_default}`);
    console.log(`   Nullable: ${column.is_nullable}`);
    console.log('');

    // Validate schema matches expected
    const schemaValid =
      column.data_type === 'jsonb' &&
      column.column_default === "'{}'::jsonb" &&
      column.is_nullable === 'NO';

    if (!schemaValid) {
      console.warn('⚠️  Schema does not match expected:');
      console.warn("   Expected: data_type=jsonb, default='{}'::jsonb, nullable=NO");
      console.warn(`   Actual: data_type=${column.data_type}, default=${column.column_default}, nullable=${column.is_nullable}`);
      console.log('');
    }

    // Check index existence
    console.log('2️⃣ Verifying GIN index...');
    const indexResult = await client.query(`
      SELECT
        indexname,
        indexdef
      FROM pg_indexes
      WHERE tablename = 'venture_drafts'
        AND indexname = 'idx_venture_drafts_research_results';
    `);

    if (indexResult.rows.length === 0) {
      console.error('❌ Index "idx_venture_drafts_research_results" does NOT exist');
      console.log('');
      console.log('🔧 To create index, run:');
      console.log('CREATE INDEX idx_venture_drafts_research_results');
      console.log('ON venture_drafts USING GIN (research_results);');
      return {
        status: 'INDEX_MISSING',
        column: column
      };
    }

    const index = indexResult.rows[0];
    console.log('✅ Index exists:');
    console.log(`   Name: ${index.indexname}`);
    console.log(`   Type: GIN (JSONB)`);
    console.log('');

    // Check column comment
    console.log('3️⃣ Verifying column comment...');
    const commentResult = await client.query(`
      SELECT
        col_description((table_schema||'.'||table_name)::regclass::oid, ordinal_position) as column_comment
      FROM information_schema.columns
      WHERE table_name = 'venture_drafts'
        AND column_name = 'research_results';
    `);

    const comment = commentResult.rows[0]?.column_comment;
    if (comment) {
      console.log('✅ Column comment exists:');
      console.log(`   "${comment.substring(0, 80)}..."`);
      console.log('');
    } else {
      console.warn('⚠️  Column comment missing (optional)');
      console.log('');
    }

    // Test default value on existing rows
    console.log('4️⃣ Testing data integrity...');
    const dataTest = await client.query(`
      SELECT
        id,
        research_results,
        jsonb_typeof(research_results) as json_type,
        created_at
      FROM venture_drafts
      ORDER BY created_at DESC
      LIMIT 3;
    `);

    if (dataTest.rows.length === 0) {
      console.log('⚠️  No data in venture_drafts table (empty table)');
      console.log('');
    } else {
      console.log(`✅ Found ${dataTest.rows.length} rows. Sample data:`);
      dataTest.rows.forEach((row, idx) => {
        console.log(`   Row ${idx + 1}:`);
        console.log(`     ID: ${row.id}`);
        console.log(`     research_results: ${JSON.stringify(row.research_results)}`);
        console.log(`     Type: ${row.json_type}`);
        console.log('');
      });
    }

    // Overall status
    console.log('📊 MIGRATION STATUS');
    console.log('===================\n');

    const allValid = schemaValid && indexResult.rows.length > 0;

    if (allValid) {
      console.log('✅ MIGRATION COMPLETE');
      console.log('   - Column schema correct');
      console.log('   - GIN index created');
      console.log('   - Ready for implementation');
      console.log('');
    } else {
      console.log('⚠️  MIGRATION INCOMPLETE');
      console.log('   - Column exists but schema/index issues detected');
      console.log('   - Review warnings above');
      console.log('');
    }

    return {
      status: allValid ? 'SUCCESS' : 'PARTIAL',
      column: column,
      index: index || null,
      comment: comment || null,
      sampleData: dataTest.rows
    };

  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    return {
      status: 'ERROR',
      error: error.message
    };

  } finally {
    if (client) {
      await client.end();
      console.log('🔌 Database connection closed\n');
    }
  }
}

// Execute verification
verifyMigration()
  .then(result => {
    console.log('📋 Verification Result:');
    console.log(JSON.stringify(result, null, 2));
    console.log('');
    process.exit(result.status === 'SUCCESS' ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
