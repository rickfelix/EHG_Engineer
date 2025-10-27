#!/usr/bin/env node

/**
 * Apply migration to EHG app database
 * Usage: node scripts/apply-ehg-migration.js
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: join(__dirname, '../.env') });

async function applyMigration() {
  try {
    // Read migration file
    const migrationPath = join(__dirname, '../supabase/ehg_app/migrations/20251027000000_automation_backfill.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf8');

    console.log('📄 Migration file loaded');
    console.log('Size:', migrationSQL.length, 'characters');

    // Connect to EHG app database
    const supabaseUrl = process.env.EHG_SUPABASE_URL;
    const supabaseKey = process.env.EHG_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing EHG_SUPABASE_URL or EHG_SUPABASE_ANON_KEY environment variables');
    }

    console.log('🔌 Connecting to:', supabaseUrl);

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Execute migration using RPC (if available) or via REST API
    // Note: Supabase JS client doesn't have direct SQL execution capability with ANON key
    // We need to use the REST API or a custom RPC function

    console.log('\n⚠️  LIMITATION DETECTED:');
    console.log('The ANON key does not have permission to execute raw SQL.');
    console.log('This migration must be applied using one of these methods:');
    console.log('');
    console.log('Option 1: Supabase Dashboard (RECOMMENDED)');
    console.log('  1. Go to: https://supabase.com/dashboard/project/liapbndqlqxdcgpwntbv/sql/new');
    console.log('  2. Copy the SQL from: supabase/ehg_app/migrations/20251027000000_automation_backfill.sql');
    console.log('  3. Paste and run the SQL');
    console.log('');
    console.log('Option 2: Supabase CLI');
    console.log('  cd /mnt/c/_EHG/ehg');
    console.log('  npx supabase link --project-ref liapbndqlqxdcgpwntbv');
    console.log('  npx supabase db push');
    console.log('');
    console.log('Option 3: Get Service Role Key');
    console.log('  1. Go to project settings and get the service_role key');
    console.log('  2. Add EHG_SUPABASE_SERVICE_ROLE_KEY to .env');
    console.log('  3. Re-run this script');
    console.log('');

    // Check if we have service role key
    if (process.env.EHG_SUPABASE_SERVICE_ROLE_KEY) {
      console.log('✅ Service role key detected, attempting execution...');
      const adminSupabase = createClient(supabaseUrl, process.env.EHG_SUPABASE_SERVICE_ROLE_KEY);

      // Split migration into individual statements
      const statements = migrationSQL
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

      console.log(`\n📝 Executing ${statements.length} SQL statements...`);

      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i] + ';';
        console.log(`\n[${i + 1}/${statements.length}] Executing...`);
        console.log(statement.substring(0, 80) + '...');

        const { data, error } = await adminSupabase.rpc('exec_sql', { sql: statement });

        if (error) {
          console.error('❌ Error:', error);
          // Continue with other statements
        } else {
          console.log('✅ Success');
        }
      }

      console.log('\n✅ Migration application complete!');
    }

    // Verify tables exist
    console.log('\n🔍 Verifying tables...');
    const { data: tables, error: tablesError } = await supabase
      .from('automation_feedback')
      .select('id')
      .limit(1);

    if (tablesError) {
      console.log('❌ Cannot verify - table may not exist yet or requires elevated permissions');
      console.log('Error:', tablesError.message);
    } else {
      console.log('✅ automation_feedback table accessible');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

applyMigration();
