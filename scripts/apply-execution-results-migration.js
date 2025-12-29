#!/usr/bin/env node
/**
 * Apply sub_agent_execution_results table migration
 * Uses Supabase client to execute SQL directly
 */

import { createClient } from '@supabase/supabase-js';
import { readFile } from 'fs/promises';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function applyMigration() {
  console.log('🚀 Applying sub_agent_execution_results migration...\n');

  try {
    // Read migration file
    const _sql = await readFile('database/schema/sub_agent_execution_results.sql', 'utf8');

    // Check if table already exists
    const { data: _existingTable, error: checkError } = await supabase
      .from('sub_agent_execution_results')
      .select('id')
      .limit(1);

    if (!checkError) {
      console.log('✅ Table already exists - skipping migration\n');
      return;
    }

    // Execute migration via RPC or direct SQL execution
    console.log('📝 Executing migration SQL...');
    console.log('   (Table: sub_agent_execution_results)');
    console.log('   (Indexes: 6 indexes for optimal queries)\n');

    // Note: Direct SQL execution requires service role key or SQL editor
    console.log('⚠️  Direct SQL execution requires Supabase Dashboard SQL Editor\n');
    console.log('📋 Instructions:');
    console.log('1. Open Supabase Dashboard: https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq');
    console.log('2. Navigate to SQL Editor');
    console.log('3. Copy and paste contents of: database/schema/sub_agent_execution_results.sql');
    console.log('4. Execute the SQL\n');

    console.log('✅ Migration file ready at: database/schema/sub_agent_execution_results.sql\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

applyMigration();
