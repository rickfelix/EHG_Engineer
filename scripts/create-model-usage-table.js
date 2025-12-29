#!/usr/bin/env node
/**
 * Create model_usage_log table via Supabase
 * Uses the approach of checking if table exists and inserting a test record
 */
import { createSupabaseServiceClient } from './lib/supabase-connection.js';

async function createTable() {
  console.log('📊 Setting up Model Usage Tracking...\n');

  const supabase = await createSupabaseServiceClient('engineer');

  // First, check if table already exists by trying to query it
  const { data: _existing, error: checkError } = await supabase
    .from('model_usage_log')
    .select('id')
    .limit(1);

  if (!checkError) {
    console.log('✅ model_usage_log table already exists');
    const { count } = await supabase
      .from('model_usage_log')
      .select('*', { count: 'exact', head: true });
    console.log(`   Current row count: ${count || 0}`);
    return true;
  }

  // Table doesn't exist
  console.log('❌ model_usage_log table does not exist');
  console.log('\nThe table needs to be created via Supabase Dashboard SQL Editor.');
  console.log('\n📋 Quick Steps:');
  console.log('1. Go to: https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/sql/new');
  console.log('2. Copy the SQL below and execute it');
  console.log('\n' + '='.repeat(70));
  console.log(`
-- Model Usage Tracking Table (Simplified)
CREATE TABLE IF NOT EXISTS model_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT,
  sd_id TEXT,
  phase TEXT CHECK (phase IN ('LEAD', 'PLAN', 'EXEC', 'UNKNOWN')),
  subagent_type TEXT,
  subagent_configured_model TEXT,
  reported_model_name TEXT NOT NULL,
  reported_model_id TEXT NOT NULL,
  config_matches_reported BOOLEAN,
  captured_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_model_usage_sd ON model_usage_log(sd_id);
CREATE INDEX IF NOT EXISTS idx_model_usage_subagent ON model_usage_log(subagent_type);
CREATE INDEX IF NOT EXISTS idx_model_usage_time ON model_usage_log(captured_at DESC);

-- RLS
ALTER TABLE model_usage_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON model_usage_log FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON model_usage_log FOR ALL TO authenticated USING (true) WITH CHECK (true);
`);
  console.log('='.repeat(70));

  return false;
}

createTable().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
