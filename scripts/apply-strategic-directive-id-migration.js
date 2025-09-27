#!/usr/bin/env node

/**
 * Apply strategic_directive_id migration to product_requirements_v2 table
 * This adds the missing column that the LEO orchestrator expects
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs/promises';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function applyMigration() {
  console.log('🔧 Applying strategic_directive_id migration...');

  try {
    // First, let's try a simpler approach - just add the column and copy data
    console.log('📝 Step 1: Adding strategic_directive_id column...');

    // Since we can't execute DDL directly via Supabase client,
    // let's use a workaround by updating records individually

    // First check if any records exist
    const { data: existingRecords, error: checkError } = await supabase
      .from('product_requirements_v2')
      .select('id, sd_id')
      .not('sd_id', 'is', null);

    if (checkError) {
      console.log('❌ Error checking existing records:', checkError);
      return;
    }

    console.log(`📊 Found ${existingRecords?.length || 0} records with sd_id values`);

    // Manual migration approach: show SQL to execute
    const migrationSQL = `
-- Add strategic_directive_id column to product_requirements_v2
ALTER TABLE product_requirements_v2
ADD COLUMN IF NOT EXISTS strategic_directive_id TEXT;

-- Copy data from sd_id to strategic_directive_id
UPDATE product_requirements_v2
SET strategic_directive_id = sd_id
WHERE sd_id IS NOT NULL AND strategic_directive_id IS NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_prd_v2_strategic_directive_id
ON product_requirements_v2(strategic_directive_id);
`;

    console.log('📋 Please execute the following SQL in Supabase dashboard:');
    console.log('=' .repeat(80));
    console.log(migrationSQL);
    console.log('=' .repeat(80));

    // Save the SQL to a file for easy access
    await fs.writeFile(
      'database/migrations/strategic_directive_id_migration.sql',
      migrationSQL
    );

    console.log('✅ Migration SQL saved to database/migrations/strategic_directive_id_migration.sql');
    console.log('📝 To apply: Copy and paste the SQL into Supabase SQL Editor');
    console.log('🔗 URL: https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/sql');

  } catch (err) {
    console.error('❌ Migration error:', err.message);
  }
}

applyMigration();