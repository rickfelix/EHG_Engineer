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
import { execSync } from 'child_process';
import dotenv from 'dotenv';
import { getOrCreateSession, updateHeartbeat } from '../lib/session-manager.mjs';
import { claimSD, isSDClaimed } from '../lib/session-conflict-checker.mjs';
import { getEstimatedDuration, formatEstimateDetailed } from './lib/duration-estimator.js';
import { resolve as resolveWorkdir } from './resolve-sd-workdir.js';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * Map a phase to the appropriate CLAUDE_*.md context file.
 */
function getPhaseContextFile(phase) {
  if (!phase) return 'CLAUDE_LEAD.md';
  const p = phase.toUpperCase();
  if (p.startsWith('LEAD')) return 'CLAUDE_LEAD.md';
  if (p.startsWith('PLAN') || p.startsWith('PRD')) return 'CLAUDE_PLAN.md';
  if (p.startsWith('EXEC') || p.startsWith('IMPLEMENTATION')) return 'CLAUDE_EXEC.md';
  return 'CLAUDE_LEAD.md';
}

/**
 * Verify handoff integrity for an SD before resuming work.
 * Checks the last handoff in sd_phase_handoffs to ensure it was accepted.
 *
 * @returns {{ valid: boolean, lastHandoff: Object|null, message: string, recoveryOptions: string[] }}
 */
async function verifyHandoffIntegrity(sdUuid) {
  const { data: handoffs, error } = await supabase
    .from('sd_phase_handoffs')
    .select('id, sd_id, from_phase, to_phase, status, created_at, rejection_reason')
    .eq('sd_id', sdUuid)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    return { valid: true, lastHandoff: null, message: 'Could not query handoffs (proceeding)', recoveryOptions: [] };
  }

  if (!handoffs || handoffs.length === 0) {
    return {
      valid: false,
      lastHandoff: null,
      status: 'missing',
      message: 'No prior handoff found',
      recoveryOptions: [
        'Run the appropriate handoff for this phase',
        'Use --force flag to proceed without handoff verification'
      ]
    };
  }

  const last = handoffs[0];

  if (last.status === 'accepted' || last.status === 'completed') {
    return {
      valid: true,
      lastHandoff: last,
      status: last.status,
      message: `Last handoff: ${last.status} (${last.from_phase} → ${last.to_phase})`,
      recoveryOptions: []
    };
  }

  // Handoff was rejected or failed
  const reason = last.rejection_reason || 'No reason provided';
  return {
    valid: false,
    lastHandoff: last,
    status: last.status,
    message: `Last handoff ${last.status}: ${last.from_phase} → ${last.to_phase}`,
    reason,
    recoveryOptions: [
      `View handoff details: node -e "..." (handoff ID: ${last.id})`,
      `Re-run the ${last.from_phase} → ${last.to_phase} handoff after addressing issues`,
      'Use --force flag to override and continue (not recommended)'
    ]
  };
}

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

  // 2b. Check adopted session (heartbeat guard adopted the existing session)
  // When adopted=true, we're reusing the main Claude process's session (same terminal).
  // This is normal for child processes like sd-start.js.
  if (session.adopted) {
    if (session.adopted_sd_id && session.adopted_sd_id === effectiveId) {
      console.log(`\n${colors.yellow}Note: Session already working on ${effectiveId}, refreshing claim...${colors.reset}`);
    } else if (session.adopted_sd_id) {
      console.log(`\n${colors.yellow}Note: Session currently working on ${session.adopted_sd_id}, switching to ${effectiveId}${colors.reset}`);
    }
  }

  // 3. Check current claim status
  const claimStatus = await isSDClaimed(effectiveId, session.session_id);

  if (claimStatus.queryFailed) {
    console.log(`\n${colors.red}Error checking SD claim: ${claimStatus.error}${colors.reset}`);
    console.log(`\n${colors.yellow}This may indicate a database schema issue.${colors.reset}`);
    console.log('Try running: node scripts/run-sql-migration.js database/migrations/20260213_restore_v_active_sessions_columns.sql');
    process.exit(1);
  }

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

    // QF-CLAIM-CONFLICT-UX-001: Add clear question about parallel instances
    console.log(`\n${colors.yellow}🤔 Do you have another Claude Code instance running?${colors.reset}`);
    console.log(`\n${colors.bold}Options:${colors.reset}`);
    console.log(`   ${colors.green}If YES${colors.reset}: Pick a different SD to avoid conflicts`);
    console.log(`   ${colors.green}If NO${colors.reset}:  The session may be stale. Try these:`);
    console.log('      1. Wait for auto-release (stale after 5min)');
    console.log(`      2. Run ${colors.cyan}npm run sd:release${colors.reset} in the other terminal`);
    console.log(`      3. If abandoned, run ${colors.cyan}npm run session:cleanup${colors.reset}`);
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

  // 4.5. Resolve worktree (creates if needed in claim mode)
  let worktreeInfo = null;
  try {
    const repoRoot = execSync('git rev-parse --show-toplevel', {
      encoding: 'utf8', stdio: 'pipe'
    }).trim();
    worktreeInfo = await resolveWorkdir(effectiveId, 'claim', repoRoot);
  } catch {
    // Worktree resolution is optional - don't block SD start
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

  // 5.1. Show worktree info
  if (worktreeInfo?.success && worktreeInfo.worktree?.exists) {
    console.log(`\n${colors.bold}Worktree:${colors.reset}`);
    console.log(`   Path:   ${colors.cyan}${worktreeInfo.cwd}${colors.reset}`);
    console.log(`   Branch: ${worktreeInfo.worktree.branch || 'unknown'}`);
    console.log(`   Source: ${worktreeInfo.source}${worktreeInfo.worktree.created ? ' (newly created)' : ''}`);
  }

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

  // 6. Handoff integrity verification (SD-LEO-INFRA-RESUME-INTEGRITY-HANDOFF-001)
  const forceResume = process.argv.includes('--force');
  const handoffCheck = await verifyHandoffIntegrity(sd.id);

  if (handoffCheck.valid) {
    if (handoffCheck.lastHandoff) {
      console.log(`\n${colors.green}✓ ${handoffCheck.message}${colors.reset}`);
      console.log(`   ${colors.dim}Handoff ID: ${handoffCheck.lastHandoff.id} | ${new Date(handoffCheck.lastHandoff.created_at).toLocaleString()}${colors.reset}`);
    }
  } else if (handoffCheck.status === 'missing' && (sd.current_phase === 'LEAD' || sd.current_phase === 'LEAD_APPROVAL')) {
    // No handoff expected for fresh LEAD phase SDs
    console.log(`\n${colors.dim}ℹ  No prior handoffs (expected for LEAD phase)${colors.reset}`);
  } else if (!forceResume) {
    console.log(`\n${colors.red}❌ HANDOFF INTEGRITY CHECK FAILED${colors.reset}`);
    console.log(`   ${colors.bold}Status:${colors.reset} ${handoffCheck.status}`);
    console.log(`   ${colors.bold}Detail:${colors.reset} ${handoffCheck.message}`);
    if (handoffCheck.reason) {
      console.log(`   ${colors.bold}Reason:${colors.reset} ${handoffCheck.reason}`);
    }
    if (handoffCheck.lastHandoff) {
      console.log(`   ${colors.bold}Handoff ID:${colors.reset} ${handoffCheck.lastHandoff.id}`);
    }
    console.log(`\n${colors.yellow}Recovery Options:${colors.reset}`);
    handoffCheck.recoveryOptions.forEach((opt, i) => {
      console.log(`   ${i + 1}. ${opt}`);
    });
    console.log(`\n${colors.dim}Use --force to override this check${colors.reset}`);
    console.log('═'.repeat(50));
    process.exit(1);
  } else {
    console.log(`\n${colors.yellow}⚠️  Handoff integrity: ${handoffCheck.message} (--force override)${colors.reset}`);
  }

  // 6.5. Phase-appropriate context file (SD-LEO-INFRA-RESUME-INTEGRITY-HANDOFF-001)
  const contextFile = getPhaseContextFile(sd.current_phase);
  console.log(`\n${colors.bold}Load context:${colors.reset} ${colors.cyan}${contextFile}${colors.reset}`);

  // 7. Show warnings if any
  if (claimResult.warnings?.length > 0) {
    console.log(`\n${colors.yellow}Warnings:${colors.reset}`);
    claimResult.warnings.forEach(w => {
      console.log(`   ⚠️  ${w.message}`);
    });
  }

  // 8. Show next action
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
