#!/usr/bin/env node
/**
 * SD Commit Validation - Gate 0 Enforcement
 *
 * Validates that commits referencing Strategic Directives are only allowed
 * when the SD is in an active state (not draft, past LEAD_APPROVAL phase).
 *
 * Part of SD-LEO-GATE0-PRECOMMIT-001: Pre-commit Hook: SD Phase Validation
 *
 * Usage: node scripts/validate-sd-commit.js <SD-ID>
 * Exit codes:
 *   0 - Validation passed (commit allowed)
 *   1 - Validation failed (commit blocked)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const BLOCKING_STATUSES = ['draft'];
const BLOCKING_PHASES = ['LEAD_APPROVAL'];

async function validateSDCommit(sdId) {
  // Check environment variables
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.warn('⚠️  Warning: Supabase credentials not configured. Skipping Gate 0 validation.');
    return 0; // Fail-open
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Query SD by various ID formats
    // Note: legacy_id column was deprecated and removed - using sd_key instead
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, status, current_phase')
      .or(`id.eq.${sdId},sd_key.eq.${sdId}`)
      .maybeSingle();

    if (error) {
      console.warn(`⚠️  Warning: Database query failed: ${error.message}`);
      console.warn('   Skipping Gate 0 validation (fail-open).');
      return 0; // Fail-open on DB errors
    }

    if (!data) {
      console.error('');
      console.error('❌ BLOCKED: Strategic Directive not found in database');
      console.error('═══════════════════════════════════════════════════════════');
      console.error(`   Commit message references: ${sdId}`);
      console.error('   Status: Not found in strategic_directives_v2');
      console.error('');
      console.error('   REMEDIATION:');
      console.error('   1. Create SD first: npm run sd:create');
      console.error('   2. OR use correct SD identifier');
      console.error(`   3. Check database: npm run sd:status ${sdId}`);
      console.error('');
      console.error('   Emergency bypass (logged): git commit --no-verify');
      console.error('');
      return 1;
    }

    const { sd_key, title, status, current_phase } = data;
    const displayId = sd_key || sdId;

    // Check for blocking status
    if (BLOCKING_STATUSES.includes(status)) {
      console.error('');
      console.error('❌ BLOCKED: SD is in DRAFT status');
      console.error('═══════════════════════════════════════════════════════════');
      console.error(`   SD: ${displayId}`);
      console.error(`   Title: ${title}`);
      console.error(`   Current Status: ${status}`);
      console.error(`   Current Phase: ${current_phase}`);
      console.error('');
      console.error('   REASON: Commits are not allowed until SD passes LEAD approval.');
      console.error('   This ensures work is validated BEFORE code changes begin.');
      console.error('');
      console.error('   REMEDIATION:');
      console.error('   1. Complete LEAD-TO-PLAN handoff:');
      console.error(`      node scripts/handoff.js execute LEAD-TO-PLAN ${displayId}`);
      console.error('   2. Retry commit after handoff');
      console.error('');
      console.error(`   To check SD status: npm run sd:status ${displayId}`);
      console.error('');
      console.error('   Emergency bypass (not recommended): git commit --no-verify');
      console.error('');
      return 1;
    }

    // Check for blocking phase
    if (BLOCKING_PHASES.includes(current_phase)) {
      console.error('');
      console.error('⚠️  BLOCKED: SD still in LEAD_APPROVAL phase');
      console.error('═══════════════════════════════════════════════════════════');
      console.error(`   SD: ${displayId}`);
      console.error(`   Title: ${title}`);
      console.error(`   Current Phase: ${current_phase}`);
      console.error('   Expected Phase: PLAN, EXEC, or beyond');
      console.error('');
      console.error('   LEO Protocol requires LEAD approval before implementation.');
      console.error('');
      console.error('   REMEDIATION:');
      console.error('   1. Complete LEAD-TO-PLAN handoff:');
      console.error(`      node scripts/handoff.js execute LEAD-TO-PLAN ${displayId}`);
      console.error('   2. Retry commit after handoff');
      console.error('');
      console.error('   Emergency bypass (logged): git commit --no-verify');
      console.error('');
      return 1;
    }

    // Validation passed
    console.log(`✅ Gate 0 validation passed (${displayId}: ${status}, ${current_phase})`);
    return 0;

  } catch (err) {
    console.warn(`⚠️  Warning: Unexpected error: ${err.message}`);
    console.warn('   Skipping Gate 0 validation (fail-open).');
    return 0; // Fail-open
  }
}

// Main execution
const sdId = process.argv[2];

if (!sdId) {
  console.error('Usage: node scripts/validate-sd-commit.js <SD-ID>');
  process.exit(1);
}

// Properly await the async function and use returned exit code
// This avoids libuv assertion errors on Windows by allowing proper cleanup
validateSDCommit(sdId)
  .then((exitCode) => {
    // Small delay to allow Supabase client cleanup before exiting
    setTimeout(() => process.exit(exitCode), 50);
  })
  .catch((err) => {
    console.error('Unexpected error:', err.message);
    setTimeout(() => process.exit(1), 50);
  });
