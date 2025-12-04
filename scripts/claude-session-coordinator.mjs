#!/usr/bin/env node
/**
 * Claude Session Coordinator
 *
 * Main CLI for multi-instance Claude Code coordination.
 * Handles claim/release of SDs and session management.
 *
 * Usage:
 *   node scripts/claude-session-coordinator.mjs claim <SD-ID>  - Claim an SD
 *   node scripts/claude-session-coordinator.mjs release        - Release current SD
 *   node scripts/claude-session-coordinator.mjs status         - Show all sessions
 *   node scripts/claude-session-coordinator.mjs cleanup        - Remove stale sessions
 *   node scripts/claude-session-coordinator.mjs info           - Show current session info
 */

import sessionManager from '../lib/session-manager.mjs';
import conflictChecker from '../lib/session-conflict-checker.mjs';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';

// Load environment
const envPath = '/mnt/c/_EHG/EHG_Engineer/.env';
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgRed: '\x1b[41m',
};

/**
 * Claim an SD for the current session
 */
async function claimSD(sdId) {
  console.log(`\n${colors.cyan}${colors.bold}═══════════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bold} CLAIMING SD: ${sdId}${colors.reset}`);
  console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}\n`);

  // Get or create session
  const session = await sessionManager.getOrCreateSession();
  console.log(`${colors.dim}Session: ${session.session_id}${colors.reset}\n`);

  // Check if we already have a claim
  if (session.sd_id) {
    console.log(`${colors.yellow}⚠️  You already have SD ${session.sd_id} claimed.${colors.reset}`);
    console.log(`   Release it first with: npm run sd:release\n`);
    return;
  }

  // Validate claim
  console.log(`Checking claim eligibility...\n`);
  const validation = await conflictChecker.canClaimSd(sdId, session.session_id);

  if (!validation.canClaim) {
    console.log(`${colors.red}${colors.bold}✗ CANNOT CLAIM${colors.reset}\n`);

    for (const reason of validation.blockingReasons) {
      console.log(`${colors.red}  • ${reason.type}: ${reason.message}${colors.reset}`);
      if (reason.conflictingSD) {
        console.log(`${colors.dim}    Conflicting SD: ${reason.conflictingSD}${colors.reset}`);
      }
      if (reason.conflictingSession) {
        console.log(`${colors.dim}    Session: ${reason.conflictingSession}${colors.reset}`);
      }
    }
    console.log();
    return;
  }

  // Show warnings if any
  if (validation.warnings.length > 0) {
    console.log(`${colors.yellow}⚠️  WARNINGS:${colors.reset}`);
    for (const warning of validation.warnings) {
      console.log(`${colors.yellow}  • ${warning.message}${colors.reset}`);
    }
    console.log();
  }

  // Perform claim
  const result = await conflictChecker.claimSD(sdId, session.session_id);

  if (!result.success) {
    console.log(`${colors.red}✗ Claim failed: ${result.error}${colors.reset}`);
    if (result.blockingReasons) {
      result.blockingReasons.forEach(r => console.log(`  • ${r.message}`));
    }
    return;
  }

  console.log(`${colors.green}${colors.bold}✓ CLAIMED SUCCESSFULLY${colors.reset}\n`);
  console.log(`  SD: ${result.sd_id}`);
  console.log(`  Track: ${result.track}`);
  console.log(`  Session: ${result.session_id}`);

  // Show parallel opportunities
  const trackStatus = await sessionManager.getParallelTrackStatus();
  const openTracks = trackStatus.filter(t => t.track_status === 'open' && t.available_sds > 0);

  if (openTracks.length > 0) {
    console.log(`\n${colors.cyan}${colors.bold}PARALLEL OPPORTUNITY:${colors.reset}`);
    console.log(`  Open another terminal for parallel work:\n`);

    for (const track of openTracks) {
      console.log(`  ${colors.bold}Track ${track.track}${colors.reset} (${track.track_name})`);
      console.log(`    Next SD: ${track.next_available_sd}`);
      console.log(`    Available: ${track.available_sds} SDs`);
    }
    console.log(`\n  Run ${colors.cyan}npm run sd:next${colors.reset} in new terminal to see queue.`);
  }

  console.log(`\n${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}\n`);
}

/**
 * Release the current session's SD claim
 */
async function releaseSD() {
  console.log(`\n${colors.cyan}${colors.bold}═══════════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bold} RELEASING SD CLAIM${colors.reset}`);
  console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}\n`);

  const session = sessionManager.getCurrentSession();

  if (!session) {
    console.log(`${colors.yellow}No active session found.${colors.reset}\n`);
    return;
  }

  if (!session.sd_id) {
    console.log(`${colors.yellow}No SD currently claimed by this session.${colors.reset}\n`);
    return;
  }

  console.log(`Releasing: ${session.sd_id}`);

  const result = await sessionManager.releaseCurrentClaim('manual');

  if (result.success) {
    console.log(`${colors.green}✓ Released successfully${colors.reset}\n`);
    console.log(`  Released SD: ${result.released_sd}`);
  } else {
    console.log(`${colors.red}✗ Release failed: ${result.error}${colors.reset}`);
    console.log(`  ${result.message || ''}`);
  }

  console.log(`\n${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}\n`);
}

/**
 * Show all active sessions
 */
async function showStatus() {
  console.log(`\n${colors.cyan}${colors.bold}═══════════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bold} CLAUDE SESSION STATUS${colors.reset}`);
  console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}\n`);

  // Cleanup stale first
  await sessionManager.cleanupStaleSessions();

  const sessions = await sessionManager.getActiveSessions();
  const currentSession = sessionManager.getCurrentSession();

  if (sessions.length === 0) {
    console.log(`${colors.dim}No active sessions.${colors.reset}\n`);
  } else {
    console.log(`${colors.bold}ACTIVE SESSIONS (${sessions.length}):${colors.reset}\n`);

    for (const s of sessions) {
      const isCurrent = currentSession && s.session_id === currentSession.session_id;
      const marker = isCurrent ? `${colors.green}→${colors.reset}` : ' ';
      const statusColor = s.sd_id ? colors.green : colors.dim;

      console.log(`${marker} ${colors.bold}${s.session_id.substring(0, 20)}...${colors.reset}`);
      console.log(`    TTY: ${s.tty || 'N/A'} | PID: ${s.pid || 'N/A'} | ${s.codebase || 'unknown'}`);

      if (s.sd_id) {
        console.log(`    ${statusColor}SD: ${s.sd_id} (Track ${s.track})${colors.reset}`);
        console.log(`    ${colors.dim}Claimed: ${Math.round(s.claim_duration_minutes || 0)} min ago${colors.reset}`);
      } else {
        console.log(`    ${colors.dim}Status: idle (no SD claimed)${colors.reset}`);
      }

      console.log(`    ${colors.dim}Heartbeat: ${Math.round(s.heartbeat_age_minutes || 0)} min ago${colors.reset}`);
      console.log();
    }
  }

  // Show track status
  const trackStatus = await sessionManager.getParallelTrackStatus();

  console.log(`${colors.bold}TRACK STATUS:${colors.reset}\n`);

  for (const track of trackStatus) {
    const statusColor = track.track_status === 'open' ? colors.green :
                        track.track_status === 'occupied' ? colors.yellow :
                        colors.dim;
    const statusIcon = track.track_status === 'open' ? '○' :
                       track.track_status === 'occupied' ? '●' : '◌';

    console.log(`  ${statusIcon} ${colors.bold}Track ${track.track}${colors.reset} (${track.track_name})`);
    console.log(`    ${statusColor}Status: ${track.track_status.toUpperCase()}${colors.reset}`);

    if (track.active_session) {
      console.log(`    ${colors.dim}Active SD: ${track.active_sd}${colors.reset}`);
    } else if (track.next_available_sd) {
      console.log(`    ${colors.dim}Next available: ${track.next_available_sd}${colors.reset}`);
    }

    console.log(`    Available: ${track.available_sds} | Blocked: ${track.blocked_sds}`);
    console.log();
  }

  console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}\n`);
}

/**
 * Cleanup stale sessions
 */
async function cleanup() {
  console.log(`\n${colors.cyan}${colors.bold}Cleaning up stale sessions...${colors.reset}\n`);

  const result = await sessionManager.cleanupStaleSessions();

  console.log(`  Local files cleaned: ${result.localCleaned}`);
  console.log(`  Database sessions cleaned: ${result.dbCleaned}`);

  if (result.errors.length > 0) {
    console.log(`\n${colors.yellow}Warnings:${colors.reset}`);
    result.errors.forEach(e => console.log(`  • ${e}`));
  }

  console.log(`\n${colors.green}✓ Cleanup complete${colors.reset}\n`);
}

/**
 * Show current session info
 */
async function showInfo() {
  const session = await sessionManager.getOrCreateSession();

  console.log(`\n${colors.cyan}${colors.bold}═══════════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bold} CURRENT SESSION INFO${colors.reset}`);
  console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}\n`);

  console.log(`  Session ID: ${session.session_id}`);
  console.log(`  TTY: ${session.tty}`);
  console.log(`  PID: ${session.pid}`);
  console.log(`  Hostname: ${session.hostname || 'N/A'}`);
  console.log(`  Codebase: ${session.codebase || 'N/A'}`);
  console.log(`  Created: ${session.created_at}`);
  console.log(`  Heartbeat: ${session.heartbeat_at}`);

  if (session.sd_id) {
    console.log(`\n  ${colors.green}Currently working on: ${session.sd_id}${colors.reset}`);
    console.log(`  Track: ${session.track}`);
    console.log(`  Claimed at: ${session.claimed_at}`);
  } else {
    console.log(`\n  ${colors.dim}No SD currently claimed${colors.reset}`);
  }

  console.log(`\n${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}\n`);
}

/**
 * Show help
 */
function showHelp() {
  console.log(`
${colors.bold}Claude Session Coordinator${colors.reset}
Multi-instance Claude Code coordination for parallel SD work.

${colors.cyan}Commands:${colors.reset}
  claim <SD-ID>   Claim an SD for this session
  release         Release the current SD claim
  status          Show all active sessions and track status
  cleanup         Remove stale sessions (>5 min inactive)
  info            Show current session info

${colors.cyan}Usage:${colors.reset}
  npm run sd:claim SD-FEATURE-001    Claim an SD
  npm run sd:release                 Release current SD
  npm run session:status             View all sessions
  npm run session:cleanup            Clean stale sessions

${colors.cyan}Workflow:${colors.reset}
  1. Run ${colors.bold}npm run sd:next${colors.reset} to see available SDs
  2. Say "I want to work on SD-XXX" to claim
  3. Work on the SD
  4. Run ${colors.bold}npm run sd:release${colors.reset} when done

${colors.cyan}Parallel Work:${colors.reset}
  • Each terminal auto-registers as a session
  • Sessions can claim SDs from different tracks
  • Conflicts are prevented automatically
  • Run sd:next in new terminal for parallel suggestions
`);
}

// Main
const command = process.argv[2];
const arg = process.argv[3];

switch (command) {
  case 'claim':
    if (!arg) {
      console.log(`${colors.red}Error: SD-ID required${colors.reset}`);
      console.log(`Usage: npm run sd:claim <SD-ID>`);
      process.exit(1);
    }
    await claimSD(arg);
    break;

  case 'release':
    await releaseSD();
    break;

  case 'status':
    await showStatus();
    break;

  case 'cleanup':
    await cleanup();
    break;

  case 'info':
    await showInfo();
    break;

  case 'help':
  case '--help':
  case '-h':
    showHelp();
    break;

  default:
    showHelp();
    process.exit(command ? 1 : 0);
}
