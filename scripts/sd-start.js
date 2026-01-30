#!/usr/bin/env node
/**
 * SD Start - Claim an SD and begin work
 *
 * Usage: npm run sd:start <SD-ID>
 *
 * Actions:
 * 1. Claims the SD for current session (sets is_working_on = true)
 * 2. Displays SD info, current phase, and next recommended action
 *
 * This is the recommended way to start work on an SD outside of
 * the formal handoff workflow.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { getOrCreateSession, updateHeartbeat } from '../lib/session-manager.mjs';
import { claimSD, isSDClaimed } from '../lib/session-conflict-checker.mjs';
import { getEstimatedDuration, formatEstimateDetailed } from './lib/duration-estimator.js';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m'
};

async function getSDDetails(sdId) {
  // Note: legacy_id column was deprecated and removed - using sd_key instead
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, status, current_phase, priority, progress_percentage, is_working_on, sd_type')
    .or(`sd_key.eq.${sdId},id.eq.${sdId}`)
    .single();

  if (error) {
    return { error: error.message };
  }

  return data;
}

async function getNextHandoff(sd) {
  const phase = sd.current_phase || 'LEAD';

  const handoffMap = {
    'LEAD': 'LEAD-TO-PLAN',
    'LEAD_APPROVAL': 'LEAD-TO-PLAN',
    'PLAN': 'PLAN-TO-EXEC',
    'EXEC': 'EXEC-TO-PLAN',
    'PLAN_VERIFY': 'PLAN-TO-LEAD',
    'LEAD_FINAL': 'LEAD-FINAL-APPROVAL'
  };

  return handoffMap[phase] || 'LEAD-TO-PLAN';
}

async function main() {
  const sdId = process.argv[2];

  if (!sdId) {
    console.log(`${colors.red}${colors.bold}Error: SD ID required${colors.reset}`);
    console.log(`\nUsage: ${colors.cyan}npm run sd:start <SD-ID>${colors.reset}`);
    console.log(`\nExample: ${colors.dim}npm run sd:start SD-HARDENING-V2-001C${colors.reset}`);
    process.exit(1);
  }

  console.log(`\n${colors.bold}${colors.blue}SD START${colors.reset}`);
  console.log('═'.repeat(50));

  // 1. Get SD details
  const sd = await getSDDetails(sdId);

  if (sd.error) {
    console.log(`${colors.red}Error: ${sd.error}${colors.reset}`);
    process.exit(1);
  }

  if (!sd) {
    console.log(`${colors.red}Error: SD not found: ${sdId}${colors.reset}`);
    process.exit(1);
  }

  const effectiveId = sd.sd_key || sd.id;

  // 2. Get or create session
  const session = await getOrCreateSession();

  if (!session) {
    console.log(`${colors.red}Error: Could not create session${colors.reset}`);
    process.exit(1);
  }

  // 3. Check current claim status
  const claimStatus = await isSDClaimed(effectiveId, session.session_id);

  if (claimStatus.claimed && claimStatus.claimedBy !== session.session_id) {
    // FR-2: Enhanced output showing owner session details and heartbeat age
    console.log(`\n${colors.red}❌ SD is already claimed by another session${colors.reset}`);
    console.log(`\n${colors.bold}Owner Session Details:${colors.reset}`);
    console.log(`   Session ID: ${colors.cyan}${claimStatus.claimedBy}${colors.reset}`);
    console.log(`   Hostname:   ${claimStatus.hostname || 'unknown'}`);
    console.log(`   TTY/Term:   ${claimStatus.tty || 'unknown'}`);
    console.log(`   Codebase:   ${claimStatus.codebase || 'unknown'}`);
    console.log(`   Track:      ${claimStatus.track || 'STANDALONE'}`);
    console.log(`\n${colors.bold}Heartbeat Status:${colors.reset}`);
    console.log(`   Last seen:  ${colors.yellow}${claimStatus.heartbeatAgeHuman || claimStatus.activeMinutes + 'm ago'}${colors.reset}`);
    console.log(`   Age:        ${claimStatus.heartbeatAgeSeconds || claimStatus.activeMinutes * 60} seconds`);

    // Show stale warning if close to 5-minute threshold
    const secondsUntilStale = 300 - (claimStatus.heartbeatAgeSeconds || claimStatus.activeMinutes * 60);
    if (secondsUntilStale > 0 && secondsUntilStale < 60) {
      console.log(`\n${colors.yellow}⏳ Session will become stale in ${secondsUntilStale}s (auto-released)${colors.reset}`);
    } else if (secondsUntilStale <= 0) {
      console.log(`\n${colors.yellow}⚠️  Session appears stale - it may auto-release soon${colors.reset}`);
    }

    console.log(`\n${colors.bold}Options:${colors.reset}`);
    console.log(`   1. Wait for the session to release (or become stale after 5min)`);
    console.log(`   2. Run ${colors.cyan}npm run sd:release${colors.reset} in the other session`);
    console.log(`   3. If session is abandoned, run ${colors.cyan}npm run session:cleanup${colors.reset}`);
    console.log('═'.repeat(50));
    process.exit(1);
  }

  // 4. Claim the SD
  let claimResult;
  if (claimStatus.claimed && claimStatus.claimedBy === session.session_id) {
    // Already claimed by us - just update heartbeat
    await updateHeartbeat(session.session_id);
    claimResult = { success: true, alreadyClaimed: true };
  } else {
    claimResult = await claimSD(effectiveId, session.session_id);
  }

  if (!claimResult.success) {
    console.log(`\n${colors.red}Error claiming SD: ${claimResult.error}${colors.reset}`);
    if (claimResult.blockingReasons) {
      claimResult.blockingReasons.forEach(r => {
        console.log(`   - ${r.message}`);
      });
    }
    process.exit(1);
  }

  // 5. Display SD info
  console.log(`\n${colors.green}✓ SD claimed successfully${colors.reset}`);
  console.log(`\n${colors.bold}SD: ${effectiveId}${colors.reset}`);
  console.log(`Title: ${sd.title}`);
  console.log(`Status: ${sd.status}`);
  console.log(`Phase: ${sd.current_phase || 'LEAD'}`);
  console.log(`Progress: ${sd.progress_percentage || 0}%`);
  console.log(`Type: ${sd.sd_type || 'feature'}`);
  console.log(`is_working_on: ${colors.green}true${colors.reset}`);

  // 5.5. Show duration estimate
  try {
    // Note: legacy_id was deprecated - using sd_key instead
    const { data: sdFull } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_type, category, priority')
      .eq('sd_key', effectiveId)
      .single();

    if (sdFull) {
      const estimate = await getEstimatedDuration(supabase, sdFull);
      console.log(`\n${colors.bold}Duration Estimate:${colors.reset}`);
      const lines = formatEstimateDetailed(estimate);
      lines.forEach(line => {
        if (line.startsWith('  •')) {
          console.log(`${colors.dim}${line}${colors.reset}`);
        } else if (line === '') {
          console.log();
        } else {
          console.log(`   ${line}`);
        }
      });
    }
  } catch {
    // Silent fail - estimate is optional
  }

  // 6. Show warnings if any
  if (claimResult.warnings?.length > 0) {
    console.log(`\n${colors.yellow}Warnings:${colors.reset}`);
    claimResult.warnings.forEach(w => {
      console.log(`   ⚠️  ${w.message}`);
    });
  }

  // 7. Show next action
  const nextHandoff = await getNextHandoff(sd);

  console.log(`\n${colors.bold}Next Action:${colors.reset}`);
  console.log(`   ${colors.cyan}node scripts/handoff.js execute ${nextHandoff} ${effectiveId}${colors.reset}`);

  console.log(`\n${colors.dim}Session: ${session.session_id}${colors.reset}`);
  console.log('═'.repeat(50));
}

main().catch(error => {
  console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
  process.exit(1);
});
