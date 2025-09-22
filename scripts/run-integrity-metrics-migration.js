#!/usr/bin/env node

/**
 * Run Integrity Metrics Migration
 * Creates the integrity_metrics table in Supabase
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function runMigration() {
  console.log('🚀 Running Integrity Metrics Migration');
  console.log('📍 Database:', process.env.NEXT_PUBLIC_SUPABASE_URL);

  try {
    // Read the migration file
    const migrationPath = path.join(__dirname, '../database/migrations/2025-09-22-integrity-metrics.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📝 Migration SQL loaded');

    // First, check if the table already exists
    const { data: testData, error: testError } = await supabase
      .from('integrity_metrics')
      .select('id')
      .limit(1);

    if (testError && testError.message.includes("Could not find the table")) {
      console.log('⚠️  Table does not exist. Attempting to create...');

      // Try using RPC to execute SQL (if the function exists)
      const { data, error } = await supabase.rpc('execute_sql', {
        sql: migrationSQL
      });

      if (error && error.message.includes('execute_sql')) {
        console.error('\n❌ Cannot create table via JS client (RPC function not available).');
        console.log('\n📋 Please run this SQL in the Supabase Dashboard:');
        console.log('   https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/sql');
        console.log('\n' + '='.repeat(60));
        console.log(migrationSQL);
        console.log('='.repeat(60) + '\n');
        return;
      } else if (error) {
        throw error;
      }
    } else if (!testError) {
      console.log('✅ Table integrity_metrics already exists!');
      return;
    } else {
      throw testError;
    }

    console.log('✅ Migration completed successfully');

    // Verify the table exists
    const { count, error: countError } = await supabase
      .from('integrity_metrics')
      .select('*', { count: 'exact', head: true });

    if (!countError) {
      console.log(`✅ Table verified: integrity_metrics exists (${count || 0} rows)`);
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.log('\n📋 Please run the migration manually in Supabase Dashboard:');
    console.log('   https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/sql');
    process.exit(1);
  }
}

runMigration();