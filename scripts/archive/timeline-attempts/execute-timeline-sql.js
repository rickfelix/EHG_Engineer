#!/usr/bin/env node

/**
 * Execute SQL to create SD timeline tracking tables
 * Uses Supabase RPC to execute raw SQL
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function executeSql() {
  console.log('🔧 Creating SD Timeline Tracking Tables in EHG_Engineer database...\n');
  console.log('Database: dedlbzhpgkmetvhbkyzq (EHG_Engineer)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Read the SQL file
    const sqlContent = await fs.readFile(
      './database/schema/sd_execution_timeline.sql',
      'utf-8'
    );

    // Split SQL into individual statements (by semicolon followed by newline)
    const statements = sqlContent
      .split(/;\s*\n/)
      .filter(stmt => stmt.trim().length > 0)
      .map(stmt => stmt.trim() + ';');

    console.log(`📝 Found ${statements.length} SQL statements to execute\n`);

    // Since we can't execute raw SQL directly via Supabase client,
    // let's create the table using JavaScript

    // First, check if table exists
    const { data: _existingTable, error: checkError } = await supabase
      .from('sd_execution_timeline')
      .select('id')
      .limit(1);

    if (!checkError || checkError.code !== 'PGRST205') {
      console.log('ℹ️  Table sd_execution_timeline already exists');
      return;
    }

    console.log('❌ Cannot execute raw SQL via Supabase client');
    console.log('');
    console.log('📋 To create the table, you have two options:\n');
    console.log('Option 1: Supabase Dashboard (Recommended)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('1. Go to: https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/editor');
    console.log('2. Make sure you\'re in the SQL Editor tab');
    console.log('3. Copy the SQL from: ./database/schema/sd_execution_timeline.sql');
    console.log('4. Paste and click "Run"\n');

    console.log('Option 2: Use Supabase CLI (if installed)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('supabase db push --db-url postgresql://[connection-string]');
    console.log('');

    // As a workaround, let's at least document what we want to track
    console.log('📊 What this will track once created:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✓ Phase start and end times');
    console.log('✓ Duration in each phase');
    console.log('✓ Agent responsible for each phase');
    console.log('✓ Overall SD completion metrics');
    console.log('✓ Phase speed categories (Fast/Normal/Slow)');
    console.log('✓ Historical analysis of SD completion times');

    // For now, let's track in the metadata of the SD itself
    console.log('\n🔄 Updating SD metadata with timeline info...');

    const timelineData = {
      lead_phase: {
        started: '2025-09-24T15:20:51Z',
        completed: '2025-09-26T17:00:00Z',
        duration_hours: 49.65
      },
      plan_phase: {
        started: '2025-09-26T17:00:00Z',
        completed: '2025-09-26T19:19:00Z',
        duration_hours: 2.32
      },
      exec_phase: {
        started: '2025-09-26T19:19:00Z',
        completed: null,
        duration_hours: null
      },
      total_elapsed_hours: 52.0,
      tracking_added: new Date().toISOString()
    };

    const { data: _data, error } = await supabase
      .from('strategic_directives_v2')
      .update({
        metadata: {
          timeline: timelineData,
          tracking_enabled: true
        }
      })
      .eq('id', 'SD-INFRA-EXCELLENCE-001')
      .select();

    if (error) {
      console.error('Error updating metadata:', error);
    } else {
      console.log('✅ Timeline data stored in SD metadata');
      console.log('\n📈 SD-INFRA-EXCELLENCE-001 Timeline:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('LEAD Phase: 49.7 hours (completed)');
      console.log('PLAN Phase: 2.3 hours (completed)');
      console.log('EXEC Phase: In progress');
      console.log('Total Elapsed: 52 hours');
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

executeSql().catch(console.error);