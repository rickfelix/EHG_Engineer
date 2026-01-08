#!/usr/bin/env node

/**
 * Persist Session State Hook
 * SD-CLAUDE-CODE-2.1.0-LEO-001 - Phase 2 Hook Infrastructure
 *
 * PostToolUse hook that persists session state as a checkpoint after each
 * tool execution. This enables crash recovery by providing restore points.
 *
 * Hook Type: PostToolUse (after every tool)
 * Purpose: Session state persistence for crash recovery
 * User Story: SD-CLAUDE-CODE-2-1-0-LEO-001:US-003
 */

const fs = require('fs');
const path = require('path');

const SESSION_STATE_FILE = path.join(process.env.HOME || '/tmp', '.claude-session-state.json');
const CHECKPOINT_DIR = path.join(process.env.HOME || '/tmp', '.claude-checkpoints');

/**
 * Ensure checkpoint directory exists
 */
function ensureCheckpointDir() {
  if (!fs.existsSync(CHECKPOINT_DIR)) {
    fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
  }
}

/**
 * Load current session state
 */
function loadSessionState() {
  try {
    if (fs.existsSync(SESSION_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(SESSION_STATE_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('[persist-session] Error loading session state:', error.message);
  }
  return {
    session_id: `session_${Date.now()}_${process.pid}`,
    checkpoints: [],
    tool_executions: 0
  };
}

/**
 * Save session state
 */
function saveSessionState(state) {
  try {
    fs.writeFileSync(SESSION_STATE_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error('[persist-session] Error saving session state:', error.message);
  }
}

/**
 * Create a checkpoint of current session state
 */
function createCheckpoint(state) {
  ensureCheckpointDir();

  const checkpoint = {
    checkpoint_id: `cp_${Date.now()}`,
    created_at: new Date().toISOString(),
    session_id: state.session_id,
    tool_executions: state.tool_executions,
    current_sd: state.current_sd,
    current_phase: state.current_phase,
    // Include relevant state for recovery
    test_baseline: state.test_baseline,
    phase_transitions: state.phase_transitions,
    git: state.git
  };

  const checkpointPath = path.join(CHECKPOINT_DIR, `${checkpoint.checkpoint_id}.json`);
  fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2));

  return checkpoint;
}

/**
 * Clean up old checkpoints (keep last N)
 */
function cleanupOldCheckpoints(keepCount = 10) {
  try {
    ensureCheckpointDir();
    const files = fs.readdirSync(CHECKPOINT_DIR)
      .filter(f => f.startsWith('cp_') && f.endsWith('.json'))
      .sort()
      .reverse();

    // Remove old checkpoints beyond keepCount
    for (let i = keepCount; i < files.length; i++) {
      fs.unlinkSync(path.join(CHECKPOINT_DIR, files[i]));
    }

    return files.length - keepCount;
  } catch (error) {
    console.error('[persist-session] Error cleaning checkpoints:', error.message);
    return 0;
  }
}

/**
 * Determine if checkpoint should be created
 * (Throttle to avoid excessive checkpoints)
 */
function shouldCreateCheckpoint(state) {
  const checkpoints = state.checkpoints || [];

  // Always checkpoint if no recent checkpoints
  if (checkpoints.length === 0) return true;

  const lastCheckpoint = checkpoints[checkpoints.length - 1];
  const timeSinceLastCheckpoint = Date.now() - new Date(lastCheckpoint.created_at).getTime();

  // Checkpoint every 5 tool executions or every 2 minutes
  const toolsSinceCheckpoint = state.tool_executions - (lastCheckpoint.tool_executions || 0);

  return toolsSinceCheckpoint >= 5 || timeSinceLastCheckpoint >= 2 * 60 * 1000;
}

/**
 * Main hook execution
 */
function main() {
  const state = loadSessionState();

  // Increment tool execution count
  state.tool_executions = (state.tool_executions || 0) + 1;
  state.last_activity = new Date().toISOString();

  if (shouldCreateCheckpoint(state)) {
    const checkpoint = createCheckpoint(state);

    // Track checkpoint in state
    state.checkpoints = state.checkpoints || [];
    state.checkpoints.push({
      checkpoint_id: checkpoint.checkpoint_id,
      created_at: checkpoint.created_at,
      tool_executions: state.tool_executions
    });

    // Keep only last 20 checkpoint references in state
    if (state.checkpoints.length > 20) {
      state.checkpoints = state.checkpoints.slice(-20);
    }

    // Clean up old checkpoint files
    const removed = cleanupOldCheckpoints(10);

    console.log(`[persist-session] Checkpoint created: ${checkpoint.checkpoint_id}`);
    if (removed > 0) {
      console.log(`[persist-session] Cleaned ${removed} old checkpoint(s)`);
    }
  }

  saveSessionState(state);
}

// Execute if run directly
if (require.main === module) {
  main();
}

module.exports = { createCheckpoint, loadSessionState, saveSessionState, cleanupOldCheckpoints };
