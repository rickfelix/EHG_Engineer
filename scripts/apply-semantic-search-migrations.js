#!/usr/bin/env node
/**
 * Apply Semantic Search Migrations
 *
 * Applies both vector embedding migrations for Phase 4 deployment:
 * 1. Sub-agent embeddings (leo_sub_agents table)
 * 2. SD embeddings (strategic_directives_v2 table)
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const MIGRATIONS = [
  {
    name: 'Sub-Agent Embeddings',
    file: 'database/migrations/20251017_add_subagent_embeddings.sql',
    verifyQuery: `SELECT column_name FROM information_schema.columns
                  WHERE table_name = 'leo_sub_agents' AND column_name = 'domain_embedding'`
  },
  {
    name: 'SD Embeddings',
    file: 'database/migrations/20251017_add_sd_embeddings.sql',
    verifyQuery: `SELECT column_name FROM information_schema.columns
                  WHERE table_name = 'strategic_directives_v2' AND column_name = 'scope_embedding'`
  }
];

async function applyMigration(migration) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📦 Applying Migration: ${migration.name}`);
  console.log('='.repeat(70));

  try {
    // Read migration file
    const migrationPath = path.join(process.cwd(), migration.file);
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log(`📄 Reading: ${migration.file}`);
    console.log(`📊 Size: ${sql.length} characters`);

    // Note: Supabase client doesn't support executing raw DDL directly
    // We need to provide manual instructions
    console.log('\n⚠️  MANUAL MIGRATION REQUIRED');
    console.log('\nThis migration contains DDL (CREATE, ALTER) statements that must be');
    console.log('applied through the Supabase Dashboard SQL Editor.\n');

    console.log('🔧 Steps to apply manually:');
    console.log('1. Go to: https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/sql/new');
    console.log(`2. Copy the contents of: ${migration.file}`);
    console.log('3. Paste into SQL Editor');
    console.log('4. Click "Run" button\n');

    console.log('📋 Migration Preview (first 500 chars):');
    console.log('-'.repeat(70));
    console.log(sql.substring(0, 500) + '...\n');

    // Ask user to confirm after manual application
    console.log('✋ After applying the migration manually, press Enter to verify...');

    return {
      name: migration.name,
      status: 'manual_required',
      file: migration.file,
      sql: sql
    };

  } catch (error) {
    console.error(`❌ Error reading migration: ${error.message}`);
    return {
      name: migration.name,
      status: 'error',
      error: error.message
    };
  }
}

async function verifyMigration(migration) {
  console.log(`\n🔍 Verifying: ${migration.name}...`);

  try {
    const { data, error } = await supabase.rpc('exec_sql', {
      query: migration.verifyQuery
    }).single();

    if (error) {
      // RPC might not exist, try direct query
      const { data: checkData, error: checkError } = await supabase
        .from('information_schema.columns')
        .select('column_name')
        .match({
          table_name: migration.name.includes('Sub-Agent') ? 'leo_sub_agents' : 'strategic_directives_v2',
          column_name: migration.name.includes('Sub-Agent') ? 'domain_embedding' : 'scope_embedding'
        });

      if (checkError) {
        console.log(`   ⚠️  Cannot verify automatically: ${checkError.message}`);
        console.log('   Please verify manually in Supabase dashboard');
        return false;
      }

      if (checkData && checkData.length > 0) {
        console.log(`   ✅ Verified: Column exists`);
        return true;
      }
    }

    if (data && data.column_name) {
      console.log(`   ✅ Verified: ${data.column_name} column exists`);
      return true;
    }

    console.log(`   ❌ Verification failed: Column not found`);
    return false;

  } catch (error) {
    console.log(`   ⚠️  Verification error: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('\n🚀 Semantic Search Migration Deployment');
  console.log('='.repeat(70));
  console.log('This script will guide you through applying Phase 4 migrations\n');

  const results = [];

  for (const migration of MIGRATIONS) {
    const result = await applyMigration(migration);
    results.push(result);

    if (result.status === 'manual_required') {
      console.log('\n📝 MANUAL STEPS REQUIRED:');
      console.log('\n1. Open Supabase SQL Editor:');
      console.log('   https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/sql/new\n');
      console.log(`2. Copy and paste this SQL:\n`);
      console.log('-'.repeat(70));
      console.log(result.sql);
      console.log('-'.repeat(70));
      console.log('\n3. Click "Run" to execute\n');
      console.log('Press Enter when you have completed the above steps...');

      // Wait for user confirmation (in interactive mode)
      if (process.stdin.isTTY) {
        await new Promise(resolve => {
          process.stdin.once('data', resolve);
        });
      }

      // Verify
      const verified = await verifyMigration(migration);
      result.verified = verified;
    }
  }

  // Summary
  console.log('\n\n' + '='.repeat(70));
  console.log('📊 Migration Summary');
  console.log('='.repeat(70));

  results.forEach(result => {
    const status = result.verified ? '✅ Applied & Verified' :
                   result.status === 'manual_required' ? '⏳ Manual Required' :
                   '❌ Error';
    console.log(`${status} - ${result.name}`);
  });

  console.log('\n='.repeat(70));
  console.log('\n✅ Migration deployment guide complete!');
  console.log('\nNext steps:');
  console.log('1. Verify both migrations in Supabase dashboard');
  console.log('2. Run: node scripts/generate-subagent-embeddings.js');
  console.log('3. Run: node scripts/generate-sd-embeddings.js\n');
}

main().catch(error => {
  console.error('\n❌ Fatal error:', error.message);
  process.exit(1);
});
