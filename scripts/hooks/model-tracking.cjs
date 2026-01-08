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
 * Get model info from environment or Claude Code metadata
 */
function getModelInfo() {
  // Claude Code sets these environment variables
  const modelId = process.env.CLAUDE_MODEL || process.env.ANTHROPIC_MODEL || 'unknown';
  const sessionId = process.env.CLAUDE_SESSION_ID || 'unknown';

  return {
    model_id: modelId,
    session_id: sessionId,
    timestamp: new Date().toISOString()
  };
}

/**
 * Main hook execution
 */
function main() {
  const state = loadSessionState();
  const modelInfo = getModelInfo();

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
