#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function addBacklogSummaryColumns() {
  console.log('📊 Adding backlog summary columns to strategic_directives_v2...');

  try {
    // Check if columns already exist by attempting to query them
    const { data: _checkData, error: checkError } = await supabase
      .from('strategic_directives_v2')
      .select('id, backlog_summary, backlog_summary_generated_at')
      .limit(1);

    if (!checkError) {
      console.log('✅ Columns already exist!');
      return;
    }

    // If we get here, columns don't exist, so let's add them
    // Using raw SQL through Supabase's rpc if available, or we'll update via the dashboard
    console.log('⚠️  Columns need to be added. Please add the following columns via Supabase Dashboard:');
    console.log('');
    console.log('Table: strategic_directives_v2');
    console.log('Columns to add:');
    console.log('  1. backlog_summary (TEXT) - nullable');
    console.log('  2. backlog_summary_generated_at (TIMESTAMP WITH TIME ZONE) - nullable');
    console.log('');
    console.log('SQL command:');
    console.log(`
ALTER TABLE strategic_directives_v2
ADD COLUMN IF NOT EXISTS backlog_summary TEXT,
ADD COLUMN IF NOT EXISTS backlog_summary_generated_at TIMESTAMP WITH TIME ZONE;
    `);
    console.log('');
    console.log('Dashboard URL: https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/editor');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

addBacklogSummaryColumns();