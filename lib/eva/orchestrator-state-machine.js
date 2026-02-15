/**
 * Orchestrator State Machine - Formalized Execution States
 *
 * SD-LEO-ORCH-CLI-VENTURE-LIFECYCLE-002-G
 *
 * Formalizes orchestrator execution states (idle/processing/blocked/failed)
 * which were previously implicit. Prevents concurrent processStage() calls
 * for the same venture via atomic state transitions.
 *
 * @module lib/eva/orchestrator-state-machine
 */

import { randomUUID } from 'crypto';

// ── Constants ───────────────────────────────────────────────

export const MODULE_VERSION = '1.0.0';

export const ORCHESTRATOR_STATES = Object.freeze({
  IDLE: 'idle',
  PROCESSING: 'processing',
  BLOCKED: 'blocked',
  FAILED: 'failed',
});

/**
 * Valid state transitions. Each key maps to an array of allowed target states.
 */
export const VALID_TRANSITIONS = Object.freeze({
  [ORCHESTRATOR_STATES.IDLE]: [ORCHESTRATOR_STATES.PROCESSING],
  [ORCHESTRATOR_STATES.PROCESSING]: [
    ORCHESTRATOR_STATES.IDLE,
    ORCHESTRATOR_STATES.BLOCKED,
    ORCHESTRATOR_STATES.FAILED,
  ],
  [ORCHESTRATOR_STATES.BLOCKED]: [
    ORCHESTRATOR_STATES.IDLE,
    ORCHESTRATOR_STATES.PROCESSING,
  ],
  [ORCHESTRATOR_STATES.FAILED]: [
    ORCHESTRATOR_STATES.IDLE,
    ORCHESTRATOR_STATES.PROCESSING,
  ],
});

// ── Validation ──────────────────────────────────────────────

/**
 * Validate whether a state transition is allowed.
 *
 * @param {string} from - Current state
 * @param {string} to - Target state
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateStateTransition(from, to) {
  const allStates = Object.values(ORCHESTRATOR_STATES);

  if (!allStates.includes(from)) {
    return { valid: false, error: `Unknown state: ${from}` };
  }
  if (!allStates.includes(to)) {
    return { valid: false, error: `Unknown state: ${to}` };
  }
  if (from === to) {
    return { valid: false, error: `Cannot transition to same state: ${from}` };
  }

  const allowed = VALID_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    return { valid: false, error: `Invalid transition: ${from} → ${to}` };
  }

  return { valid: true };
}

// ── Lock Operations ─────────────────────────────────────────

/**
 * Acquire a processing lock for a venture.
 * Atomically transitions idle → processing. Returns false if venture is
 * not in idle state (already being processed).
 *
 * @param {Object} db - Supabase client
 * @param {string} ventureId - Venture UUID
 * @param {Object} [options]
 * @param {string} [options.correlationId] - Correlation ID for audit
 * @param {Object} [options.logger] - Logger
 * @returns {Promise<{ acquired: boolean, lockId?: string, error?: string, previousState?: string }>}
 */
export async function acquireProcessingLock(supabase, ventureId, options = {}) {
  const { correlationId, logger = console } = options;

  if (!supabase || !ventureId) {
    return { acquired: false, error: 'Missing db client or ventureId' };
  }

  const lockId = randomUUID();

  try {
    // Atomic conditional update: only succeed if current state is idle
    const { data, error } = await supabase
      .from('eva_ventures')
      .update({
        orchestrator_state: ORCHESTRATOR_STATES.PROCESSING,
        orchestrator_lock_id: lockId,
        orchestrator_lock_acquired_at: new Date().toISOString(),
      })
      .eq('id', ventureId)
      .eq('orchestrator_state', ORCHESTRATOR_STATES.IDLE)
      .select('id, orchestrator_state')
      .single();

    if (error || !data) {
      // Check current state for diagnostics
      const { data: current } = await supabase
        .from('eva_ventures')
        .select('orchestrator_state')
        .eq('id', ventureId)
        .single();

      const currentState = current?.orchestrator_state || 'unknown';
      logger.warn(`[StateMachine] Lock denied for ${ventureId}: state=${currentState}, correlationId=${correlationId}`);

      return {
        acquired: false,
        error: 'CONCURRENT_EXECUTION',
        previousState: currentState,
      };
    }

    logger.log(`[StateMachine] Lock acquired for ${ventureId}: lockId=${lockId}`);
    return { acquired: true, lockId };
  } catch (err) {
    logger.error(`[StateMachine] Lock acquisition error: ${err.message}`);
    return { acquired: false, error: err.message };
  }
}

/**
 * Release a processing lock, transitioning back to idle (or to a specified state).
 *
 * @param {Object} supabase - Supabase client
 * @param {string} ventureId - Venture UUID
 * @param {Object} [options]
 * @param {string} [options.lockId] - Expected lock ID (safety check)
 * @param {string} [options.targetState] - State to transition to (default: idle)
 * @param {Object} [options.logger] - Logger
 * @returns {Promise<{ released: boolean, newState?: string, error?: string }>}
 */
export async function releaseProcessingLock(supabase, ventureId, options = {}) {
  const {
    lockId,
    targetState = ORCHESTRATOR_STATES.IDLE,
    logger = console,
  } = options;

  if (!supabase || !ventureId) {
    return { released: false, error: 'Missing db client or ventureId' };
  }

  // Validate target state transition
  const validation = validateStateTransition(ORCHESTRATOR_STATES.PROCESSING, targetState);
  if (!validation.valid) {
    return { released: false, error: validation.error };
  }

  try {
    let query = supabase
      .from('eva_ventures')
      .update({
        orchestrator_state: targetState,
        orchestrator_lock_id: null,
        orchestrator_lock_acquired_at: null,
      })
      .eq('id', ventureId)
      .eq('orchestrator_state', ORCHESTRATOR_STATES.PROCESSING);

    // If lockId provided, also verify it matches (prevents stale releases)
    if (lockId) {
      query = query.eq('orchestrator_lock_id', lockId);
    }

    const { data, error } = await query
      .select('id, orchestrator_state')
      .single();

    if (error || !data) {
      logger.warn(`[StateMachine] Lock release failed for ${ventureId}: lockId=${lockId}`);
      return { released: false, error: 'Lock release failed - state or lockId mismatch' };
    }

    logger.log(`[StateMachine] Lock released for ${ventureId}: newState=${targetState}`);
    return { released: true, newState: targetState };
  } catch (err) {
    logger.error(`[StateMachine] Lock release error: ${err.message}`);
    return { released: false, error: err.message };
  }
}

/**
 * Get the current orchestrator state for a venture.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} ventureId - Venture UUID
 * @returns {Promise<{ state: string, lockId?: string, lockAcquiredAt?: string, error?: string }>}
 */
export async function getOrchestratorState(supabase, ventureId) {
  if (!supabase || !ventureId) {
    return { state: ORCHESTRATOR_STATES.IDLE, error: 'Missing db client or ventureId' };
  }

  try {
    const { data, error } = await supabase
      .from('eva_ventures')
      .select('orchestrator_state, orchestrator_lock_id, orchestrator_lock_acquired_at')
      .eq('id', ventureId)
      .single();

    if (error || !data) {
      return { state: ORCHESTRATOR_STATES.IDLE, error: error?.message || 'Venture not found' };
    }

    return {
      state: data.orchestrator_state || ORCHESTRATOR_STATES.IDLE,
      lockId: data.orchestrator_lock_id,
      lockAcquiredAt: data.orchestrator_lock_acquired_at,
    };
  } catch (err) {
    return { state: ORCHESTRATOR_STATES.IDLE, error: err.message };
  }
}

// ── Exported for testing ────────────────────────────────────

export const _internal = {
  ORCHESTRATOR_STATES,
  VALID_TRANSITIONS,
};
