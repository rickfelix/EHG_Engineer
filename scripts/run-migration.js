#!/usr/bin/env node
/**
 * Run database migration using Supabase service role
 *
 * Usage: node scripts/run-migration.js <migration-file-path>
 * Example: node scripts/run-migration.js database/migrations/20251018_component_registry_embeddings.sql
 *
 * Note: This script uses Supabase service role key if available, otherwise falls back to anon key
 * For DDL operations, you may need to use Supabase Dashboard SQL Editor or direct psql connection
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
// join - available for future path operations
import { join as _join, resolve } from 'path';
import dotenv from 'dotenv';

dotenv.config();

async function runMigration(migrationPath) {
  console.log('\n🚀 Running Migration...\n');
  console.log('='.repeat(70));

  // Read migration file
  const absolutePath = resolve(migrationPath);
  console.log(`📄 Migration file: ${absolutePath}`);

  let sql;
  try {
    sql = readFileSync(absolutePath, 'utf8');
  } catch (_error) {
    console.error(`❌ Failed to read migration file: ${error.message}`);
    process.exit(1);
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing required environment variables:');
    console.error('   SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)');
    console.error('   SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY');
    process.exit(1);
  }

  console.log(`🔗 Connecting to: ${supabaseUrl}`);
  console.log(`🔑 Using: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Service Role Key' : 'Anon Key'}`);

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log('\n⚠️  WARNING: Using anon key. This may fail for DDL operations.');
    console.log('   For best results, set SUPABASE_SERVICE_ROLE_KEY in .env');
    console.log('   Or run migration via Supabase Dashboard → SQL Editor\n');
  }

  console.log('='.repeat(70));
  console.log('');

  const _supabase = createClient(supabaseUrl, supabaseKey);

  try {
    console.log('⚙️  Executing migration SQL via Supabase RPC...\n');

    // Note: Supabase client doesn't directly support arbitrary SQL execution
    // We'll try using the rpc method to execute SQL, but this requires a function
    // For now, we'll suggest manual execution

    console.log('❌ Automated migration execution requires one of the following:\n');
    console.log('Option 1: Supabase Dashboard SQL Editor');
    console.log('   1. Go to: ' + supabaseUrl.replace('https://', 'https://supabase.com/dashboard/project/'));
    console.log('   2. Navigate to: SQL Editor → New Query');
    console.log('   3. Paste the migration SQL and click "Run"\n');

    console.log('Option 2: Direct psql connection (requires network access)');
    console.log('   psql -h db.PROJECT_REF.supabase.co -U postgres -d postgres -p 5432\n');

    console.log('Option 3: Supabase CLI');
    console.log('   supabase db push\n');

    console.log('Migration SQL preview (first 500 chars):');
    console.log('-'.repeat(70));
    console.log(sql.substring(0, 500) + (sql.length > 500 ? '...' : ''));
    console.log('-'.repeat(70));

    process.exit(1);

  } catch (_error) {
    console.error('❌ Migration failed:', error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Get migration path from command line
const migrationPath = process.argv[2];
if (!migrationPath) {
  console.error('Usage: node scripts/run-migration.js <migration-file-path>');
  console.error('Example: node scripts/run-migration.js database/migrations/20251018_component_registry_embeddings.sql');
  process.exit(1);
}

runMigration(migrationPath);
