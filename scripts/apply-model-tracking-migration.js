#!/usr/bin/env node
/**
 * Apply Model Usage Tracking Migration
 */
import { createSupabaseServiceClient } from './lib/supabase-connection.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function applyMigration() {
  console.log('📊 Applying Model Usage Tracking Migration...\n');

  const supabase = await createSupabaseServiceClient('engineer');

  // Check if table already exists
  const { data: existing, error: checkError } = await supabase
    .from('model_usage_log')
    .select('id')
    .limit(1);

  if (!checkError) {
    console.log('✅ model_usage_log table already exists');
    return true;
  }

  if (!checkError.message.includes('does not exist')) {
    console.log('Unexpected error:', checkError.message);
    return false;
  }

  // Table doesn't exist - we need to create it via SQL
  console.log('Table does not exist. Creating via RPC...');

  // Read the migration file
  const migrationPath = path.join(__dirname, '..', 'database', 'migrations', '20251204_model_usage_tracking.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  // Try using rpc if available, otherwise show instructions
  const { error: rpcError } = await supabase.rpc('exec_sql', { sql_query: sql });

  if (rpcError) {
    console.log('\n⚠️  Cannot execute SQL directly. Please apply migration manually:\n');
    console.log('Option 1: Supabase Dashboard SQL Editor');
    console.log('   https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/sql/new');
    console.log('   Paste contents of: database/migrations/20251204_model_usage_tracking.sql\n');
    console.log('Option 2: Direct psql');
    console.log('   psql $DATABASE_URL -f database/migrations/20251204_model_usage_tracking.sql\n');

    // Output the SQL for easy copy
    console.log('='.repeat(60));
    console.log('SQL to execute:');
    console.log('='.repeat(60));
    console.log(sql);

    return false;
  }

  console.log('✅ Migration applied successfully');
  return true;
}

applyMigration().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
