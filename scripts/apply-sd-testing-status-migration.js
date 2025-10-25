#!/usr/bin/env node
/**
 * Apply sd_testing_status migration to database
 * SD-TEST-001: Simplified implementation
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

async function applyMigration() {
  console.log('🔄 Applying sd_testing_status migration...\n');

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  try {
    // Read the SQL file
    const sql = readFileSync('database/schema/sd_testing_status.sql', 'utf8');

    // Split into individual statements (simple split by semicolon)
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`📝 Found ${statements.length} SQL statements to execute\n`);

    // Execute each statement using RPC
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i] + ';';

      // Skip comments
      if (stmt.startsWith('--') || stmt.trim().startsWith('COMMENT')) {
        console.log(`⏭️  Skipping comment/metadata statement ${i + 1}`);
        continue;
      }

      console.log(`🔨 Executing statement ${i + 1}/${statements.length}...`);

      try {
        // Use rpc to execute raw SQL
        const { data, error } = await supabase.rpc('exec_sql', { sql: stmt });

        if (error) {
          // Check if error is benign (already exists)
          if (error.message.includes('already exists') ||
              error.message.includes('does not exist')) {
            console.log(`   ⚠️  ${error.message}`);
            successCount++;
          } else {
            console.log(`   ❌ Error: ${error.message}`);
            failCount++;
          }
        } else {
          console.log('   ✅ Success');
          successCount++;
        }
      } catch (err) {
        console.log(`   ❌ Exception: ${err.message}`);
        failCount++;
      }
    }

    console.log('\n📊 Migration Summary:');
    console.log(`   Success: ${successCount}`);
    console.log(`   Failed: ${failCount}`);
    console.log(`   Total: ${statements.length}\n`);

    // Verify table exists
    console.log('🔍 Verifying table creation...');
    const { data: tables, error: tableError } = await supabase
      .from('sd_testing_status')
      .select('*')
      .limit(1);

    if (tableError) {
      console.log(`❌ Table verification failed: ${tableError.message}`);
      console.log('\n💡 Manual migration required via Supabase SQL Editor');
      console.log('   URL: https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/editor');
    } else {
      console.log('✅ Table sd_testing_status exists and is accessible\n');

      // Verify view exists
      console.log('🔍 Verifying view creation...');
      const { data: viewData, error: viewError } = await supabase
        .from('v_untested_sds')
        .select('*')
        .limit(1);

      if (viewError) {
        console.log(`⚠️  View verification: ${viewError.message}`);
      } else {
        console.log('✅ View v_untested_sds exists and is accessible');
        console.log(`   Sample count: ${viewData?.length || 0} SDs\n`);
      }
    }

    console.log('✅ Migration process complete!\n');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
}

applyMigration();
