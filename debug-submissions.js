#!/usr/bin/env node

/**
 * Debug SDIP Submissions Issue
 * Test the exact database query that's failing
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

async function debugSubmissions() {
  console.log('🔍 Debugging SDIP Submissions Issue');
  console.log('=====================================\n');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials');
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Test 1: Check if directive_submissions table exists and its structure
    console.log('1. Checking directive_submissions table structure...');
    const { data: tableData, error: tableError } = await supabase
      .from('directive_submissions')
      .select('*')
      .limit(0);

    if (tableError) {
      console.error('❌ Table error:', tableError.message);
    } else {
      console.log('✅ Table exists and is accessible');
    }

    // Test 2: Check for any existing records
    console.log('\n2. Checking for existing records...');
    const { data: records, error: recordError } = await supabase
      .from('directive_submissions')
      .select('*')
      .limit(5);

    if (recordError) {
      console.error('❌ Record query error:', recordError.message);
      console.error('❌ Full error:', recordError);
    } else {
      console.log(`✅ Found ${records.length} records`);
      if (records.length > 0) {
        console.log('First record:', records[0]);
      }
    }

    // Test 3: Check for records with "anonymous" values
    console.log('\n3. Checking for "anonymous" values...');
    const { data: anonymousRecords, error: anonymousError } = await supabase
      .from('directive_submissions')
      .select('*')
      .eq('created_by', 'anonymous');

    if (anonymousError) {
      console.error('❌ Anonymous query error:', anonymousError.message);
    } else {
      console.log(`✅ Found ${anonymousRecords.length} records with created_by = 'anonymous'`);
    }

    // Test 4: Test the exact query from getRecentSDIPSubmissions
    console.log('\n4. Testing exact query from getRecentSDIPSubmissions...');
    const { data: recentData, error: recentError } = await supabase
      .from('directive_submissions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (recentError) {
      console.error('❌ Recent query error:', recentError.message);
      console.error('❌ Full error details:', recentError);
    } else {
      console.log(`✅ Recent query successful: ${recentData.length} records`);
    }

    // Test 5: Check if there are any UUID fields that might have "anonymous"
    console.log('\n5. Checking table schema...');
    const { data: schemaData, error: schemaError } = await supabase
      .rpc('get_table_columns', { table_name: 'directive_submissions' })
      .select();

    if (schemaError) {
      console.log('⚠️ Could not get schema details (function may not exist)');
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

debugSubmissions().catch(console.error);