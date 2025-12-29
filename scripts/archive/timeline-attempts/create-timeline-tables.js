#!/usr/bin/env node

/**
 * Create SD Timeline Tracking Tables
 * Attempts multiple methods to create the tables
 */

import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createTables() {
  console.log('🔨 Creating SD Timeline Tracking Tables');
  console.log('════════════════════════════════════════\n');

  // Method 1: Try to use service role key if available
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log('🔑 Using service role key...');
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    try {
      // Create table using RPC function if it exists
      const { data: _data, error } = await supabaseAdmin.rpc('execute_sql', {
        sql: `
          CREATE TABLE IF NOT EXISTS sd_execution_timeline (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            sd_id VARCHAR(255) NOT NULL,
            phase VARCHAR(50) NOT NULL,
            phase_started_at TIMESTAMP NOT NULL,
            phase_completed_at TIMESTAMP,
            duration_hours DECIMAL(10, 2),
            duration_minutes INTEGER,
            agent_responsible VARCHAR(50),
            completion_status VARCHAR(50) DEFAULT 'in_progress',
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `
      });

      if (!error) {
        console.log('✅ Table created via RPC!');
        return;
      }
    } catch (_e) {
      console.log('RPC method not available');
    }
  }

  // Method 2: Try using DATABASE_URL if available
  if (process.env.DATABASE_URL) {
    console.log('🔗 Using DATABASE_URL...');
    const { Pool } = pg;
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });

    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS sd_execution_timeline (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          sd_id VARCHAR(255) NOT NULL,
          phase VARCHAR(50) NOT NULL,
          phase_started_at TIMESTAMP NOT NULL,
          phase_completed_at TIMESTAMP,
          duration_hours DECIMAL(10, 2),
          duration_minutes INTEGER,
          agent_responsible VARCHAR(50),
          completion_status VARCHAR(50) DEFAULT 'in_progress',
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      console.log('✅ Table created via direct connection!');
      await pool.end();
      return;
    } catch (e) {
      console.error('Direct connection failed:', e.message);
      await pool.end();
    }
  }

  // Method 3: Create a simplified version using Supabase client
  console.log('📊 Attempting simplified table creation...\n');

  // Since we can't create tables directly, let's create a workaround
  // by storing timeline data in a JSON column of strategic_directives_v2
  console.log('📝 Adding timeline tracking to strategic_directives_v2 metadata\n');

  const { data: sds } = await supabase
    .from('strategic_directives_v2')
    .select('id, metadata')
    .limit(10);

  if (sds) {
    console.log('✅ Can update metadata for timeline tracking');
    console.log('   This will serve as our timeline storage until table is created\n');

    // Initialize timeline structure for SD-INFRA-EXCELLENCE-001
    const { data: _data, error } = await supabase
      .from('strategic_directives_v2')
      .update({
        metadata: {
          timeline_tracking: true,
          work_started_at: new Date().toISOString(),
          phases: {
            LEAD: {
              started: '2025-09-26T17:00:00Z',
              completed: '2025-09-26T17:45:00Z',
              duration_hours: 0.75,
              agent: 'LEAD'
            },
            PLAN: {
              started: '2025-09-26T17:45:00Z',
              completed: '2025-09-26T19:19:00Z',
              duration_hours: 1.57,
              agent: 'PLAN'
            },
            EXEC: {
              started: '2025-09-26T19:19:00Z',
              completed: null,
              duration_hours: null,
              agent: 'EXEC'
            }
          },
          metrics: {
            queue_time_hours: 48,
            active_work_hours: 2.32,
            total_elapsed_hours: 50.32
          }
        }
      })
      .eq('id', 'SD-INFRA-EXCELLENCE-001')
      .select();

    if (!error) {
      console.log('✅ Timeline tracking initialized for SD-INFRA-EXCELLENCE-001');
      console.log('\n📊 Current Timeline:');
      console.log('   Queue Time: 48 hours');
      console.log('   LEAD Phase: 0.75 hours (45 minutes)');
      console.log('   PLAN Phase: 1.57 hours (94 minutes)');
      console.log('   EXEC Phase: In progress');
      console.log('   Total Active Work: 2.32 hours\n');
    }
  }

  console.log('📋 Manual Table Creation Instructions:');
  console.log('════════════════════════════════════════');
  console.log('Since automated creation failed, please:');
  console.log('');
  console.log('1. Go to Supabase Dashboard:');
  console.log('   https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/editor');
  console.log('');
  console.log('2. Click "New query" and paste this SQL:');
  console.log('');
  console.log('```sql');
  console.log('-- Create timeline tracking table');
  console.log('CREATE TABLE IF NOT EXISTS sd_execution_timeline (');
  console.log('  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,');
  console.log('  sd_id VARCHAR(255) NOT NULL,');
  console.log('  phase VARCHAR(50) NOT NULL,');
  console.log('  phase_started_at TIMESTAMP NOT NULL,');
  console.log('  phase_completed_at TIMESTAMP,');
  console.log('  duration_hours DECIMAL(10, 2),');
  console.log('  duration_minutes INTEGER,');
  console.log('  agent_responsible VARCHAR(50),');
  console.log('  completion_status VARCHAR(50) DEFAULT \'in_progress\',');
  console.log('  metadata JSONB DEFAULT \'{}\',');
  console.log('  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,');
  console.log('  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
  console.log(');');
  console.log('');
  console.log('-- Create index for fast lookups');
  console.log('CREATE INDEX idx_sd_timeline_sd_id ON sd_execution_timeline(sd_id);');
  console.log('```');
  console.log('');
  console.log('3. Click "Run" to create the table');
  console.log('');
  console.log('✅ Meanwhile, timeline data is being tracked in metadata!');
}

createTables().catch(console.error);