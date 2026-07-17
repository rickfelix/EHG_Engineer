#!/usr/bin/env node

/**
 * Persist Session State Hook
 * SD-CLAUDE-CODE-2.1.0-LEO-001 - Phase 2 Hook Infrastructure
 *
 * PostToolUse hook that persists session state as a LOCAL checkpoint file
 * ($HOME/.claude-checkpoints/<session_id>/) after each tool execution. This is a
 * single-machine restore aid for re-attaching after a local restart on the SAME
 * host — NOT a distributed crash-recovery system. The authoritative cross-session/
 * cross-machine source of truth is the DB (claude_sessions); these files are a
 * convenience cache.
 *
 * SD-LEO-FIX-SESSION-RESTORE-HOOK-001: the checkpoint dir and state file were
 * previously a single machine-global path ($HOME/.claude-checkpoints,
 * $HOME/.claude-session-state.json) shared by EVERY Claude Code session on the
 * host — on a fleet host running several concurrent sessions, every session's
 * PostToolUse call read-modified-wrote the SAME file and wrote checkpoints into
 * the SAME shared directory, with no session_id filtering at read time (see
 * recover-session-state.cjs). Now scoped per-session using the canonical
 * resolveSessionId() (lib/hooks/session-id.cjs) — the same stdin-first resolver
 * already used by post-tool-rca-outcome.cjs for the same "CLAUDE_SESSION_ID env
 * var is never propagated to PostToolUse subprocesses" reason.
 *
 * Hook Type: PostToolUse (after every tool)
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
 * Ensure checkpoint directory exists
 */
function ensureCheckpointDir(sessionId) {
  const dir = checkpointDir(sessionId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Load current session state
 */
function loadSessionState(sessionId) {
  try {
    const file = sessionStateFile(sessionId);
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (error) {
    console.error('[persist-session] Error loading session state:', error.message);
  }
  return {
    session_id: sessionId,
    checkpoints: [],
    tool_executions: 0
  };
}

/**
 * Save session state
 */
function saveSessionState(state, sessionId) {
  try {
    fs.writeFileSync(sessionStateFile(sessionId), JSON.stringify(state, null, 2));
  } catch (error) {
    console.error('[persist-session] Error saving session state:', error.message);
  }
}

/**
 * Create a checkpoint of current session state
 */
function createCheckpoint(state, sessionId) {
  ensureCheckpointDir(sessionId);

  const checkpoint = {
    checkpoint_id: `cp_${Date.now()}`,
    created_at: new Date().toISOString(),
    session_id: sessionId,
    tool_executions: state.tool_executions,
    current_sd: state.current_sd,
    current_phase: state.current_phase,
    // Include relevant state for recovery
    test_baseline: state.test_baseline,
    phase_transitions: state.phase_transitions,
    git: state.git
  };

  const checkpointPath = path.join(checkpointDir(sessionId), `${checkpoint.checkpoint_id}.json`);
  fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2));

  return checkpoint;
}

/**
 * Clean up old checkpoints (keep last N) — scoped to THIS session's own
 * checkpoint directory only, so cleaning up session A never touches session B's
 * checkpoints (the pre-fix global directory made every session's cleanup pass
 * a candidate to delete a concurrent peer session's checkpoints).
 */
function cleanupOldCheckpoints(sessionId, keepCount = 10) {
  try {
    ensureCheckpointDir(sessionId);
    const dir = checkpointDir(sessionId);
    const files = fs.readdirSync(dir)
      .filter(f => f.startsWith('cp_') && f.endsWith('.json'))
      .sort()
      .reverse();

    // Remove old checkpoints beyond keepCount
    for (let i = keepCount; i < files.length; i++) {
      fs.unlinkSync(path.join(dir, files[i]));
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
async function main() {
  // SD-LEO-FIX-SESSION-RESTORE-HOOK-001: resolve the REAL Claude session_id
  // (stdin-first — CLAUDE_SESSION_ID is never propagated to PostToolUse
  // subprocesses). Fail closed on an unresolved identity rather than falling
  // back to a shared/global path — that fallback IS the bug being fixed.
  const sessionId = await resolveSessionId();
  if (!sessionId) {
    console.error('[persist-session] Could not resolve session_id — skipping checkpoint (fail-closed, not global-fallback)');
    return;
  }

  const state = loadSessionState(sessionId);
  state.session_id = sessionId;

  // Increment tool execution count
  state.tool_executions = (state.tool_executions || 0) + 1;
  state.last_activity = new Date().toISOString();

  if (shouldCreateCheckpoint(state)) {
    const checkpoint = createCheckpoint(state, sessionId);

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

    // Clean up old checkpoint files (scoped to THIS session only)
    const removed = cleanupOldCheckpoints(sessionId, 10);

    console.log(`[persist-session] Checkpoint created: ${checkpoint.checkpoint_id}`);
    if (removed > 0) {
      console.log(`[persist-session] Cleaned ${removed} old checkpoint(s)`);
    }
  }

  saveSessionState(state, sessionId);
}

// Execute if run directly. Explicit process.exit(0) afterward — resolveSessionId()'s
// stdin listeners can otherwise keep the process alive past the hook's expected
// lifetime (same fail-open safety net already used by post-tool-rca-outcome.cjs).
if (require.main === module) {
  main().finally(() => process.exit(0));
}

module.exports = { createCheckpoint, loadSessionState, saveSessionState, cleanupOldCheckpoints, sessionStateFile, checkpointDir };
