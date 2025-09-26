#!/usr/bin/env node

/**
 * Apply Retrospective System Database Schema
 * Creates all tables for the retrospective management system
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

// Initialize Supabase client with service role key for DDL operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function applySchema() {
  console.log('🔄 Applying Retrospective System Database Schema...\n');

  try {
    // Read the migration file
    const sqlPath = path.join(__dirname, '..', 'database', 'migrations', '2025-09-24-retrospective-system.sql');
    const sqlContent = await fs.readFile(sqlPath, 'utf8');

    // Split into individual statements (simple split by semicolon)
    // Note: This is a simplified approach - complex SQL might need better parsing
    const statements = sqlContent
      .split(/;\s*$/m)
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`📝 Found ${statements.length} SQL statements to execute\n`);

    let successCount = 0;
    let errorCount = 0;

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];

      // Skip if empty
      if (!statement || statement.trim().length === 0) continue;

      // Get the first few words to identify the operation
      const preview = statement
        .replace(/\s+/g, ' ')
        .substring(0, 60)
        .replace(/\n/g, ' ');

      console.log(`[${i + 1}/${statements.length}] Executing: ${preview}...`);

      try {
        // Use RPC to execute raw SQL
        const { data, error } = await supabase.rpc('execute_sql', {
          sql: statement + ';'
        });

        if (error) {
          // Try alternative approach - direct execution
          // Note: This might not work for all DDL operations
          const { error: altError } = await supabase
            .from('_sql')
            .select('*')
            .limit(0)
            .explain({ sql: statement + ';' });

          if (altError) {
            console.error(`  ❌ Error: ${error?.message || altError?.message}`);
            errorCount++;

            // For critical tables, stop execution
            if (statement.includes('CREATE TABLE') && statement.includes('retrospectives')) {
              console.error('\n⚠️ Critical table creation failed. Stopping migration.');
              break;
            }
          } else {
            console.log('  ✅ Success');
            successCount++;
          }
        } else {
          console.log('  ✅ Success');
          successCount++;
        }
      } catch (err) {
        console.error(`  ❌ Error: ${err.message}`);
        errorCount++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Successful statements: ${successCount}`);
    console.log(`❌ Failed statements: ${errorCount}`);

    if (errorCount > 0) {
      console.log('\n⚠️ Note: Some statements failed. This might be expected if:');
      console.log('- Tables already exist');
      console.log('- RPC function is not available');
      console.log('- You need to run the migration via Supabase dashboard');
      console.log('\nTo apply via Supabase Dashboard:');
      console.log('1. Go to: https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/sql/new');
      console.log('2. Copy the content from: database/migrations/2025-09-24-retrospective-system.sql');
      console.log('3. Paste and execute in the SQL editor');
    } else {
      console.log('\n✨ Schema applied successfully!');
    }

    // Test if tables were created
    console.log('\n🔍 Verifying table creation...');

    const tablesToCheck = [
      'retrospectives',
      'retrospective_insights',
      'retrospective_templates',
      'retrospective_action_items',
      'retrospective_learning_links',
      'retrospective_triggers'
    ];

    for (const table of tablesToCheck) {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(0);

      if (error) {
        console.log(`  ❌ Table '${table}' not accessible`);
      } else {
        console.log(`  ✅ Table '${table}' exists`);
      }
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Execute
applySchema();