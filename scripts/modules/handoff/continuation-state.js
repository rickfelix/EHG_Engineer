/**
 * Continuation State Management
 *
 * Part of SD-LEO-INFRA-STOP-HOOK-ENHANCEMENT-001
 *
 * Manages the continuation state for cross-session AUTO-PROCEED:
 * - Schema-validated state read/write
 * - Incomplete detection logic
 * - Exit code 3 signaling support
 *
 * @see docs/plans/SD-LEO-INFRA-HARDENING-001-plan.md
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// State file location (relative to project root)
const STATE_FILE = path.join(__dirname, '../../../.claude/continuation-state.json');

/**
 * State schema version
 */
const SCHEMA_VERSION = '1.0.0';

/**
 * Valid status values
 */
const VALID_STATUSES = ['incomplete', 'complete', 'error', 'paused'];

/**
 * Valid reason values for incomplete status
 */
const VALID_REASONS = ['context_limit', 'session_end', 'user_interrupt', 'error'];

/**
 * Default state structure
 */
const DEFAULT_STATE = {
  version: SCHEMA_VERSION,
  status: 'complete',
  reason: null,
  sd: {
    id: null,
    phase: null,
    progress: null,
    type: null
  },
  pendingCommands: [],
  lastAction: null,
  retryCount: 0,
  maxRetries: 10,
  consecutiveErrors: 0,
  errorDetails: null,
  createdAt: null,
  updatedAt: null
};

/**
 * Validate state object against schema
 * @param {object} state - State to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateState(state) {
  const errors = [];

  // Check version
  if (!state.version || typeof state.version !== 'string') {
    errors.push('Missing or invalid version');
  }

  // Check status
  if (!VALID_STATUSES.includes(state.status)) {
    errors.push(`Invalid status: ${state.status}. Must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  // Check reason (required if status is 'incomplete')
  if (state.status === 'incomplete' && !VALID_REASONS.includes(state.reason)) {
    errors.push(`Invalid reason: ${state.reason}. Must be one of: ${VALID_REASONS.join(', ')}`);
  }

  // Check sd object structure
  if (state.sd && typeof state.sd !== 'object') {
    errors.push('sd must be an object');
  }

  // Check pendingCommands is array
  if (state.pendingCommands && !Array.isArray(state.pendingCommands)) {
    errors.push('pendingCommands must be an array');
  }

  // Check numeric fields
  if (typeof state.retryCount !== 'number' || state.retryCount < 0) {
    errors.push('retryCount must be a non-negative number');
  }

  if (typeof state.maxRetries !== 'number' || state.maxRetries < 1) {
    errors.push('maxRetries must be a positive number');
  }

  if (typeof state.consecutiveErrors !== 'number' || state.consecutiveErrors < 0) {
    errors.push('consecutiveErrors must be a non-negative number');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Read continuation state from file
 * @returns {object} State object (with defaults for missing fields)
 */
export function readState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const content = fs.readFileSync(STATE_FILE, 'utf8');
      const state = JSON.parse(content);

      // Merge with defaults to ensure all fields exist
      const mergedState = {
        ...DEFAULT_STATE,
        ...state,
        sd: { ...DEFAULT_STATE.sd, ...(state.sd || {}) }
      };

      return mergedState;
    }
  } catch (err) {
    console.warn(`[continuation-state] Read error: ${err.message}`);
  }
  return { ...DEFAULT_STATE, sd: { ...DEFAULT_STATE.sd } };
}

/**
 * Write continuation state to file
 * @param {object} state - State to write
 * @returns {{ success: boolean, errors?: string[] }}
 */
export function writeState(state) {
  // Merge with defaults
  const mergedState = {
    ...DEFAULT_STATE,
    ...state,
    sd: { ...DEFAULT_STATE.sd, ...(state.sd || {}) },
    updatedAt: new Date().toISOString()
  };

  // Set createdAt if new
  if (!mergedState.createdAt) {
    mergedState.createdAt = mergedState.updatedAt;
  }

  // Validate
  const validation = validateState(mergedState);
  if (!validation.valid) {
    console.warn(`[continuation-state] Validation errors: ${validation.errors.join(', ')}`);
    return { success: false, errors: validation.errors };
  }

  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(mergedState, null, 2));
    return { success: true };
  } catch (err) {
    console.warn(`[continuation-state] Write error: ${err.message}`);
    return { success: false, errors: [err.message] };
  }
}

/**
 * Check if continuation is needed (incomplete work exists)
 * @param {object} supabase - Supabase client
 * @param {object} sd - Current SD object
 * @param {string} sdKey - SD key
 * @returns {Promise<{ needed: boolean, reason?: string, state?: object }>}
 */
export async function checkContinuationNeeded(supabase, sd, sdKey) {
  // Check if SD is complete
  if (sd.status === 'completed' || sd.current_phase === 'COMPLETED') {
    // Check for pending post-completion commands
    const state = readState();
    if (state.pendingCommands && state.pendingCommands.length > 0) {
      return {
        needed: true,
        reason: 'session_end',
        state: {
          ...state,
          status: 'incomplete',
          reason: 'session_end',
          sd: {
            id: sdKey,
            phase: 'POST_COMPLETION',
            progress: 100,
            type: sd.sd_type || 'feature'
          }
        }
      };
    }
    return { needed: false };
  }

  // Check if SD is in active phase with progress
  const activePhases = ['LEAD', 'PLAN', 'EXEC', 'PLAN_VERIFY', 'LEAD_FINAL'];
  if (activePhases.includes(sd.current_phase)) {
    return {
      needed: true,
      reason: 'session_end',
      state: {
        version: SCHEMA_VERSION,
        status: 'incomplete',
        reason: 'session_end',
        sd: {
          id: sdKey,
          phase: sd.current_phase,
          progress: sd.progress || sd.progress_percentage || 0,
          type: sd.sd_type || 'feature'
        },
        pendingCommands: [],
        lastAction: `Working on ${sdKey} in ${sd.current_phase} phase`,
        retryCount: 0,
        maxRetries: 10,
        consecutiveErrors: 0,
        errorDetails: null
      }
    };
  }

  return { needed: false };
}

/**
 * Mark state as incomplete with reason
 * @param {string} reason - Reason for incomplete status
 * @param {object} context - Additional context
 * @returns {{ success: boolean, errors?: string[] }}
 */
export function markIncomplete(reason, context = {}) {
  if (!VALID_REASONS.includes(reason)) {
    return { success: false, errors: [`Invalid reason: ${reason}`] };
  }

  const currentState = readState();

  return writeState({
    ...currentState,
    status: 'incomplete',
    reason,
    sd: { ...currentState.sd, ...(context.sd || {}) },
    lastAction: context.lastAction || currentState.lastAction,
    pendingCommands: context.pendingCommands || currentState.pendingCommands,
    errorDetails: context.errorDetails || null
  });
}

/**
 * Mark state as complete
 * @returns {{ success: boolean, errors?: string[] }}
 */
export function markComplete() {
  return writeState({
    ...DEFAULT_STATE,
    status: 'complete',
    reason: null,
    pendingCommands: [],
    errorDetails: null
  });
}

/**
 * Mark state as paused (non-recoverable error)
 * @param {string} errorDetails - Error description
 * @returns {{ success: boolean, errors?: string[] }}
 */
export function markPaused(errorDetails) {
  const currentState = readState();

  return writeState({
    ...currentState,
    status: 'paused',
    errorDetails
  });
}

/**
 * Mark state as error
 * @param {string} errorDetails - Error description
 * @returns {{ success: boolean, errors?: string[] }}
 */
export function markError(errorDetails) {
  const currentState = readState();

  return writeState({
    ...currentState,
    status: 'error',
    reason: 'error',
    consecutiveErrors: (currentState.consecutiveErrors || 0) + 1,
    errorDetails
  });
}

/**
 * Increment retry count
 * @returns {{ success: boolean, shouldContinue: boolean, retryCount: number }}
 */
export function incrementRetry() {
  const currentState = readState();
  const newRetryCount = (currentState.retryCount || 0) + 1;

  const result = writeState({
    ...currentState,
    retryCount: newRetryCount
  });

  return {
    success: result.success,
    shouldContinue: newRetryCount < (currentState.maxRetries || 10),
    retryCount: newRetryCount
  };
}

/**
 * Reset retry and error counts
 * @returns {{ success: boolean, errors?: string[] }}
 */
export function resetRetryCount() {
  const currentState = readState();

  return writeState({
    ...currentState,
    retryCount: 0,
    consecutiveErrors: 0,
    errorDetails: null
  });
}

/**
 * Add pending commands
 * @param {string[]} commands - Commands to add
 * @returns {{ success: boolean, errors?: string[] }}
 */
export function addPendingCommands(commands) {
  if (!Array.isArray(commands)) {
    return { success: false, errors: ['commands must be an array'] };
  }

  const currentState = readState();
  const existingCommands = currentState.pendingCommands || [];
  const newCommands = [...existingCommands, ...commands.filter(cmd => !existingCommands.includes(cmd))];

  return writeState({
    ...currentState,
    pendingCommands: newCommands
  });
}

/**
 * Remove a pending command (after execution)
 * @param {string} command - Command to remove
 * @returns {{ success: boolean, errors?: string[] }}
 */
export function removePendingCommand(command) {
  const currentState = readState();
  const pendingCommands = (currentState.pendingCommands || []).filter(cmd => cmd !== command);

  return writeState({
    ...currentState,
    pendingCommands
  });
}

/**
 * Get state file path (for external tools)
 * @returns {string}
 */
export function getStateFilePath() {
  return STATE_FILE;
}

/**
 * Check if state indicates continuation is needed
 * @returns {boolean}
 */
export function needsContinuation() {
  const state = readState();
  return state.status === 'incomplete';
}

/**
 * Check if state indicates the loop should pause
 * @returns {boolean}
 */
export function shouldPause() {
  const state = readState();
  return state.status === 'paused' || state.status === 'error';
}

/**
 * Check if circuit breaker is tripped
 * @param {number} threshold - Number of consecutive errors to trip (default: 3)
 * @returns {boolean}
 */
export function isCircuitBreakerTripped(threshold = 3) {
  const state = readState();
  return (state.consecutiveErrors || 0) >= threshold;
}

// Named exports for constants
export { DEFAULT_STATE, VALID_STATUSES, VALID_REASONS, SCHEMA_VERSION };

export default {
  readState,
  writeState,
  validateState,
  checkContinuationNeeded,
  markIncomplete,
  markComplete,
  markPaused,
  markError,
  incrementRetry,
  resetRetryCount,
  addPendingCommands,
  removePendingCommand,
  getStateFilePath,
  needsContinuation,
  shouldPause,
  isCircuitBreakerTripped,
  DEFAULT_STATE,
  VALID_STATUSES,
  VALID_REASONS,
  SCHEMA_VERSION
};
