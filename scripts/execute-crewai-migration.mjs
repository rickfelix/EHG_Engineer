#!/usr/bin/env node
/**
 * Execute Migration: Add research_results column to venture_drafts
 * SD: SD-CREWAI-COMPETITIVE-INTELLIGENCE-001
 * Database: EHG app database (liapbndqlqxdcgpwntbv)
 * Date: 2025-11-07
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createDatabaseClient } from './lib/supabase-connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MIGRATION_FILE = join(__dirname, '../docs/migrations/add_research_results_to_venture_drafts.sql');

async function executeMigration() {
  let client;

  try {
    console.log('🚀 Starting Migration Execution');
    console.log('================================\n');

    // Read migration file
    console.log('📄 Reading migration file...');
    const migrationSQL = readFileSync(MIGRATION_FILE, 'utf-8');
    console.log('✅ Migration file loaded\n');

    // Connect to EHG app database
    console.log('🔌 Connecting to EHG app database...');
    client = await createDatabaseClient('ehg', {
      verify: true,
      verbose: true
    });
    console.log('');

    // Extract only the forward migration SQL (between BEGIN and COMMIT)
    const beginIndex = migrationSQL.indexOf('BEGIN;');
    const commitIndex = migrationSQL.indexOf('COMMIT;');

    if (beginIndex === -1 || commitIndex === -1) {
      throw new Error('Migration file missing BEGIN/COMMIT block');
    }

    const forwardMigration = migrationSQL.substring(beginIndex, commitIndex + 7);

    console.log('📝 Executing migration...');
    console.log('---');
    console.log(forwardMigration);
    console.log('---\n');

    // Execute migration
    await client.query(forwardMigration);
    console.log('✅ Migration executed successfully!\n');

    // Verify column exists
    console.log('🔍 Verifying migration...');
    const verifyResult = await client.query(`
      SELECT
        column_name,
        data_type,
        column_default,
        is_nullable
      FROM information_schema.columns
      WHERE table_name = 'venture_drafts'
        AND column_name = 'research_results';
    `);

    if (verifyResult.rows.length === 0) {
      throw new Error('Verification failed: research_results column not found');
    }

    console.log('✅ Verification successful:');
    console.log(JSON.stringify(verifyResult.rows[0], null, 2));
    console.log('');

    // Verify index exists
    console.log('🔍 Verifying index...');
    const indexResult = await client.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'venture_drafts'
        AND indexname = 'idx_venture_drafts_research_results';
    `);

    if (indexResult.rows.length === 0) {
      throw new Error('Verification failed: GIN index not found');
    }

    console.log('✅ Index verified:');
    console.log(`   Name: ${indexResult.rows[0].indexname}`);
    console.log(`   Definition: ${indexResult.rows[0].indexdef}`);
    console.log('');

    // Test default value on existing rows
    console.log('🔍 Testing default value...');
    const defaultTest = await client.query(`
      SELECT
        id,
        research_results,
        jsonb_typeof(research_results) as json_type
      FROM venture_drafts
      LIMIT 1;
    `);

    if (defaultTest.rows.length > 0) {
      console.log('✅ Default value test:');
      console.log(`   ID: ${defaultTest.rows[0].id}`);
      console.log(`   research_results: ${JSON.stringify(defaultTest.rows[0].research_results)}`);
      console.log(`   Type: ${defaultTest.rows[0].json_type}`);
      console.log('');
    } else {
      console.log('⚠️  No existing rows to test (table empty)');
      console.log('');
    }

    console.log('🎉 MIGRATION SUCCESS');
    console.log('===================\n');
    console.log('✅ Column added: research_results (JSONB, NOT NULL, default: {})');
    console.log('✅ Index created: idx_venture_drafts_research_results (GIN)');
    console.log('✅ Comment added: Column documentation');
    console.log('');
    console.log('📋 Next Steps:');
    console.log('   1. Update TypeScript interfaces in /mnt/c/_EHG/ehg/ repository');
    console.log('   2. Implement CrewAI research service integration');
    console.log('   3. Test JSONB query patterns');
    console.log('');

    return {
      status: 'SUCCESS',
      column: verifyResult.rows[0],
      index: indexResult.rows[0],
      sample: defaultTest.rows[0] || null
    };

  } catch (error) {
    console.error('❌ MIGRATION FAILED');
    console.error('===================\n');
    console.error('Error:', error.message);
    console.error('');

    // Check if column already exists
    if (error.message.includes('already exists')) {
      console.log('⚠️  Column may already exist. Running verification...');

      try {
        const verifyResult = await client.query(`
          SELECT
            column_name,
            data_type,
            column_default,
            is_nullable
          FROM information_schema.columns
          WHERE table_name = 'venture_drafts'
            AND column_name = 'research_results';
        `);

        if (verifyResult.rows.length > 0) {
          console.log('✅ Column exists with schema:');
          console.log(JSON.stringify(verifyResult.rows[0], null, 2));
          console.log('');
          console.log('🔧 Migration may have been previously applied.');
          console.log('   Verify schema matches expected structure.');
          return {
            status: 'ALREADY_EXISTS',
            column: verifyResult.rows[0]
          };
        }
      } catch (verifyError) {
        console.error('Verification also failed:', verifyError.message);
      }
    }

    console.log('');
    console.log('📋 Rollback SQL (if needed):');
    console.log('---');
    console.log('BEGIN;');
    console.log('DROP INDEX IF EXISTS idx_venture_drafts_research_results;');
    console.log('ALTER TABLE venture_drafts DROP COLUMN IF EXISTS research_results;');
    console.log('COMMIT;');
    console.log('---');
    console.log('');

    return {
      status: 'FAILED',
      error: error.message,
      rollback: true
    };

  } finally {
    if (client) {
      await client.end();
      console.log('🔌 Database connection closed\n');
    }
  }
}

// Execute migration
executeMigration()
  .then(result => {
    console.log('📊 Final Result:', JSON.stringify(result, null, 2));
    process.exit(result.status === 'SUCCESS' || result.status === 'ALREADY_EXISTS' ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
