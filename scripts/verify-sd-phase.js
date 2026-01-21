#!/usr/bin/env node
/**
 * Verify SD Phase - Gate 0 Enforcement Script
 *
 * This script validates that an SD is in the proper phase before implementation.
 * It should be run as the FIRST step in EXEC phase.
 *
 * Part of SD-LEO-GATE0-VERIFYSCRIPT-001: verify-sd-phase.js Script (Gate 0)
 *
 * Usage: node scripts/verify-sd-phase.js <SD-ID>
 *
 * Exit codes:
 *   0 - PASS: SD is in valid phase for implementation
 *   1 - BLOCK: SD is not ready for implementation
 *
 * Valid phases for implementation:
 *   - EXEC (actively being implemented)
 *   - PLANNING (PRD exists, implementation can begin)
 *   - PLAN_PRD (PRD in progress, implementation can begin)
 *
 * Blocking phases:
 *   - LEAD_APPROVAL (SD not yet approved by LEAD)
 *   - COMPLETED (SD already done)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const VALID_PHASES = ['EXEC', 'PLANNING', 'PLAN_PRD', 'PLAN', 'PLAN_VERIFICATION'];
const BLOCKING_PHASES = ['LEAD_APPROVAL', 'LEAD'];
const COMPLETED_PHASES = ['COMPLETED', 'LEAD_FINAL_APPROVAL'];

async function verifySDPhase(sdId) {
  // Check environment variables
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ ERROR: Supabase credentials not configured');
    console.error('   Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('');
  console.log('════════════════════════════════════════════════════════════');
  console.log('  GATE 0: SD PHASE VERIFICATION');
  console.log('════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`  Checking: ${sdId}`);
  console.log('');

  try {
    // Query SD by various ID formats
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, status, current_phase, progress_percentage, parent_sd_id')
      .or(`id.eq.${sdId},legacy_id.eq.${sdId},sd_key.eq.${sdId}`)
      .maybeSingle();

    if (error) {
      console.error(`❌ Database query failed: ${error.message}`);
      process.exit(1);
    }

    if (!data) {
      console.log('────────────────────────────────────────────────────────────');
      console.log('');
      console.log('❌ RESULT: SD NOT FOUND');
      console.log(`   ${sdId} does not exist in strategic_directives_v2`);
      console.log('');
      console.log('   ACTION: Create the SD first');
      console.log('   Run: npm run sd:create');
      console.log('');
      console.log('════════════════════════════════════════════════════════════');
      process.exit(1);
    }

    const { sd_key, title, status, current_phase, progress_percentage, parent_sd_id } = data;
    const displayId = sd_key || sdId;

    console.log(`  SD: ${displayId}`);
    console.log(`  Title: ${title}`);
    console.log(`  Status: ${status}`);
    console.log(`  Phase: ${current_phase}`);
    console.log(`  Progress: ${progress_percentage}%`);
    if (parent_sd_id) {
      console.log(`  Parent: ${parent_sd_id}`);
    }
    console.log('');
    console.log('────────────────────────────────────────────────────────────');
    console.log('');

    // Check for completed SD
    if (COMPLETED_PHASES.includes(current_phase) || status === 'completed') {
      console.log('⚠️  RESULT: SD ALREADY COMPLETED');
      console.log(`   ${displayId} is already marked as ${status}/${current_phase}`);
      console.log('');
      console.log('   If you need to make changes:');
      console.log('   1. Create a new SD for the follow-up work');
      console.log('   2. Reference this SD in dependencies');
      console.log('');
      console.log('════════════════════════════════════════════════════════════');
      process.exit(0); // Not blocking, but informational
    }

    // Check for blocking phase
    if (BLOCKING_PHASES.includes(current_phase) || status === 'draft') {
      console.log('❌ RESULT: BLOCK');
      console.log(`   ${displayId} is in ${current_phase} phase (status: ${status})`);
      console.log('');
      console.log('   Implementation cannot begin until SD passes LEAD approval.');
      console.log('');
      console.log('   ACTION: Execute LEAD-TO-PLAN handoff first');
      console.log(`   Run: node scripts/handoff.js execute LEAD-TO-PLAN ${displayId}`);
      console.log('');
      console.log('   Then execute PLAN-TO-EXEC handoff:');
      console.log(`   Run: node scripts/handoff.js execute PLAN-TO-EXEC ${displayId}`);
      console.log('');
      console.log('════════════════════════════════════════════════════════════');
      process.exit(1);
    }

    // Check for valid phase
    if (VALID_PHASES.includes(current_phase)) {
      console.log('✅ RESULT: PASS');
      console.log(`   ${displayId} is in ${current_phase} phase`);
      console.log('');
      console.log('   Implementation can proceed.');
      console.log('');

      // Check if PLAN-TO-EXEC has been run
      const { data: handoffs } = await supabase
        .from('sd_phase_handoffs')
        .select('handoff_type, status')
        .eq('sd_id', data.id)
        .eq('handoff_type', 'PLAN-TO-EXEC');

      if (!handoffs || handoffs.length === 0) {
        console.log('   ⚠️  NOTE: PLAN-TO-EXEC handoff not found');
        console.log('   Consider running: node scripts/handoff.js execute PLAN-TO-EXEC ' + displayId);
        console.log('');
      }

      console.log('════════════════════════════════════════════════════════════');
      process.exit(0);
    }

    // Unknown phase
    console.log('⚠️  RESULT: UNKNOWN PHASE');
    console.log(`   ${displayId} is in unrecognized phase: ${current_phase}`);
    console.log('');
    console.log('   Please verify SD status manually.');
    console.log('');
    console.log('════════════════════════════════════════════════════════════');
    process.exit(0); // Don't block on unknown phases

  } catch (err) {
    console.error(`❌ Unexpected error: ${err.message}`);
    process.exit(1);
  }
}

// Main execution
const sdId = process.argv[2];

if (!sdId) {
  console.log('');
  console.log('USAGE: node scripts/verify-sd-phase.js <SD-ID>');
  console.log('');
  console.log('This script verifies an SD is in a valid phase for implementation.');
  console.log('Run this as the FIRST step before writing any code.');
  console.log('');
  console.log('Example:');
  console.log('  node scripts/verify-sd-phase.js SD-LEO-GATE0-001');
  console.log('');
  process.exit(1);
}

verifySDPhase(sdId);
