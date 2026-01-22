#!/usr/bin/env node
/**
 * UserPromptSubmit Hook: Autonomous Mode Checkpoint
 *
 * LEO Protocol v4.4.3
 * SD-LEO-INFRA-PROTOCOL-ENFORCEMENT-HARDENING-001 (FR-1)
 *
 * Tracks turn count and displays checkpoint warnings when threshold exceeded.
 * Uses file-based counter to persist across hook invocations.
 *
 * Environment variables:
 * - LEO_CHECKPOINT_THRESHOLD: Turn count before checkpoint (default: 20)
 * - LEO_CHECKPOINT_ENABLED: Set to 'false' to disable (default: true)
 *
 * Exit codes:
 *   0 - Always (advisory mode - doesn't block)
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

// ============================================================================
// CONFIGURATION
// ============================================================================

const THRESHOLD = parseInt(process.env.LEO_CHECKPOINT_THRESHOLD || '20');
const ENABLED = process.env.LEO_CHECKPOINT_ENABLED !== 'false';

// Counter file location - session-specific
const SESSION_ID = process.env.CLAUDE_SESSION_ID || 'default';
const COUNTER_DIR = path.join(os.tmpdir(), 'leo-checkpoints');
const COUNTER_FILE = path.join(COUNTER_DIR, `session-${SESSION_ID}.json`);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function ensureCounterDir() {
  if (!fs.existsSync(COUNTER_DIR)) {
    fs.mkdirSync(COUNTER_DIR, { recursive: true });
  }
}

function readCounter() {
  try {
    if (fs.existsSync(COUNTER_FILE)) {
      const data = JSON.parse(fs.readFileSync(COUNTER_FILE, 'utf8'));
      return data;
    }
  } catch (_err) {
    // File corrupted or missing - start fresh
  }
  return {
    turnCount: 0,
    lastCheckpoint: 0,
    startTime: new Date().toISOString()
  };
}

function writeCounter(data) {
  ensureCounterDir();
  fs.writeFileSync(COUNTER_FILE, JSON.stringify(data, null, 2));
}

function getSDContext() {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    const sdMatch = branch.match(/SD-[A-Z]+-(?:[A-Z]+-)*\d+/i);
    return sdMatch ? sdMatch[0].toUpperCase() : null;
  } catch {
    return null;
  }
}

function formatDuration(startTime) {
  const start = new Date(startTime);
  const now = new Date();
  const minutes = Math.round((now - start) / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

// ============================================================================
// MAIN LOGIC
// ============================================================================

async function main() {
  if (!ENABLED) {
    process.exit(0);
  }

  try {
    // 1. Read and increment counter
    const counter = readCounter();
    counter.turnCount++;

    // 2. Check if checkpoint threshold reached
    const turnsSinceCheckpoint = counter.turnCount - counter.lastCheckpoint;

    if (turnsSinceCheckpoint >= THRESHOLD) {
      // Checkpoint triggered!
      const sd = getSDContext();
      const duration = formatDuration(counter.startTime);

      console.log('\n' + '='.repeat(60));
      console.log('🛑 AUTONOMOUS CHECKPOINT (LEO v4.4.3)');
      console.log('='.repeat(60));
      console.log(`   Turn Count: ${counter.turnCount} (${turnsSinceCheckpoint} since last checkpoint)`);
      console.log(`   Session Duration: ${duration}`);
      if (sd) {
        console.log(`   Active SD: ${sd}`);
      }
      console.log('');
      console.log('   📋 CHECKPOINT REVIEW RECOMMENDED:');
      console.log('   - Are we still aligned with the original SD intent?');
      console.log('   - Have we drifted from the planned implementation?');
      console.log('   - Should we pause and get human review?');
      console.log('');
      console.log('   To dismiss: Continue working (this is advisory)');
      console.log('   To reset: Delete counter file or restart session');
      console.log('='.repeat(60) + '\n');

      // Update last checkpoint
      counter.lastCheckpoint = counter.turnCount;
    }

    // 3. Save counter
    writeCounter(counter);

    process.exit(0);

  } catch (err) {
    // Any error - don't block
    console.error(`[autonomous-checkpoint] Error: ${err.message}`);
    process.exit(0);
  }
}

main();
