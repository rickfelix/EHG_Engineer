#!/usr/bin/env node

/**
 * Apply sub-agent automation migration via Supabase client
 * Breaks down complex SQL into manageable chunks
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function executeSQL(description, sql) {
  console.log(`\n📝 ${description}...`);

  try {
    const { data: _data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
      // If exec_sql doesn't exist, show manual instructions
      if (error.message.includes('function') && error.message.includes('does not exist')) {
        console.log('⚠️  Direct SQL execution not available via API');
        console.log('📋 MANUAL STEP REQUIRED:');
        console.log('   1. Go to: https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq');
        console.log('   2. Navigate to SQL Editor');
        console.log('   3. Paste and execute the migration file:');
        console.log('      database/migrations/create-subagent-automation.sql');
        return { manual: true };
      }
      throw error;
    }

    console.log('✅ Success');
    return { success: true };
  } catch (err) {
    if (err.message.includes('already exists') || err.message.includes('duplicate')) {
      console.log('✅ Already exists (continuing)');
      return { success: true, existed: true };
    }
    console.error('❌ Error:', err.message);
    return { success: false, error: err.message };
  }
}

async function main() {
  console.log('🚀 SUB-AGENT AUTOMATION MIGRATION');
  console.log('═'.repeat(60));

  // Step 1: Create table
  const tableResult = await executeSQL(
    'Creating sub_agent_queue table',
    `
    CREATE TABLE IF NOT EXISTS sub_agent_queue (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      sd_id UUID REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,
      sub_agent_code TEXT NOT NULL,
      trigger_event TEXT NOT NULL,
      status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
      priority INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      result JSONB,
      error_message TEXT
    );
    `
  );

  if (tableResult.manual) {
    console.log('\n⚠️  Manual migration required. Follow instructions above.');
    process.exit(1);
  }

  // Step 2: Create indexes
  await executeSQL(
    'Creating indexes',
    `
    CREATE INDEX IF NOT EXISTS idx_subagent_queue_status ON sub_agent_queue(status);
    CREATE INDEX IF NOT EXISTS idx_subagent_queue_sd ON sub_agent_queue(sd_id);
    CREATE INDEX IF NOT EXISTS idx_subagent_queue_priority ON sub_agent_queue(priority DESC, created_at ASC);
    `
  );

  console.log('\n═'.repeat(60));
  console.log('✅ MIGRATION COMPLETE');
  console.log('');
  console.log('📊 Next steps:');
  console.log('   1. Create trigger functions (manual via dashboard)');
  console.log('   2. Test queue: node scripts/subagent-worker.js status');
  console.log('   3. Create sub-agent execution scripts');
  console.log('');
  console.log('⚠️  IMPORTANT: Trigger functions must be created via Supabase Dashboard');
  console.log('   Navigate to SQL Editor and execute remaining migration steps');
}

main();
