#!/usr/bin/env node

/**
 * Apply research_results Migration
 * SD: SD-CREWAI-COMPETITIVE-INTELLIGENCE-001
 * User Story: US-001
 * Database Agent Verdict: CONDITIONAL_PASS (88%)
 */

import { createDatabaseClient } from '../lib/supabase-connection.js';
import fs from 'fs';

async function applyMigration() {
  console.log('\n🔧 Database Migration Execution');
  console.log('═'.repeat(70));
  console.log('SD: SD-CREWAI-COMPETITIVE-INTELLIGENCE-001');
  console.log('Migration: Add research_results JSONB column to venture_drafts');
  console.log('Database: EHG app (liapbndqlqxdcgpwntbv)');
  console.log('');

  let client;

  try {
    // Connect to EHG database using PostgreSQL client
    console.log('📡 Connecting to database...');
    client = await createDatabaseClient('app', { verify: false });
    console.log('✅ Connected');
    console.log('');

    // Step 1: Check if column already exists
    console.log('🔍 Step 1: Checking if column exists...');
    const checkResult = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'venture_drafts'
        AND column_name = 'research_results';
    `);

    if (checkResult.rows.length > 0) {
      console.log('⚠️  Column already exists! Skipping migration.');
      console.log('');

      // Verify structure
      const verifyResult = await client.query(`
        SELECT column_name, data_type, column_default, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'venture_drafts'
          AND column_name = 'research_results';
      `);

      console.log('Current schema:');
      console.log(JSON.stringify(verifyResult.rows[0], null, 2));

      await client.end();
      return;
    }

    console.log('Column does not exist. Proceeding with migration...');
    console.log('');

    // Step 2: Add column
    console.log('📝 Step 2: Adding research_results column...');
    await client.query(`
      ALTER TABLE venture_drafts
      ADD COLUMN research_results JSONB DEFAULT '{}'::jsonb NOT NULL;
    `);
    console.log('✅ Column added');

    // Step 3: Create GIN index
    console.log('📝 Step 3: Creating GIN index for performance...');
    await client.query(`
      CREATE INDEX idx_venture_drafts_research_results
      ON venture_drafts USING GIN (research_results);
    `);
    console.log('✅ Index created');

    // Step 4: Add column comment
    console.log('📝 Step 4: Adding column documentation...');
    await client.query(`
      COMMENT ON COLUMN venture_drafts.research_results IS
      'Versioned research results from CrewAI competitive intelligence analysis. Structure: { quick_validation: { summary, key_findings, validation_score, timestamp }, deep_competitive: { competitors, market_analysis, pricing_data, positioning, threats_opportunities } }';
    `);
    console.log('✅ Comment added');

    // Step 5: Verify migration
    console.log('');
    console.log('🔍 Step 5: Verifying migration...');
    const verifyResult = await client.query(`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'venture_drafts'
        AND column_name = 'research_results';
    `);

    if (verifyResult.rows.length === 0) {
      throw new Error('Verification failed: Column not found after migration');
    }

    console.log('✅ Migration verified:');
    console.log(JSON.stringify(verifyResult.rows[0], null, 2));

    console.log('');
    console.log('═'.repeat(70));
    console.log('✅ Migration complete!');
    console.log('═'.repeat(70));
    console.log('');
    console.log('Next steps:');
    console.log('1. Implement US-001: Backend CrewAI routing');
    console.log('2. Test JSONB structure with sample data');
    console.log('3. Verify RLS policies allow SERVICE_ROLE_KEY writes');

  } catch (error) {
    console.error('');
    console.error('❌ Migration failed:', error.message);
    console.error('');
    console.error('Stack trace:', error.stack);
    console.error('');
    console.error('Rollback SQL (run manually if needed):');
    console.error('  DROP INDEX IF EXISTS idx_venture_drafts_research_results;');
    console.error('  ALTER TABLE venture_drafts DROP COLUMN IF EXISTS research_results;');
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
    }
  }
}

applyMigration();
