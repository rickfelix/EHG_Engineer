#!/usr/bin/env node

/**
 * Apply venture_decisions migration via Supabase
 * SD-HARDENING-V1-003 - Decision Table Split-Brain Resolution
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyMigration() {
  console.log('=== Applying venture_decisions migration ===\n');

  // Step 1: Create the table
  console.log('Step 1: Creating venture_decisions table...');

  const createTableResult = await supabase.rpc('fn_execute_sql_admin', {
    sql_text: `
      CREATE TABLE IF NOT EXISTS venture_decisions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
        stage INTEGER NOT NULL,
        gate_type TEXT CHECK (gate_type IN ('hard_gate', 'soft_gate', 'auto_advance', 'advisory_checkpoint')),
        recommendation TEXT CHECK (recommendation IN ('proceed', 'pivot', 'fix', 'kill', 'pause')),
        decision TEXT CHECK (decision IN ('proceed', 'pivot', 'fix', 'kill', 'pause', 'override')),
        notes TEXT,
        decided_by UUID,
        decided_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        chairman_decision_id UUID
      );
    `
  });

  if (createTableResult.error) {
    // RPC doesn't exist, try direct approach
    console.log('Admin SQL RPC not available, trying direct insert test...');

    // Check if table exists by trying to query it
    const { error: queryError } = await supabase
      .from('venture_decisions')
      .select('id')
      .limit(1);

    if (queryError && queryError.code === 'PGRST116') {
      console.log('Table venture_decisions already exists, checking if we can use it...');
    } else if (queryError && queryError.message.includes('does not exist')) {
      console.log('');
      console.log('Table does not exist and cannot create via API.');
      console.log('Please apply the migration via Supabase SQL Editor.');
      console.log('');
      console.log('Migration file: ../ehg/supabase/migrations/20251218_create_venture_decisions_table.sql');
      console.log('');
      console.log('Or copy this SQL to Supabase SQL Editor:');
      console.log(`
CREATE TABLE IF NOT EXISTS venture_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  stage INTEGER NOT NULL,
  gate_type TEXT CHECK (gate_type IN ('hard_gate', 'soft_gate', 'auto_advance', 'advisory_checkpoint')),
  recommendation TEXT CHECK (recommendation IN ('proceed', 'pivot', 'fix', 'kill', 'pause')),
  decision TEXT CHECK (decision IN ('proceed', 'pivot', 'fix', 'kill', 'pause', 'override')),
  notes TEXT,
  decided_by UUID,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  chairman_decision_id UUID
);

CREATE INDEX IF NOT EXISTS idx_venture_decisions_venture_id ON venture_decisions(venture_id);
CREATE INDEX IF NOT EXISTS idx_venture_decisions_stage ON venture_decisions(venture_id, stage);
CREATE INDEX IF NOT EXISTS idx_venture_decisions_pending ON venture_decisions(venture_id) WHERE decision IS NULL;
CREATE INDEX IF NOT EXISTS idx_venture_decisions_created ON venture_decisions(created_at DESC);

ALTER TABLE venture_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "venture_decisions_select" ON venture_decisions FOR SELECT TO authenticated USING (true);
CREATE POLICY "venture_decisions_insert" ON venture_decisions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "venture_decisions_update" ON venture_decisions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
      `);
      return;
    } else {
      console.log('Query result:', queryError || 'Table exists and accessible');
    }
  } else {
    console.log('Table created successfully via RPC');
  }

  // Verify table exists
  console.log('\nVerifying table...');
  const { error: verifyError } = await supabase
    .from('venture_decisions')
    .select('id')
    .limit(1);

  if (verifyError) {
    console.log('Verification error:', verifyError.message);
  } else {
    console.log('✅ venture_decisions table is accessible!');
  }
}

applyMigration().catch(console.error);
