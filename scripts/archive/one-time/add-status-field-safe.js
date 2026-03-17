#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables
config();

async function addStatusFieldSafe() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ Missing Supabase environment variables');
      process.exit(1);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    console.log('🔗 Connected to Supabase');

    // Check if status column already exists
    console.log('🔍 Checking if status column exists...');
    const { data: existingColumns, error: columnError } = await supabase
      .from('information_schema.columns')
      .select('column_name')
      .eq('table_name', 'sdip_submissions')
      .eq('column_name', 'status');

    if (columnError) {
      console.log('⚠️  Could not check existing columns, proceeding anyway');
    } else if (existingColumns && existingColumns.length > 0) {
      console.log('✅ Status column already exists, skipping creation');
      
      // Just update existing records to have proper status
      console.log('🔄 Updating existing records with proper status...');
      const { data: _updatedCount, error: updateError } = await supabase
        .from('sdip_submissions')
        .update({
          status: 'draft'
        })
        .is('status', null);

      if (updateError) {
        console.log('⚠️  Could not update existing records:', updateError.message);
      } else {
        console.log('✅ Updated existing records to have draft status');
      }
      return;
    }

    console.log('❌ Status column does not exist');
    console.log('');
    console.log('🔧 MANUAL SETUP REQUIRED:');
    console.log('========================================');
    console.log('1. Go to: https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/sql');
    console.log('2. Execute this SQL:');
    console.log('');
    console.log('-- Add status field to sdip_submissions');
    console.log('ALTER TABLE sdip_submissions');
    console.log("ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'draft'");
    console.log("CHECK (status IN ('draft', 'ready', 'submitted'));");
    console.log('');
    console.log('-- Add completed_steps field if not exists');
    console.log('ALTER TABLE sdip_submissions');
    console.log('ADD COLUMN IF NOT EXISTS completed_steps INTEGER[] DEFAULT ARRAY[]::INTEGER[];');
    console.log('');
    console.log('-- Create index for performance');
    console.log('CREATE INDEX IF NOT EXISTS idx_sdip_submissions_status');
    console.log('ON sdip_submissions(status);');
    console.log('');
    console.log('-- Update existing records');
    console.log('UPDATE sdip_submissions SET status = CASE');
    console.log("    WHEN resulting_sd_id IS NOT NULL THEN 'submitted'");
    console.log("    WHEN validation_complete = true AND all_gates_passed = true THEN 'ready'");
    console.log("    ELSE 'draft'");
    console.log('END WHERE status IS NULL;');
    console.log('');
    console.log('3. After executing, the status system will be fully active');
    console.log('========================================');

  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  }
}

// Run script
addStatusFieldSafe();