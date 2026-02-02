/**
 * AUTO-PROCEED State Management
 *
 * Part of SD-LEO-ENH-AUTO-PROCEED-001-04
 * Enhanced with database-first pattern (PAT-STATE-SYNC-001)
 *
 * Manages the AUTO-PROCEED execution state for:
 * - Tracking current SD, phase, and task
 * - Marking interruption state
 * - Enabling resume message display
 *
 * STATE HIERARCHY (highest wins):
 * 1. Database (claude_sessions.metadata.execution_state) - AUTHORITATIVE
 * 2. JSON file (.claude/auto-proceed-state.json) - Local cache/fallback
 *
 * Discovery References:
 * - D13: User can interrupt, AUTO-PROCEED auto-resumes after
 * - D19: Auto-resume after user interruption
 * - D29: Show "Resuming: SD-XXX EXEC phase, task Y..."
 * - PAT-STATE-SYNC-001: Database as single source of truth
 *
 * @see docs/discovery/auto-proceed-enhancement-discovery.md
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// State file location (relative to project root) - used as local cache
const STATE_FILE = path.join(__dirname, '../../../.claude/auto-proceed-state.json');

// Database client (lazy init)
let _supabase = null;
function getSupabase() {
  if (!_supabase && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    _supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return _supabase;
}

import os from 'os';

/**
 * Get current session ID from local session file (sync)
 * @returns {string|null} Session ID or null
 */
function getCurrentSessionIdSync() {
  try {
    const sessionDir = path.join(os.homedir(), '.claude-sessions');
    if (!fs.existsSync(sessionDir)) return null;

    const files = fs.readdirSync(sessionDir).filter(f => f.endsWith('.json'));
    const pid = process.ppid || process.pid;

    for (const file of files) {
      const data = JSON.parse(fs.readFileSync(path.join(sessionDir, file), 'utf8'));
      if (data.pid === pid) {
        return data.session_id;
      }
    }
  } catch {
    // Fallback - no session found
  }
  return null;
}

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
 * Read AUTO-PROCEED state from database (authoritative) with JSON fallback
 * @returns {object} State object (with defaults for missing fields)
 */
export function readState() {
  // Try JSON file first for sync operation (database read is async)
  let fileState = { ...DEFAULT_STATE };
  try {
    if (fs.existsSync(STATE_FILE)) {
      const content = fs.readFileSync(STATE_FILE, 'utf8');
      fileState = { ...DEFAULT_STATE, ...JSON.parse(content) };
    }
  } catch (err) {
    console.warn(`[auto-proceed-state] File read error: ${err.message}`);
  }
  return fileState;
}

/**
 * Read AUTO-PROCEED state from database (authoritative)
 * Use this when async is acceptable for most accurate state
 * @returns {Promise<object>} State object from database
 */
export async function readStateFromDb() {
  const supabase = getSupabase();
  if (!supabase) {
    return readState(); // Fallback to file
  }

  try {
    const sessionId = getCurrentSessionIdSync();
    if (!sessionId) {
      return readState(); // Fallback to file
    }

    const { data, error } = await supabase
      .from('claude_sessions')
      .select('metadata, sd_id')
      .eq('session_id', sessionId)
      .single();

    if (error || !data) {
      return readState(); // Fallback to file
    }

    const execState = data.metadata?.execution_state || {};
    const dbState = {
      ...DEFAULT_STATE,
      currentSd: data.sd_id || execState.currentSd || null,
      currentPhase: execState.currentPhase || null,
      currentTask: execState.currentTask || null,
      isActive: execState.isActive ?? false,
      wasInterrupted: execState.wasInterrupted ?? false,
      lastInterruptedAt: execState.lastInterruptedAt || null,
      lastResumedAt: execState.lastResumedAt || null,
      resumeCount: execState.resumeCount || 0,
      lastUpdatedAt: execState.lastUpdatedAt || null
    };

    // Update local cache to match database
    writeStateToFile(dbState);

    return dbState;
  } catch (err) {
    console.warn(`[auto-proceed-state] DB read error: ${err.message}`);
    return readState(); // Fallback to file
  }
}

/**
 * Write AUTO-PROCEED state to file only (internal helper)
 * @param {object} state - State to write
 * @returns {boolean} Success status
 */
function writeStateToFile(state) {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const mergedState = { ...DEFAULT_STATE, ...state };
    fs.writeFileSync(STATE_FILE, JSON.stringify(mergedState, null, 2));
    return true;
  } catch (err) {
    console.warn(`[auto-proceed-state] File write error: ${err.message}`);
    return false;
  }
}

/**
 * Sync state to database (async, fire-and-forget for sync callers)
 * @param {object} state - State to sync
 */
async function syncStateToDb(state) {
  const supabase = getSupabase();
  if (!supabase) return;

  try {
    const sessionId = getCurrentSessionIdSync();
    if (!sessionId) return;

    // Read existing metadata to merge
    const { data: existing } = await supabase
      .from('claude_sessions')
      .select('metadata')
      .eq('session_id', sessionId)
      .single();

    const existingMetadata = existing?.metadata || {};

    // Build execution_state object for database
    const executionState = {
      currentSd: state.currentSd,
      currentPhase: state.currentPhase,
      currentTask: state.currentTask,
      isActive: state.isActive,
      wasInterrupted: state.wasInterrupted,
      lastInterruptedAt: state.lastInterruptedAt,
      lastResumedAt: state.lastResumedAt,
      resumeCount: state.resumeCount,
      lastUpdatedAt: state.lastUpdatedAt || new Date().toISOString()
    };

    const updatedMetadata = {
      ...existingMetadata,
      execution_state: executionState
    };

    await supabase
      .from('claude_sessions')
      .update({
        metadata: updatedMetadata,
        updated_at: new Date().toISOString()
      })
      .eq('session_id', sessionId);

  } catch (err) {
    // Silent fail - database sync is best-effort
    // File is always written as fallback
    console.warn(`[auto-proceed-state] DB sync error: ${err.message}`);
  }
}

/**
 * Write AUTO-PROCEED state to both file (sync) and database (async)
 * Database is authoritative; file is cache
 * @param {object} state - State to write
 * @returns {boolean} Success status (file write)
 */
export function writeState(state) {
  const mergedState = { ...DEFAULT_STATE, ...state };

  // Write to file (sync, immediate)
  const fileSuccess = writeStateToFile(mergedState);

  // Sync to database (async, fire-and-forget)
  // This ensures database is updated even if caller doesn't await
  syncStateToDb(mergedState).catch(() => {
    // Already logged in syncStateToDb
  });

  return fileSuccess;
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

/**
 * Initialize state from database on session start
 * Call this once at session start to ensure local cache matches DB
 * @returns {Promise<object>} State from database
 */
export async function initializeFromDb() {
  return readStateFromDb();
}

/**
 * Validate and reconcile state between database and file
 * Returns warnings if there are mismatches
 * @returns {Promise<{state: object, warnings: string[]}>}
 */
export async function validateState() {
  const warnings = [];
  const fileState = readState();
  const dbState = await readStateFromDb();

  if (fileState.currentSd !== dbState.currentSd) {
    warnings.push(`SD mismatch: file=${fileState.currentSd}, db=${dbState.currentSd}`);
  }
  if (fileState.currentPhase !== dbState.currentPhase) {
    warnings.push(`Phase mismatch: file=${fileState.currentPhase}, db=${dbState.currentPhase}`);
  }

  // Database wins - return DB state
  return { state: dbState, warnings };
}

export default {
  readState,
  readStateFromDb,
  writeState,
  updateExecutionContext,
  markInterrupted,
  markResumed,
  clearState,
  getResumeMessage,
  shouldShowResumeMessage,
  initializeFromDb,
  validateState,
  DEFAULT_STATE
};
