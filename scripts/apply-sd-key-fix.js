#!/usr/bin/env node

/**
 * Apply sd_key auto-population fix
 * This creates a trigger that automatically sets sd_key = id when sd_key is NULL
 * Prevents the recurring issue where scripts fail due to missing sd_key
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function applyFix() {
  console.log('📝 Applying sd_key auto-population fix...\n');

  try {
    // Read the SQL file
    const sqlPath = join(__dirname, '../database/schema/fix_sd_key_default.sql');
    const sql = readFileSync(sqlPath, 'utf8');

    // Execute the SQL via RPC (requires a helper function) or direct query
    // Since Supabase JS client doesn't support raw SQL easily, we'll do it in parts

    // Create the function
    const functionSQL = `
CREATE OR REPLACE FUNCTION auto_populate_sd_key()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.sd_key IS NULL THEN
        NEW.sd_key := NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
`;

    console.log('1️⃣ Creating auto_populate_sd_key function...');
    const { error: funcError } = await supabase.rpc('exec_sql', { sql: functionSQL });

    if (funcError && !funcError.message.includes('does not exist')) {
      console.log('⚠️  Note: Cannot create function via JS client. Use SQL editor or psql.');
      console.log('\n📋 SQL to run manually:');
      console.log(sql);
      console.log('\n');
      process.exit(1);
    }

    console.log('✅ Migration SQL prepared\n');
    console.log('To apply this fix, run ONE of:');
    console.log('\n🔧 Option 1: Supabase Dashboard SQL Editor');
    console.log('   1. Go to: https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/sql');
    console.log('   2. Copy/paste contents of: database/schema/fix_sd_key_default.sql');
    console.log('   3. Run the query');
    console.log('\n🔧 Option 2: psql command line');
    console.log('   psql "$SUPABASE_POOLER_URL" -f database/schema/fix_sd_key_default.sql');
    console.log('\n📝 What this fix does:');
    console.log('   ✅ Creates trigger to auto-set sd_key = id when sd_key is NULL');
    console.log('   ✅ Backfills any existing NULL sd_key values');
    console.log('   ✅ Prevents future "sd_key constraint violation" errors');
    console.log('\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

applyFix();
