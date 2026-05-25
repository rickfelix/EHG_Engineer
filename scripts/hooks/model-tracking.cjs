#!/usr/bin/env node

/**
 * Model Tracking Hook
 * SD-CLAUDE-CODE-2.1.0-LEO-001 - Phase 1 Foundation
 *
 * Universal hook that tracks which Claude model is being used for each response.
 * Runs on PostToolUse to capture model information after each tool execution.
 *
 * Hook Type: PostToolUse (universal)
 * Purpose: Model auditing, cost tracking, capability verification
 */

const fs = require('fs');
const path = require('path');

const SESSION_STATE_FILE = path.join(process.env.HOME || '/tmp', '.claude-session-state.json');

/**
 * Load current session state
 */
function loadSessionState() {
  try {
    if (fs.existsSync(SESSION_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(SESSION_STATE_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('[model-tracking] Error loading session state:', error.message);
  }
  return {
    model_history: [],
    current_sd: null,
    current_phase: null,
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
    console.error('[model-tracking] Error saving session state:', error.message);
  }
}

/**
 * Get model info from environment or Claude Code metadata.
 *
 * @param {string} [sessionId] - Resolved session id (from the canonical cascade in
 *   main()). When omitted, falls back to the env var for backward compatibility.
 */
function getModelInfo(sessionId) {
  // Claude Code sets these environment variables
  const modelId = process.env.CLAUDE_MODEL || process.env.ANTHROPIC_MODEL || 'unknown';
  // SD-FDBK-REFAC-ADOPT-RESOLVESESSIONID-CASCADE-001: prefer the resolved session id.
  // PostToolUse subprocesses do NOT receive CLAUDE_SESSION_ID, so the env-only read
  // collapsed every tracked row onto session_id='unknown'. The no-arg path preserves
  // the prior env-based behavior for any direct/legacy caller.
  const resolvedSessionId = sessionId || process.env.CLAUDE_SESSION_ID || 'unknown';

  return {
    model_id: modelId,
    session_id: resolvedSessionId,
    timestamp: new Date().toISOString()
  };
}

/**
 * Main hook execution
 */
async function main() {
  // SD-FDBK-REFAC-ADOPT-RESOLVESESSIONID-CASCADE-001: resolve the session id via the
  // canonical cascade (stdin session_id → CLAUDE_SESSION_ID env → session-identity
  // marker → null). PostToolUse does not propagate CLAUDE_SESSION_ID, so the prior
  // env-only read recorded 'unknown' for every tool execution. Fail-open: any resolver
  // error leaves sessionId undefined and getModelInfo() falls back to env.
  let sessionId;
  try {
    const { resolveSessionId } = require('../../lib/hooks/session-id.cjs');
    sessionId = await resolveSessionId();
  } catch { /* fall back to env inside getModelInfo */ }

  const state = loadSessionState();
  const modelInfo = getModelInfo(sessionId);

  // Increment tool executions
  state.tool_executions = (state.tool_executions || 0) + 1;

  // Track model usage
  const modelEntry = {
    ...modelInfo,
    tool_execution_number: state.tool_executions
  };

  // Keep last 100 model entries to prevent unbounded growth
  state.model_history = state.model_history || [];
  state.model_history.push(modelEntry);
  if (state.model_history.length > 100) {
    state.model_history = state.model_history.slice(-100);
  }

  // Update last model used
  state.last_model = modelInfo.model_id;
  state.last_activity = modelInfo.timestamp;

  saveSessionState(state);

  // Output for hook logging (non-blocking)
  console.log(`[model-tracking] Tool #${state.tool_executions} - Model: ${modelInfo.model_id}`);
}

// Execute if run directly
if (require.main === module) {
  main();
}

module.exports = { loadSessionState, saveSessionState, getModelInfo };
