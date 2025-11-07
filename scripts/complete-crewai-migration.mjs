#!/usr/bin/env node
/**
 * Complete Migration: Add missing constraints and index to research_results
 * SD: SD-CREWAI-COMPETITIVE-INTELLIGENCE-001
 * Database: EHG app database (liapbndqlqxdcgpwntbv)
 * Date: 2025-11-07
 *
 * Current State: Column exists but missing:
 * - NOT NULL constraint
 * - Default value '{}'::jsonb
 * - GIN index
 * - Column comment
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

async function completeMigration() {
  let client;

  try {
    console.log('🔧 Completing Migration');
    console.log('=======================\n');

    // Connect to EHG app database
    console.log('🔌 Connecting to EHG app database...');
    client = await createDatabaseClient('ehg', {
      verify: true,
      verbose: true
    });
    console.log('');

    // Step 1: Set default value for existing NULL values
    console.log('1️⃣ Updating NULL values to empty object...');
    const updateResult = await client.query(`
      UPDATE venture_drafts
      SET research_results = '{}'::jsonb
      WHERE research_results IS NULL;
    `);
    console.log(`✅ Updated ${updateResult.rowCount} rows\n`);

    // Step 2: Set default value for column
    console.log('2️⃣ Setting default value...');
    await client.query(`
      ALTER TABLE venture_drafts
      ALTER COLUMN research_results SET DEFAULT '{}'::jsonb;
    `);
    console.log("✅ Default set to '{}'::jsonb\n");

    // Step 3: Add NOT NULL constraint
    console.log('3️⃣ Adding NOT NULL constraint...');
    await client.query(`
      ALTER TABLE venture_drafts
      ALTER COLUMN research_results SET NOT NULL;
    `);
    console.log('✅ NOT NULL constraint added\n');

    // Step 4: Create GIN index
    console.log('4️⃣ Creating GIN index...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_venture_drafts_research_results
      ON venture_drafts USING GIN (research_results);
    `);
    console.log('✅ GIN index created\n');

    // Step 5: Add column comment
    console.log('5️⃣ Adding column comment...');
    await client.query(`
      COMMENT ON COLUMN venture_drafts.research_results IS
      'Versioned research results from CrewAI competitive intelligence analysis. Structure: { quick_validation: { summary, key_findings, validation_score, timestamp }, deep_competitive: { competitors, market_analysis, pricing_data, positioning, threats_opportunities } }';
    `);
    console.log('✅ Column comment added\n');

    // Verify final state
    console.log('🔍 Verifying final state...');
    const verifyColumn = await client.query(`
      SELECT
        column_name,
        data_type,
        column_default,
        is_nullable
      FROM information_schema.columns
      WHERE table_name = 'venture_drafts'
        AND column_name = 'research_results';
    `);

    const verifyIndex = await client.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'venture_drafts'
        AND indexname = 'idx_venture_drafts_research_results';
    `);

    console.log('');
    console.log('📊 MIGRATION COMPLETE');
    console.log('=====================\n');
    console.log('✅ Column Schema:');
    console.log(`   Type: ${verifyColumn.rows[0].data_type}`);
    console.log(`   Default: ${verifyColumn.rows[0].column_default}`);
    console.log(`   Nullable: ${verifyColumn.rows[0].is_nullable}`);
    console.log('');
    console.log('✅ Index Created:');
    console.log(`   Name: ${verifyIndex.rows[0].indexname}`);
    console.log('   Type: GIN (JSONB)');
    console.log('');
    console.log('📋 Ready for EXEC Implementation');
    console.log('   - Update TypeScript interfaces in /mnt/c/_EHG/ehg/');
    console.log('   - Implement CrewAI service integration');
    console.log('   - Test JSONB query patterns');
    console.log('');

    return {
      status: 'SUCCESS',
      column: verifyColumn.rows[0],
      index: verifyIndex.rows[0]
    };

  } catch (error) {
    console.error('❌ MIGRATION COMPLETION FAILED');
    console.error('================================\n');
    console.error('Error:', error.message);
    console.error('');

    if (error.message.includes('violates not-null constraint')) {
      console.log('⚠️  NULL values exist in research_results column');
      console.log('   Run verification query to check:');
      console.log('   SELECT COUNT(*) FROM venture_drafts WHERE research_results IS NULL;');
    }

    return {
      status: 'FAILED',
      error: error.message
    };

  } finally {
    if (client) {
      await client.end();
      console.log('🔌 Database connection closed\n');
    }
  }
}

// Execute migration completion
completeMigration()
  .then(result => {
    console.log('📊 Final Result:', JSON.stringify(result, null, 2));
    process.exit(result.status === 'SUCCESS' ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
