#!/usr/bin/env node

/**
 * Apply research_results Migration via Supabase SDK
 * SD: SD-CREWAI-COMPETITIVE-INTELLIGENCE-001
 * User Story: US-001
 * Database Agent Recommendation: Use SERVICE_ROLE_KEY to bypass RLS
 *
 * Per database-agent analysis, PostgreSQL pooler has tenant authentication issues.
 * Using Supabase SDK with SERVICE_ROLE_KEY is the recommended pattern.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

async function applyMigration() {
  console.log('\n🔧 Database Migration Execution (Supabase SDK)');
  console.log('═'.repeat(70));
  console.log('SD: SD-CREWAI-COMPETITIVE-INTELLIGENCE-001');
  console.log('Migration: Add research_results JSONB column to venture_drafts');
  console.log('Database: EHG app (liapbndqlqxdcgpwntbv)');
  console.log('Method: Supabase SDK with SERVICE_ROLE_KEY');
  console.log('');

  try {
    // Create Supabase client for EHG app
    console.log('📡 Connecting via Supabase SDK...');
    const supabase = createClient(
      process.env.EHG_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY // Uses SERVICE_ROLE_KEY to bypass RLS
    );
    console.log('✅ Client initialized');
    console.log('');

    // Step 1: Check if column already exists via schema inspection
    console.log('🔍 Step 1: Checking if column exists...');

    // Test by querying venture_drafts - if research_results column exists, this will work
    const { data: testData, error: testError } = await supabase
      .from('venture_drafts')
      .select('id, research_results')
      .limit(1);

    if (!testError) {
      console.log('⚠️  Column already exists! Skipping migration.');
      console.log('Test query successful - research_results column found.');
      console.log('');
      return;
    }

    // If we get a "column does not exist" error, proceed with migration
    if (testError.message.includes('column') && testError.message.includes('does not exist')) {
      console.log('Column does not exist. Proceeding with migration...');
      console.log('');
    } else {
      throw new Error(`Unexpected error during column check: ${testError.message}`);
    }

    // Step 2: Execute migration SQL via Supabase RPC or direct SQL
    console.log('📝 Step 2: Executing migration SQL...');
    console.log('');
    console.log('⚠️  MANUAL MIGRATION REQUIRED');
    console.log('');
    console.log('Supabase JS SDK does not support ALTER TABLE directly.');
    console.log('Please execute migration via one of these methods:');
    console.log('');
    console.log('Option 1: Supabase Dashboard SQL Editor (RECOMMENDED)');
    console.log('  1. Visit: https://supabase.com/dashboard/project/liapbndqlqxdcgpwntbv/sql');
    console.log('  2. Paste and execute:');
    console.log('');
    console.log('     BEGIN;');
    console.log('     ALTER TABLE venture_drafts');
    console.log('     ADD COLUMN research_results JSONB DEFAULT \\'{}\\'::jsonb NOT NULL;');
    console.log('');
    console.log('     CREATE INDEX idx_venture_drafts_research_results');
    console.log('     ON venture_drafts USING GIN (research_results);');
    console.log('');
    console.log('     COMMENT ON COLUMN venture_drafts.research_results IS');
    console.log('     \\'Versioned research results from CrewAI competitive intelligence analysis\\';');
    console.log('     COMMIT;');
    console.log('');
    console.log('Option 2: Run migration file');
    console.log('  Migration SQL: docs/migrations/add_research_results_to_venture_drafts.sql');
    console.log('');
    console.log('After migration, re-run this script to verify.');
    console.log('');
    console.log('═'.repeat(70));
    process.exit(1);

  } catch (error) {
    console.error('');
    console.error('❌ Migration check failed:', error.message);
    console.error('');
    process.exit(1);
  }
}

applyMigration();
