#!/usr/bin/env node

/**
 * AUTO-PROCEED Resume Hook
 *
 * Part of SD-LEO-ENH-AUTO-PROCEED-001-04
 *
 * Runs after user prompt is submitted during AUTO-PROCEED mode.
 * Outputs a resume message indicating what was being worked on.
 *
 * Discovery References:
 * - D13: After handling user input, AUTO-PROCEED should automatically resume
 * - D29: Show brief reminder: "Resuming: SD-XXX EXEC phase, task Y..."
 *
 * @see docs/discovery/auto-proceed-enhancement-discovery.md
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// State file location
const STATE_FILE = path.join(__dirname, '../../.claude/unified-session-state.json');
const AUTO_PROCEED_STATE_FILE = path.join(__dirname, '../../.claude/auto-proceed-state.json');

/**
 * Read the unified session state
 * @returns {object|null} State object or null if not found
 */
function readSessionState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const content = fs.readFileSync(STATE_FILE, 'utf8');
      return JSON.parse(content);
    }
  } catch (_err) {
    // Silently fail - state may not exist
  }
  return null;
}

/**
 * Read AUTO-PROCEED specific state
 * @returns {object} AUTO-PROCEED state with defaults
 */
function readAutoProceedState() {
  try {
    if (fs.existsSync(AUTO_PROCEED_STATE_FILE)) {
      const content = fs.readFileSync(AUTO_PROCEED_STATE_FILE, 'utf8');
      return JSON.parse(content);
    }
  } catch (_err) {
    // Silently fail
  }
  return {
    isActive: false,
    wasInterrupted: false,
    currentSd: null,
    currentPhase: null,
    currentTask: null,
    lastInterruptedAt: null,
    resumeCount: 0
  };
}

/**
 * Write AUTO-PROCEED state
 * @param {object} state - State to write
 */
function writeAutoProceedState(state) {
  try {
    const dir = path.dirname(AUTO_PROCEED_STATE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(AUTO_PROCEED_STATE_FILE, JSON.stringify(state, null, 2));
  } catch (err) {
    console.error(`[auto-proceed-resume] Failed to write state: ${err.message}`);
  }
}

/**
 * Check if AUTO-PROCEED is enabled via environment or session
 * @returns {boolean}
 */
function isAutoProceedEnabled() {
  // Check environment variable first
  const envValue = process.env.AUTO_PROCEED;
  if (envValue !== undefined && envValue !== '') {
    const normalized = String(envValue).toLowerCase().trim();
    if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) {
      return false;
    }
  }

  // Check session state
  const sessionState = readSessionState();
  if (sessionState?.autoProceed === true) {
    return true;
  }

  // Check auto-proceed state file
  const apState = readAutoProceedState();
  return apState.isActive === true;
}

/**
 * Format the resume message
 * @param {object} context - Context object with sd, phase, task
 * @returns {string} Formatted resume message
 */
function formatResumeMessage(context) {
  const sdKey = context.sd || context.sdKey || context.currentSd || 'unknown';
  const phase = context.phase || context.currentPhase || 'EXEC';
  const task = context.task || context.currentTask || 'previous task';

  return `🤖 Resuming: ${sdKey} ${phase} phase, ${task}...`;
}

/**
 * Main hook execution
 */
async function main() {
  // Check if AUTO-PROCEED is enabled
  if (!isAutoProceedEnabled()) {
    // Not in AUTO-PROCEED mode, skip
    return;
  }

  // Read current state
  const apState = readAutoProceedState();
  const sessionState = readSessionState();

  // If we were working on something before this user input
  if (apState.wasInterrupted && apState.currentSd) {
    // Output the resume message
    const message = formatResumeMessage({
      sd: apState.currentSd,
      phase: apState.currentPhase,
      task: apState.currentTask
    });

    console.log('');
    console.log(message);
    console.log('');

    // Update state - increment resume count, clear interrupted flag
    apState.wasInterrupted = false;
    apState.resumeCount = (apState.resumeCount || 0) + 1;
    apState.lastResumedAt = new Date().toISOString();
    writeAutoProceedState(apState);
  } else if (sessionState?.sd?.id) {
    // We have an active SD from session state, mark as potentially interrupted
    // This will be used on the NEXT user input if we're still working
    apState.isActive = true;
    apState.wasInterrupted = true;
    apState.currentSd = sessionState.sd.id;
    apState.currentPhase = sessionState.sd.phase || sessionState.workflow?.currentPhase || 'EXEC';
    apState.currentTask = sessionState.summaries?.pendingActions?.[0] || 'implementation';
    apState.lastInterruptedAt = new Date().toISOString();
    writeAutoProceedState(apState);
  }
}

// Execute
main().catch(err => {
  console.error(`[auto-proceed-resume] Error: ${err.message}`);
  process.exit(1);
});
