#!/usr/bin/env node
/**
 * Apply orchestrator SD completion migration
 * Run: node scripts/apply-orchestrator-migration.js
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyMigration() {
  console.log('🔄 Applying Orchestrator SD Completion Migration');
  console.log('='.repeat(50));

  // Read the migration file
  const migrationPath = join(__dirname, '../database/migrations/20251212_orchestrator_sd_completion.sql');
  const sql = readFileSync(migrationPath, 'utf8');

  // Extract and execute each function separately
  const functionMatches = sql.matchAll(/CREATE OR REPLACE FUNCTION\s+(\w+)/g);
  const functions = [...functionMatches].map(m => m[1]);

  console.log('Functions to create:', functions);

  // For each function, extract its definition and execute via RPC
  // Since we can't execute raw SQL via Supabase client, we need to use
  // the exec_sql function if it exists, or document manual steps

  // Test if is_orchestrator_sd function exists
  try {
    const { data, error } = await supabase.rpc('is_orchestrator_sd', {
      sd_id_param: 'SD-VISION-TRANSITION-001'
    });

    if (error) {
      console.log('❌ Function not yet created. Manual migration required.');
      console.log('');
      console.log('Please apply the migration manually using psql or Supabase SQL editor:');
      console.log('');
      console.log('File: database/migrations/20251212_orchestrator_sd_completion.sql');
      console.log('');
      console.log('Or use Supabase Dashboard SQL Editor to paste and run the migration.');
      return false;
    }

    console.log('✅ is_orchestrator_sd result:', data);
    return true;
  } catch (err) {
    console.log('Error:', err.message);
    return false;
  }
}

// Test orchestrator detection after migration
async function testOrchestratorDetection() {
  console.log('\n🧪 Testing Orchestrator Detection');
  console.log('-'.repeat(50));

  // Test is_orchestrator_sd
  const { data: isOrch, error: orchError } = await supabase.rpc('is_orchestrator_sd', {
    sd_id_param: 'SD-VISION-TRANSITION-001'
  });

  if (orchError) {
    console.log('❌ is_orchestrator_sd error:', orchError.message);
    return;
  }

  console.log('Is orchestrator:', isOrch);

  // Test orchestrator_children_complete
  const { data: childrenComplete, error: childError } = await supabase.rpc('orchestrator_children_complete', {
    sd_id_param: 'SD-VISION-TRANSITION-001'
  });

  if (childError) {
    console.log('❌ orchestrator_children_complete error:', childError.message);
    return;
  }

  console.log('Children complete:', childrenComplete);

  // Test calculate_orchestrator_progress
  const { data: progress, error: progressError } = await supabase.rpc('calculate_orchestrator_progress', {
    sd_id_param: 'SD-VISION-TRANSITION-001'
  });

  if (progressError) {
    console.log('❌ calculate_orchestrator_progress error:', progressError.message);
    return;
  }

  console.log('Orchestrator progress:', progress);

  // Test get_progress_breakdown
  const { data: breakdown, error: breakdownError } = await supabase.rpc('get_progress_breakdown', {
    sd_id_param: 'SD-VISION-TRANSITION-001'
  });

  if (breakdownError) {
    console.log('❌ get_progress_breakdown error:', breakdownError.message);
    return;
  }

  console.log('Progress breakdown:');
  console.log(JSON.stringify(breakdown, null, 2));
}

async function main() {
  const migrationApplied = await applyMigration();

  if (migrationApplied) {
    await testOrchestratorDetection();
  }
}

main().catch(console.error);
