#!/usr/bin/env node

/**
 * Create SD Timeline Tables using Supabase RPC
 * Following the method documented in CLAUDE.md
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createTablesViaRPC() {
  console.log('🔨 Creating Timeline Tables via RPC (Method from CLAUDE.md)');
  console.log('════════════════════════════════════════════════════════\n');

  // Try to use the execute_sql RPC function as documented
  const { data, error } = await supabase.rpc('execute_sql', {
    sql: `
      -- Create timeline tracking table
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

      -- Create index for fast lookups
      CREATE INDEX IF NOT EXISTS idx_sd_timeline_sd_id ON sd_execution_timeline(sd_id);
      CREATE INDEX IF NOT EXISTS idx_sd_timeline_phase ON sd_execution_timeline(phase);

      -- Insert initial data for SD-INFRA-EXCELLENCE-001
      INSERT INTO sd_execution_timeline (
        sd_id, phase, phase_started_at, phase_completed_at,
        duration_hours, duration_minutes, agent_responsible, completion_status
      ) VALUES
      ('SD-INFRA-EXCELLENCE-001', 'LEAD', '2025-09-26T17:00:00Z', '2025-09-26T17:45:00Z', 0.75, 45, 'LEAD', 'completed'),
      ('SD-INFRA-EXCELLENCE-001', 'PLAN', '2025-09-26T17:45:00Z', '2025-09-26T19:19:00Z', 1.57, 94, 'PLAN', 'completed'),
      ('SD-INFRA-EXCELLENCE-001', 'EXEC', '2025-09-26T19:19:00Z', NULL, NULL, NULL, 'EXEC', 'in_progress')
      ON CONFLICT DO NOTHING;
    `
  });

  if (error) {
    if (error.message?.includes('execute_sql')) {
      console.log('❌ RPC function execute_sql not available');
      console.log('   This is expected - it needs to be created first\n');

      // Try a simpler approach - create the RPC function first
      console.log('📝 To enable SQL execution, create this function in Supabase:');
      console.log('════════════════════════════════════════════════════════\n');
      console.log('```sql');
      console.log('-- Run this in Supabase SQL Editor to enable execute_sql');
      console.log('CREATE OR REPLACE FUNCTION execute_sql(sql text)');
      console.log('RETURNS json AS $$');
      console.log('DECLARE');
      console.log('  result json;');
      console.log('BEGIN');
      console.log('  EXECUTE sql;');
      console.log('  RETURN json_build_object(\'status\', \'success\');');
      console.log('EXCEPTION WHEN OTHERS THEN');
      console.log('  RETURN json_build_object(');
      console.log('    \'status\', \'error\',');
      console.log('    \'message\', SQLERRM');
      console.log('  );');
      console.log('END;');
      console.log('$$ LANGUAGE plpgsql SECURITY DEFINER;');
      console.log('```\n');
    } else {
      console.error('Error:', error);
    }
  } else {
    console.log('✅ Tables created successfully via RPC!');
    console.log('Data returned:', data);
  }

  // Check if table exists now
  const { data: checkData, error: checkError } = await supabase
    .from('sd_execution_timeline')
    .select('*')
    .eq('sd_id', 'SD-INFRA-EXCELLENCE-001')
    .order('phase_started_at');

  if (!checkError) {
    console.log('\n✅ Timeline table exists and contains data:');
    checkData.forEach(row => {
      const duration = row.duration_hours ? `${row.duration_hours} hours` : 'In progress';
      console.log(`   ${row.phase}: ${duration}`);
    });
  } else {
    console.log('\n📋 Table still needs to be created manually');
    console.log('Go to: https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/editor');
  }
}

createTablesViaRPC().catch(console.error);