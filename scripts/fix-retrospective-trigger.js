#!/usr/bin/env node
/**
 * Apply fix for retrospective trigger to allow embedding generation
 * SD-2025-1016-EMBEDDING-FIX
 *
 * Issue: auto_populate_retrospective_fields() trigger was blocking embedding updates
 * with overly strict validation that ran on ALL updates.
 *
 * Solution: Make validations conditional - only enforce when relevant fields change
 */

import { createClient } from '@supabase/supabase-js';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  console.log('\n🔧 Fixing retrospective trigger for embedding generation...\n');

  // Initialize Supabase client with SERVICE_ROLE_KEY for admin operations
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Read migration file
    const migrationPath = join(__dirname, '../database/migrations/20251016_fix_retrospective_trigger_for_embeddings.sql');
    console.log(`📖 Reading migration: ${migrationPath}`);
    const sql = await readFile(migrationPath, 'utf-8');

    // Apply migration using rpc to execute raw SQL
    console.log('🚀 Applying migration...');

    // Split by statement (simple approach - split on semicolons outside of function definitions)
    // For this migration, we'll execute it as one block since it's wrapped in BEGIN/COMMIT
    const { data: _data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
      // If exec_sql RPC doesn't exist, try direct execution via REST API
      console.log('⚠️  exec_sql RPC not available, attempting direct execution...');

      // For Supabase, we need to use the REST API with proper headers
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({ query: sql })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      console.log('✅ Migration applied successfully via REST API');
    } else {
      console.log('✅ Migration applied successfully via RPC');
    }

    // Verify trigger exists
    console.log('\n🔍 Verifying trigger...');
    const { data: triggers, error: triggerError } = await supabase
      .from('pg_trigger')
      .select('*')
      .eq('tgname', 'trigger_auto_populate_retrospective_fields');

    if (triggerError) {
      console.log('⚠️  Could not verify trigger (requires pg_trigger view)');
    } else if (triggers && triggers.length > 0) {
      console.log('✅ Trigger verified');
    } else {
      console.log('⚠️  Trigger not found in pg_trigger view');
    }

    console.log('\n✅ Fix complete! Embedding generation should now work.\n');
    console.log('Next steps:');
    console.log('1. Re-run embedding generation script');
    console.log('2. Verify no trigger errors occur');
    console.log('3. Check that embeddings are being generated\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\nDetails:', error);
    console.error('\n📋 Manual application required:');
    console.error('1. Connect to Supabase SQL Editor');
    console.error('2. Copy contents of: database/migrations/20251016_fix_retrospective_trigger_for_embeddings.sql');
    console.error('3. Execute the SQL directly\n');
    process.exit(1);
  }
}

main().catch(console.error);
