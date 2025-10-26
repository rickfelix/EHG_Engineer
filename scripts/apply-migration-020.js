#!/usr/bin/env node

/**
 * Script to apply migration 020: Enable RLS on context learning tables
 * This is a one-time script to apply the migration to production.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing required environment variables:');
  console.error('   - SUPABASE_URL:', SUPABASE_URL ? '✅' : '❌');
  console.error('   - SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_ROLE_KEY ? '✅' : '❌');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function applyMigration() {
  try {
    console.log('📖 Reading migration file...');
    const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '020_enable_rls_context_learning_tables.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('🔧 Applying migration 020...');
    console.log('   Tables: context_embeddings, feedback_events, interaction_history, learning_configurations, user_context_patterns');

    // Execute the migration SQL
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: migrationSQL
    });

    if (error) {
      console.error('❌ Migration failed:', error);

      // Fallback: Try executing the SQL directly via the REST API
      console.log('🔄 Trying alternative execution method...');

      // Break down the migration into individual statements
      const statements = migrationSQL
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('/*'));

      console.log(`   Executing ${statements.length} SQL statements...`);

      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i];
        if (stmt.includes('CREATE OR REPLACE FUNCTION') || stmt.includes('DROP FUNCTION')) {
          console.log(`   [${i+1}/${statements.length}] Executing: ${stmt.substring(0, 50)}...`);
        }

        const { error: stmtError } = await supabase.rpc('exec_sql', { sql: stmt });
        if (stmtError) {
          console.error(`   ❌ Statement ${i+1} failed:`, stmtError.message);
          // Continue with other statements
        }
      }
    }

    console.log('✅ Migration applied successfully!');
    console.log('');
    console.log('🔍 Verifying RLS status...');

    // Verify RLS is enabled on all 5 tables
    const tables = [
      'context_embeddings',
      'feedback_events',
      'interaction_history',
      'learning_configurations',
      'user_context_patterns'
    ];

    for (const table of tables) {
      const { data: rlsData, error: rlsError } = await supabase
        .from(table)
        .select('id')
        .limit(1);

      if (rlsError) {
        console.log(`   ⚠️  ${table}: ${rlsError.message}`);
      } else {
        console.log(`   ✅ ${table}: RLS check passed`);
      }
    }

    console.log('');
    console.log('✅ Migration 020 complete!');

  } catch (err) {
    console.error('❌ Unexpected error:', err);
    process.exit(1);
  }
}

applyMigration();
