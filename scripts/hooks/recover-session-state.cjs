#!/usr/bin/env node

/**
 * Recover Session State Script
 * SD-CLAUDE-CODE-2.1.0-LEO-001 - Phase 2 Hook Infrastructure
 *
 * Restores session state from the most recent LOCAL checkpoint file
 * ($HOME/.claude-checkpoints/<session_id>/) after a restart on the SAME host.
 * This is a single-machine restore aid — NOT distributed crash recovery; the
 * authoritative cross-session/cross-machine state lives in the DB
 * (claude_sessions). Use this only to re-attach quickly after a local restart;
 * for true session identity/state, query the DB.
 *
 * SD-LEO-FIX-SESSION-RESTORE-HOOK-001: getAvailableCheckpoints() previously
 * globbed EVERY checkpoint file in the single machine-shared checkpoint
 * directory and picked the most-recent by mtime with ZERO session_id filtering
 * — on a fleet host running several concurrent Claude Code sessions, a restore
 * could silently apply a completely different, unrelated session's state
 * (current_sd, current_phase, git info) as if it were the invoking session's
 * own. Now resolves the real session_id via the canonical resolveSessionId()
 * (lib/hooks/session-id.cjs, stdin-first) and reads only that session's own
 * checkpoint subdirectory.
 *
 * Can be invoked manually or as a PreToolUse (once) hook for session init.
 *
 * Hook Type: Manual or PreToolUse (once: true) on new session
 * Purpose: Single-machine local-checkpoint restore aid (DB is authoritative)
 * User Story: SD-CLAUDE-CODE-2-1-0-LEO-001:US-003
 */

const fs = require('fs');
const path = require('path');
const { resolveSessionId } = require('../../lib/hooks/session-id.cjs');

const HOME_DIR = process.env.HOME || '/tmp';
const CHECKPOINT_ROOT = path.join(HOME_DIR, '.claude-checkpoints');

function sessionStateFile(sessionId) {
  return path.join(HOME_DIR, `.claude-session-state-${sessionId}.json`);
}

function checkpointDir(sessionId) {
  return path.join(CHECKPOINT_ROOT, sessionId);
}

/**
 * Get list of available checkpoints for ONE session, sorted by recency.
 * Reads ONLY that session's own checkpoint subdirectory — never globs the
 * shared parent directory, so a concurrent peer session's checkpoints are
 * never candidates for this session's restore.
 */
function getAvailableCheckpoints(sessionId) {
  try {
    const dir = checkpointDir(sessionId);
    if (!fs.existsSync(dir)) {
      return [];
    }

    const files = fs.readdirSync(dir)
      .filter(f => f.startsWith('cp_') && f.endsWith('.json'))
      .map(f => {
        const filePath = path.join(dir, f);
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
function saveSessionState(state, sessionId) {
  try {
    fs.writeFileSync(sessionStateFile(sessionId), JSON.stringify(state, null, 2));
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
async function main() {
  const startTime = Date.now();
  console.log('[recover-session] Starting session recovery...');

  // SD-LEO-FIX-SESSION-RESTORE-HOOK-001: resolve the REAL Claude session_id
  // (stdin-first). Fail closed — an unresolved identity must NOT fall back to
  // "most recent checkpoint across the whole shared directory"; that fallback
  // is exactly the cross-session-leak bug being fixed.
  const sessionId = await resolveSessionId();
  if (!sessionId) {
    console.error('[recover-session] Could not resolve session_id — cannot safely restore (fail-closed, not global-fallback)');
    console.log('[recover-session] Starting fresh session');
    return;
  }

  // Get available checkpoints for THIS session only
  const checkpoints = getAvailableCheckpoints(sessionId);

  if (checkpoints.length === 0) {
    console.log('[recover-session] No checkpoints available for this session');
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
        if (saveSessionState(restoredState, sessionId)) {
          const recoveryTime = Date.now() - startTime;
          printRecoverySummary(fallbackCheckpoint, restoredState, recoveryTime);
          return;
        }
      }
    }

    console.error('[recover-session] All recovery attempts failed');
    process.exitCode = 1;
    return;
  }

  // Restore from checkpoint
  const restoredState = restoreFromCheckpoint(checkpoint);

  if (saveSessionState(restoredState, sessionId)) {
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
    process.exitCode = 1;
  }
}

// Execute if run directly. Explicit process.exit() afterward, preserving any
// exitCode set above — resolveSessionId()'s stdin listeners can otherwise
// keep the process alive past this script's expected lifetime.
if (require.main === module) {
  main().finally(() => process.exit(process.exitCode || 0));
}

module.exports = {
  getAvailableCheckpoints,
  loadCheckpoint,
  restoreFromCheckpoint,
  saveSessionState,
  sessionStateFile,
  checkpointDir
};
