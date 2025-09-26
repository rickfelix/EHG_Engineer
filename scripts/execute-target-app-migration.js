#!/usr/bin/env node

/**
 * Execute target application migration
 * Adds target_application field to strategic_directives_v2 table
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function executeMigration() {
  try {
    console.log('🚀 Executing target_application migration...\n');

    // Check if column already exists
    const { data: checkData, error: checkError } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .limit(1);

    if (!checkError) {
      // Try to select the target_application column
      const { error: columnError } = await supabase
        .from('strategic_directives_v2')
        .select('target_application')
        .limit(1);

      if (!columnError) {
        console.log('✅ Column target_application already exists!');
        return true;
      }
    }

    // Read the migration SQL
    const migrationPath = path.join(__dirname, '..', 'database', 'migrations', '2025-09-23-add-target-application.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📝 Migration SQL loaded from:', migrationPath);
    console.log('\nNOTE: This script cannot directly execute DDL statements.');
    console.log('Please execute the following migration in the Supabase SQL Editor:\n');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('URL: https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/sql/new');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('Copy and paste this SQL:\n');
    console.log('---BEGIN SQL---');
    console.log(migrationSQL);
    console.log('---END SQL---\n');

    console.log('After executing the migration, run:');
    console.log('  node scripts/apply-sd-classification.js');

    return false;
  } catch (error) {
    console.error('❌ Error:', error);
    return false;
  }
}

executeMigration();