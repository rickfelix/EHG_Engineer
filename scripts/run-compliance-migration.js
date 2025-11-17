#!/usr/bin/env node

/**
 * Run Quick-Fix Compliance Migration
 * Adds compliance_score, compliance_verdict, compliance_details columns
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

async function runMigration() {
  console.log('\n🔄 Running Quick-Fix Compliance Migration...\n');

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
  );

  // Test if columns already exist
  console.log('   Checking if migration already applied...');

  try {
    const { data, error } = await supabase
      .from('quick_fixes')
      .select('compliance_score, compliance_verdict, compliance_details')
      .limit(1);

    if (!error) {
      console.log('   ✅ Columns already exist - migration previously applied\n');
      return;
    }
  } catch (err) {
    // Columns don't exist, continue with migration
  }

  console.log('   ℹ️  Columns not found - migration needed\n');
  console.log('   Migration file: database/migrations/20251117_add_quick_fix_compliance_columns.sql\n');
  console.log('   Please run migration via Supabase dashboard SQL editor:\n');
  console.log('   1. Go to Supabase Dashboard → SQL Editor');
  console.log('   2. Copy contents of migration file');
  console.log('   3. Execute SQL\n');

  const sql = readFileSync('database/migrations/20251117_add_quick_fix_compliance_columns.sql', 'utf-8');
  console.log('   SQL to execute:');
  console.log('   ┌' + '─'.repeat(70) + '┐');
  sql.split('\n').forEach(line => {
    if (line.trim() && !line.startsWith('--')) {
      console.log('   │ ' + line.padEnd(68) + ' │');
    }
  });
  console.log('   └' + '─'.repeat(70) + '┘\n');
}

runMigration().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
