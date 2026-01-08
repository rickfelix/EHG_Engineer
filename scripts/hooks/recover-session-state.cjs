#!/usr/bin/env node

/**
 * Recover Session State Script
 * SD-CLAUDE-CODE-2.1.0-LEO-001 - Phase 2 Hook Infrastructure
 *
 * Recovery script that restores session state from the most recent checkpoint
 * after a crash or unexpected termination. Target: recovery within 60 seconds.
 *
 * Can be invoked manually or as a PreToolUse (once) hook for session init.
 *
 * Hook Type: Manual or PreToolUse (once: true) on new session
 * Purpose: Crash recovery from checkpoints
 * User Story: SD-CLAUDE-CODE-2-1-0-LEO-001:US-003
 */

const fs = require('fs');
const path = require('path');

const SESSION_STATE_FILE = path.join(process.env.HOME || '/tmp', '.claude-session-state.json');
const CHECKPOINT_DIR = path.join(process.env.HOME || '/tmp', '.claude-checkpoints');

/**
 * Get list of available checkpoints sorted by recency
 */
function getAvailableCheckpoints() {
  try {
    if (!fs.existsSync(CHECKPOINT_DIR)) {
      return [];
    }

    const files = fs.readdirSync(CHECKPOINT_DIR)
      .filter(f => f.startsWith('cp_') && f.endsWith('.json'))
      .map(f => {
        const filePath = path.join(CHECKPOINT_DIR, f);
        const stat = fs.statSync(filePath);
        return {
          filename: f,
          path: filePath,
          mtime: stat.mtime,
          checkpoint_id: f.replace('.json', '')
        };
      })
      .sort((a, b) => b.mtime - a.mtime);  // Most recent first

    return files;
  } catch (error) {
    console.error('[recover-session] Error listing checkpoints:', error.message);
    return [];
  }
}

/**
 * Load a specific checkpoint
 */
function loadCheckpoint(checkpointPath) {
  try {
    return JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
  } catch (error) {
    console.error('[recover-session] Error loading checkpoint:', error.message);
    return null;
  }
}

/**
 * Restore session state from checkpoint
 */
function restoreFromCheckpoint(checkpoint) {
  const restoredState = {
    // Core session info
    session_id: checkpoint.session_id || `recovered_${Date.now()}`,
    initialized_at: new Date().toISOString(),
    recovered_at: new Date().toISOString(),
    recovered_from: checkpoint.checkpoint_id,

    // Restored context
    current_sd: checkpoint.current_sd,
    current_phase: checkpoint.current_phase,
    tool_executions: checkpoint.tool_executions || 0,

    // Restored data
    test_baseline: checkpoint.test_baseline,
    phase_transitions: checkpoint.phase_transitions || [],
    git: checkpoint.git,

    // Reset tracking
    model_history: [],
    checkpoints: [],
    errors: [],
    warnings: [],

    // Recovery metadata
    recovery_info: {
      checkpoint_id: checkpoint.checkpoint_id,
      checkpoint_created_at: checkpoint.created_at,
      recovery_time: new Date().toISOString(),
      tool_executions_at_checkpoint: checkpoint.tool_executions
    }
  };

  return restoredState;
}

/**
 * Save restored session state
 */
function saveSessionState(state) {
  try {
    fs.writeFileSync(SESSION_STATE_FILE, JSON.stringify(state, null, 2));
    return true;
  } catch (error) {
    console.error('[recover-session] Error saving session state:', error.message);
    return false;
  }
}

/**
 * Print recovery summary
 */
function printRecoverySummary(checkpoint, restoredState, recoveryTime) {
  console.log('\n' + '='.repeat(60));
  console.log('SESSION RECOVERY COMPLETE');
  console.log('='.repeat(60));
  console.log(`Recovery Time: ${recoveryTime}ms`);
  console.log('-'.repeat(60));
  console.log(`Checkpoint: ${checkpoint.checkpoint_id}`);
  console.log(`Checkpoint Created: ${checkpoint.created_at}`);
  console.log(`Tool Executions at Checkpoint: ${checkpoint.tool_executions}`);
  console.log('-'.repeat(60));
  console.log(`SD: ${restoredState.current_sd || 'none'}`);
  console.log(`Phase: ${restoredState.current_phase || 'unknown'}`);
  console.log(`Test Baseline: ${restoredState.test_baseline ? 'restored' : 'not available'}`);
  console.log('='.repeat(60) + '\n');
}

/**
 * Main recovery execution
 */
function main() {
  const startTime = Date.now();
  console.log('[recover-session] Starting session recovery...');

  // Get available checkpoints
  const checkpoints = getAvailableCheckpoints();

  if (checkpoints.length === 0) {
    console.log('[recover-session] No checkpoints available');
    console.log('[recover-session] Starting fresh session');
    return;
  }

  console.log(`[recover-session] Found ${checkpoints.length} checkpoint(s)`);

  // Load most recent checkpoint
  const mostRecent = checkpoints[0];
  const checkpoint = loadCheckpoint(mostRecent.path);

  if (!checkpoint) {
    console.error('[recover-session] Failed to load checkpoint');
    console.log('[recover-session] Trying next checkpoint...');

    // Try second most recent
    if (checkpoints.length > 1) {
      const secondRecent = checkpoints[1];
      const fallbackCheckpoint = loadCheckpoint(secondRecent.path);
      if (fallbackCheckpoint) {
        const restoredState = restoreFromCheckpoint(fallbackCheckpoint);
        if (saveSessionState(restoredState)) {
          const recoveryTime = Date.now() - startTime;
          printRecoverySummary(fallbackCheckpoint, restoredState, recoveryTime);
          return;
        }
      }
    }

    console.error('[recover-session] All recovery attempts failed');
    process.exit(1);
  }

  // Restore from checkpoint
  const restoredState = restoreFromCheckpoint(checkpoint);

  if (saveSessionState(restoredState)) {
    const recoveryTime = Date.now() - startTime;
    printRecoverySummary(checkpoint, restoredState, recoveryTime);

    // Verify recovery time target (60 seconds)
    if (recoveryTime > 60000) {
      console.warn(`[recover-session] WARNING: Recovery took ${recoveryTime}ms (target: 60000ms)`);
    } else {
      console.log(`[recover-session] Recovery within target time (${recoveryTime}ms < 60000ms)`);
    }
  } else {
    console.error('[recover-session] Failed to save restored state');
    process.exit(1);
  }
}

// Execute if run directly
if (require.main === module) {
  main();
}

module.exports = {
  getAvailableCheckpoints,
  loadCheckpoint,
  restoreFromCheckpoint
};
