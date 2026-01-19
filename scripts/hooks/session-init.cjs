#!/usr/bin/env node

/**
 * Session Initialization Hook
 * SD-CLAUDE-CODE-2.1.0-LEO-001 - Phase 1 Foundation
 *
 * PreToolUse (once: true) hook that initializes session state at the start
 * of each Claude Code session. This hook runs only once before the first
 * tool execution.
 *
 * Hook Type: PreToolUse (once: true)
 * Purpose: Session initialization, SD detection, baseline setup
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SESSION_STATE_FILE = path.join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.claude-session-state.json');
const PLAN_MODE_STATE_FILE = path.join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.claude-plan-mode-state.json');
const LEO_CONFIG_FILE = path.join(__dirname, '../../.claude/leo-plan-mode-config.json');
const ENGINEER_DIR = '.';

/**
 * Detect current SD from git branch or working_on flag
 */
function detectCurrentSD() {
  try {
    // Try to get SD from git branch name
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf8',
      cwd: ENGINEER_DIR,
      stdio: ['pipe', 'pipe', 'pipe'] // Suppress stderr cross-platform
    }).trim();

    // Extract SD ID from branch name (e.g., feat/SD-XXX-001-description)
    const sdMatch = branch.match(/SD-[A-Z0-9-]+/i);
    if (sdMatch) {
      return sdMatch[0].toUpperCase();
    }
  } catch (error) {
    // Git command failed, try fallback
  }

  // Fallback: Check for is_working_on in database (would require db connection)
  return null;
}

/**
 * Detect current phase from recent handoffs
 */
function detectCurrentPhase() {
  // This would ideally query the database for the latest handoff
  // For now, return null and let the phase be detected via handoff hooks
  return null;
}

/**
 * Get git status for session context
 */
function getGitContext() {
  const execOpts = { encoding: 'utf8', cwd: ENGINEER_DIR, stdio: ['pipe', 'pipe', 'pipe'] };

  try {
    // Get status and count lines in JS (cross-platform)
    const statusOutput = execSync('git status --porcelain', execOpts).trim();
    const uncommittedFiles = statusOutput ? statusOutput.split('\n').length : 0;

    const branch = execSync('git rev-parse --abbrev-ref HEAD', execOpts).trim();

    const lastCommit = execSync('git log -1 --format="%H %s"', execOpts).trim();

    return {
      branch,
      uncommitted_files: uncommittedFiles,
      last_commit: lastCommit
    };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Initialize fresh session state
 */
function initializeSessionState() {
  const currentSD = detectCurrentSD();
  const currentPhase = detectCurrentPhase();
  const gitContext = getGitContext();

  const state = {
    // Session metadata
    session_id: `session_${Date.now()}_${process.pid}`,
    initialized_at: new Date().toISOString(),
    last_activity: new Date().toISOString(),

    // SD context
    current_sd: currentSD,
    current_phase: currentPhase,
    detected_from: currentSD ? 'git_branch' : null,

    // Git context
    git: gitContext,

    // Execution tracking
    tool_executions: 0,
    model_history: [],
    checkpoints: [],

    // Baseline tracking (populated by baseline hooks)
    test_baseline: null,
    baseline_captured_at: null,

    // Error tracking
    errors: [],
    warnings: []
  };

  return state;
}

/**
 * Check if Plan Mode integration is enabled
 * SD-PLAN-MODE-001
 */
function isPlanModeEnabled() {
  try {
    if (fs.existsSync(LEO_CONFIG_FILE)) {
      const config = JSON.parse(fs.readFileSync(LEO_CONFIG_FILE, 'utf8'));
      return config.leo_plan_mode?.enabled === true &&
             config.leo_plan_mode?.auto_enter_on_sd_detection === true;
    }
  } catch (error) {
    // Config read error, disable Plan Mode
  }
  return false;
}

/**
 * Request Plan Mode entry for a detected SD
 * SD-PLAN-MODE-001
 */
function requestPlanModeEntry(sdId, phase) {
  try {
    const state = {
      requested: true,
      sdId,
      phase: (phase || 'LEAD').toUpperCase(),
      reason: 'session_start_sd_detected',
      requestedAt: new Date().toISOString(),
      // Basic permissions for LEAD phase (full permissions loaded by orchestrator)
      permissions: [
        { tool: 'Bash', prompt: 'run SD queue commands' },
        { tool: 'Bash', prompt: 'run handoff scripts' },
        { tool: 'Bash', prompt: 'check git status' }
      ]
    };

    fs.writeFileSync(PLAN_MODE_STATE_FILE, JSON.stringify(state, null, 2));
    return true;
  } catch (error) {
    console.log(`[session-init] Plan Mode state error: ${error.message}`);
    return false;
  }
}

/**
 * Main hook execution
 */
function main() {
  console.log('[session-init] Initializing Claude Code session...');

  // Check if session already exists (shouldn't with once: true, but be safe)
  if (fs.existsSync(SESSION_STATE_FILE)) {
    try {
      const existing = JSON.parse(fs.readFileSync(SESSION_STATE_FILE, 'utf8'));
      // Check if session is recent (within last 30 minutes)
      const sessionAge = Date.now() - new Date(existing.initialized_at).getTime();
      if (sessionAge < 30 * 60 * 1000) {
        console.log('[session-init] Recent session found, preserving state');
        console.log(`[session-init] SD: ${existing.current_sd || 'none'} | Phase: ${existing.current_phase || 'unknown'}`);
        return;
      }
    } catch (error) {
      // Corrupted state file, reinitialize
    }
  }

  const state = initializeSessionState();

  // Save session state
  fs.writeFileSync(SESSION_STATE_FILE, JSON.stringify(state, null, 2));

  console.log('[session-init] Session initialized');
  console.log(`[session-init] Session ID: ${state.session_id}`);
  console.log(`[session-init] SD: ${state.current_sd || 'none'} | Phase: ${state.current_phase || 'unknown'}`);
  console.log(`[session-init] Git branch: ${state.git.branch || 'unknown'}`);

  // SD-PLAN-MODE-001: Trigger Plan Mode if SD detected and enabled
  if (state.current_sd && isPlanModeEnabled()) {
    const phase = state.current_phase || 'LEAD';
    if (requestPlanModeEntry(state.current_sd, phase)) {
      console.log(`[session-init] Plan Mode requested for ${state.current_sd} (${phase} phase)`);
    }
  }
}

// Execute if run directly
if (require.main === module) {
  main();
}

module.exports = {
  initializeSessionState,
  detectCurrentSD,
  detectCurrentPhase,
  isPlanModeEnabled,
  requestPlanModeEntry
};
