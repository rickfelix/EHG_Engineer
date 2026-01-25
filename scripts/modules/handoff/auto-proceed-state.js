/**
 * AUTO-PROCEED State Management
 *
 * Part of SD-LEO-ENH-AUTO-PROCEED-001-04
 *
 * Manages the AUTO-PROCEED execution state for:
 * - Tracking current SD, phase, and task
 * - Marking interruption state
 * - Enabling resume message display
 *
 * Discovery References:
 * - D13: User can interrupt, AUTO-PROCEED auto-resumes after
 * - D19: Auto-resume after user interruption
 * - D29: Show "Resuming: SD-XXX EXEC phase, task Y..."
 *
 * @see docs/discovery/auto-proceed-enhancement-discovery.md
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// State file location (relative to project root)
const STATE_FILE = path.join(__dirname, '../../../.claude/auto-proceed-state.json');

/**
 * Default state structure
 */
const DEFAULT_STATE = {
  isActive: false,
  wasInterrupted: false,
  currentSd: null,
  currentPhase: null,
  currentTask: null,
  lastInterruptedAt: null,
  lastResumedAt: null,
  resumeCount: 0,
  version: '1.0.0'
};

/**
 * Read AUTO-PROCEED state from file
 * @returns {object} State object (with defaults for missing fields)
 */
export function readState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const content = fs.readFileSync(STATE_FILE, 'utf8');
      const state = JSON.parse(content);
      return { ...DEFAULT_STATE, ...state };
    }
  } catch (err) {
    console.warn(`[auto-proceed-state] Read error: ${err.message}`);
  }
  return { ...DEFAULT_STATE };
}

/**
 * Write AUTO-PROCEED state to file
 * @param {object} state - State to write
 * @returns {boolean} Success status
 */
export function writeState(state) {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const mergedState = { ...DEFAULT_STATE, ...state };
    fs.writeFileSync(STATE_FILE, JSON.stringify(mergedState, null, 2));
    return true;
  } catch (err) {
    console.warn(`[auto-proceed-state] Write error: ${err.message}`);
    return false;
  }
}

/**
 * Update current execution context
 * Call this when starting work on an SD or changing phases/tasks
 *
 * @param {object} context - Execution context
 * @param {string} context.sdKey - Current SD key (e.g., "SD-LEO-ENH-AUTO-PROCEED-001-04")
 * @param {string} context.phase - Current phase (e.g., "EXEC", "PLAN")
 * @param {string} context.task - Current task description
 * @param {boolean} context.isActive - Whether AUTO-PROCEED is active (default: true)
 * @returns {boolean} Success status
 */
export function updateExecutionContext(context) {
  const state = readState();

  state.currentSd = context.sdKey || context.sd || state.currentSd;
  state.currentPhase = context.phase || state.currentPhase;
  state.currentTask = context.task || state.currentTask;
  state.isActive = context.isActive !== undefined ? context.isActive : true;
  state.lastUpdatedAt = new Date().toISOString();

  return writeState(state);
}

/**
 * Mark that an interruption occurred
 * Call this when user submits a prompt during AUTO-PROCEED
 *
 * @returns {boolean} Success status
 */
export function markInterrupted() {
  const state = readState();

  if (state.isActive && state.currentSd) {
    state.wasInterrupted = true;
    state.lastInterruptedAt = new Date().toISOString();
    return writeState(state);
  }

  return false;
}

/**
 * Mark that resume has occurred
 * Call this after displaying the resume message
 *
 * @returns {boolean} Success status
 */
export function markResumed() {
  const state = readState();

  state.wasInterrupted = false;
  state.resumeCount = (state.resumeCount || 0) + 1;
  state.lastResumedAt = new Date().toISOString();

  return writeState(state);
}

/**
 * Clear the AUTO-PROCEED state (e.g., when SD completes)
 *
 * @param {boolean} keepHistory - Whether to keep resume count history
 * @returns {boolean} Success status
 */
export function clearState(keepHistory = true) {
  const state = readState();
  const resumeCount = keepHistory ? state.resumeCount : 0;

  return writeState({
    ...DEFAULT_STATE,
    resumeCount,
    clearedAt: new Date().toISOString()
  });
}

/**
 * Get the formatted resume message
 *
 * @returns {string|null} Resume message or null if not applicable
 */
export function getResumeMessage() {
  const state = readState();

  if (!state.isActive || !state.wasInterrupted || !state.currentSd) {
    return null;
  }

  const sdKey = state.currentSd;
  const phase = state.currentPhase || 'EXEC';
  const task = state.currentTask || 'previous task';

  return `🤖 Resuming: ${sdKey} ${phase} phase, ${task}...`;
}

/**
 * Check if AUTO-PROCEED is active and we should show resume message
 *
 * @returns {boolean}
 */
export function shouldShowResumeMessage() {
  const state = readState();
  return state.isActive && state.wasInterrupted && !!state.currentSd;
}

// Named export for DEFAULT_STATE for testing
export { DEFAULT_STATE };

export default {
  readState,
  writeState,
  updateExecutionContext,
  markInterrupted,
  markResumed,
  clearState,
  getResumeMessage,
  shouldShowResumeMessage,
  DEFAULT_STATE
};
