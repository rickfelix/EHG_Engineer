#!/usr/bin/env node
/**
 * Heartbeat Manager for Multi-Instance Claude Code Coordination
 * SD-LEO-INFRA-MULTI-SESSION-COORDINATION-001 (FR-5)
 *
 * Purpose: Ensure heartbeat updates occur at least every 60 seconds
 * during active SD work. Prevents premature stale session detection.
 *
 * Usage:
 * - startHeartbeat(sessionId) - Start automatic heartbeat updates
 * - stopHeartbeat() - Stop the heartbeat interval
 * - isHeartbeatActive() - Check if heartbeat is running
 *
 * The manager uses setInterval to send heartbeat updates every 30 seconds
 * (well within the 60s requirement, providing safety margin).
 */

import { createSupabaseServiceClient } from './supabase-client.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { updateHeartbeat as dbUpdateHeartbeat, endSession } from './session-manager.mjs';
import { selfHeal } from '../scripts/modules/claim-health/self-heal.js';
import {
  OWNERSHIP_MODE,
  shouldReleaseOnExit,
} from './protocol-policies/claim-ownership-mode.js';

const __hb_filename = fileURLToPath(import.meta.url);
const __hb_dirname = path.dirname(__hb_filename);
dotenv.config({ path: path.resolve(__hb_dirname, '../.env') });

const hbSupabase = createSupabaseServiceClient();

// Configuration
const HEARTBEAT_INTERVAL_MS = 30000; // 30 seconds (safety margin under 60s requirement)
const MAX_CONSECUTIVE_FAILURES = 3;
const GRACEFUL_EXIT_TIMEOUT_MS = 5000; // 5 second timeout for graceful release (FR-3/US-002)
const GRACEFUL_EXIT_RETRIES = 3; // Number of retry attempts

// Module state
let heartbeatInterval = null;
let currentSessionId = null;
let consecutiveFailures = 0;
let lastSuccessfulHeartbeat = null;
let isReleasing = false; // Prevent duplicate release attempts
let exitHandlersRegistered = false;
// SD-LEO-INFRA-LEO-PROTOCOL-POLICY-001 (FR-007): ownership mode for the
// currently-running heartbeat. Drives whether exit handlers release the claim.
// Default 'exclusive' preserves pre-existing behavior for all existing callers.
let currentOwnershipMode = OWNERSHIP_MODE.EXCLUSIVE;

/**
 * SD-LEO-INFRA-ISL-001 (US-002): Release session with retry and timeout
 * Attempts graceful release within 5 seconds, with exponential backoff retries
 *
 * @param {string} reason - Release reason
 * @returns {Promise<{success: boolean, latency_ms?: number}>}
 */
async function releaseSessionWithRetry(reason = 'graceful_exit') {
  if (isReleasing) {
    console.log('[Heartbeat] Release already in progress, skipping duplicate');
    return { success: true, skipped: true };
  }

  if (!currentSessionId) {
    return { success: false, error: 'no_session' };
  }

  isReleasing = true;
  const startTime = Date.now();
  let lastError = null;

  for (let attempt = 1; attempt <= GRACEFUL_EXIT_RETRIES; attempt++) {
    try {
      // Create a timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Release timeout')), GRACEFUL_EXIT_TIMEOUT_MS);
      });

      // Race between release and timeout
      const result = await Promise.race([
        endSession(reason),
        timeoutPromise
      ]);

      if (result?.success) {
        const latencyMs = Date.now() - startTime;
        console.log(`[Heartbeat] Session released successfully (${latencyMs}ms)`);
        isReleasing = false;
        return { success: true, latency_ms: latencyMs };
      }

      lastError = new Error(result?.error || 'Unknown error');
    } catch (err) {
      lastError = err;
      const backoffMs = Math.pow(2, attempt - 1) * 100; // 100ms, 200ms, 400ms
      console.warn(`[Heartbeat] Release attempt ${attempt}/${GRACEFUL_EXIT_RETRIES} failed: ${err.message}`);

      if (attempt < GRACEFUL_EXIT_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }
  }

  // All retries failed - log warning, heartbeat cleanup will handle it
  console.warn(`[Heartbeat] Graceful release failed after ${GRACEFUL_EXIT_RETRIES} attempts, relying on heartbeat cleanup`);
  isReleasing = false;
  return { success: false, error: lastError?.message };
}

/**
 * Start automatic heartbeat updates for a session
 * SD-LEO-INFRA-ISL-001 (US-002): Enhanced with graceful exit handlers
 * SD-LEO-INFRA-LEO-PROTOCOL-POLICY-001 (FR-007): Supports ownership modes
 *
 * @param {string} sessionId - Session ID to send heartbeats for
 * @param {object} [options]
 * @param {'exclusive'|'cooperative'} [options.ownershipMode='exclusive']
 *   'exclusive'   — this process owns the claim; release on exit (legacy default).
 *   'cooperative' — we inherited the claim from a caller session; do NOT release
 *                   on exit — the caller session retains ownership.
 *   Mirrors lib/protocol-policies/claim-ownership-mode.js semantics.
 * @returns {object} - Result with success status
 */
export function startHeartbeat(sessionId, options = {}) {
  // Resolve ownership mode with safe default
  const requestedMode = options?.ownershipMode;
  const ownershipMode = (requestedMode === OWNERSHIP_MODE.COOPERATIVE || requestedMode === OWNERSHIP_MODE.EXCLUSIVE)
    ? requestedMode
    : OWNERSHIP_MODE.EXCLUSIVE;

  if (heartbeatInterval) {
    // Already running - check if same session
    if (currentSessionId === sessionId) {
      // Update ownership mode in case caller escalated from exclusive to cooperative
      currentOwnershipMode = ownershipMode;
      return { success: true, message: 'Heartbeat already active for this session', ownershipMode };
    }
    // Different session - stop old one first
    stopHeartbeat();
  }

  currentSessionId = sessionId;
  currentOwnershipMode = ownershipMode;
  consecutiveFailures = 0;
  lastSuccessfulHeartbeat = new Date();

  // SD-LEO-FIX-FIX-SESSION-LIVENESS-001 (US-002): Mark session as alive
  setIsAlive(sessionId, true);

  // Send initial heartbeat
  sendHeartbeat();

  // Start interval
  heartbeatInterval = setInterval(() => {
    sendHeartbeat();
  }, HEARTBEAT_INTERVAL_MS);

  // SD-LEO-INFRA-ISL-001 (US-002): Enhanced exit handlers with graceful release
  // Only register once to prevent duplicate handlers
  if (!exitHandlersRegistered) {
    exitHandlersRegistered = true;

    // Handle graceful exit (Ctrl+C, normal exit)
    // SD-LEO-INFRA-LEO-PROTOCOL-POLICY-001 (FR-007): cooperative mode preserves
    // the caller session's claim — only exclusive mode releases on exit.
    const gracefulExitHandler = async (signal) => {
      const willRelease = shouldReleaseOnExit(currentOwnershipMode);
      if (willRelease) {
        console.log(`[Heartbeat] Received ${signal}, releasing session (exclusive mode)...`);
        stopHeartbeat();
        await releaseSessionWithRetry(`${signal.toLowerCase()}_exit`);
      } else {
        console.log(`[Heartbeat] Received ${signal}, claim preserved (cooperative mode)`);
        stopHeartbeat();
      }
      process.exit(0);
    };

    process.on('SIGINT', () => gracefulExitHandler('SIGINT'));
    process.on('SIGTERM', () => gracefulExitHandler('SIGTERM'));

    // beforeExit is async-safe, use for final cleanup
    process.on('beforeExit', async (code) => {
      if (currentSessionId) {
        if (shouldReleaseOnExit(currentOwnershipMode)) {
          console.log(`[Heartbeat] beforeExit (code ${code}), releasing session (exclusive mode)...`);
          await releaseSessionWithRetry('process_exit');
        } else {
          console.log(`[Heartbeat] beforeExit (code ${code}), claim preserved (cooperative mode)`);
        }
      }
    });

    // exit is sync-only, just log
    process.on('exit', (code) => {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
      console.log(`[Heartbeat] Process exiting (code ${code})`);
    });
  }

  console.log(`[Heartbeat] Started automatic heartbeat (every ${HEARTBEAT_INTERVAL_MS / 1000}s)`);

  return { success: true, sessionId, intervalMs: HEARTBEAT_INTERVAL_MS };
}

/**
 * Stop automatic heartbeat updates
 * @returns {object} - Result with success status
 */
export function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
    const stoppedSession = currentSessionId;
    // SD-LEO-FIX-FIX-SESSION-LIVENESS-001 (US-002): Mark session as not alive
    if (stoppedSession) {
      setIsAlive(stoppedSession, false);
    }
    currentSessionId = null;
    // SD-LEO-INFRA-LEO-PROTOCOL-POLICY-001 (FR-007): reset to safe default so
    // the next startHeartbeat without an explicit mode lands on 'exclusive'.
    currentOwnershipMode = OWNERSHIP_MODE.EXCLUSIVE;
    console.log(`[Heartbeat] Stopped automatic heartbeat for ${stoppedSession}`);
    return { success: true, stoppedSession };
  }
  return { success: false, message: 'No active heartbeat to stop' };
}

/**
 * Get the ownership mode of the currently-running heartbeat.
 * Primarily for tests and diagnostics.
 * SD-LEO-INFRA-LEO-PROTOCOL-POLICY-001 (FR-007)
 *
 * @returns {'exclusive'|'cooperative'}
 */
export function getCurrentOwnershipMode() {
  return currentOwnershipMode;
}

/**
 * Check if heartbeat is currently active
 * @returns {object} - Status object
 */
export function isHeartbeatActive() {
  return {
    active: heartbeatInterval !== null,
    sessionId: currentSessionId,
    lastSuccessfulHeartbeat,
    consecutiveFailures
  };
}

/**
 * Get heartbeat statistics
 * @returns {object} - Statistics about heartbeat
 */
export function getHeartbeatStats() {
  const now = new Date();
  const secondsSinceLastHeartbeat = lastSuccessfulHeartbeat
    ? Math.round((now - lastSuccessfulHeartbeat) / 1000)
    : null;

  return {
    isActive: heartbeatInterval !== null,
    sessionId: currentSessionId,
    intervalSeconds: HEARTBEAT_INTERVAL_MS / 1000,
    lastSuccessfulHeartbeat,
    secondsSinceLastHeartbeat,
    consecutiveFailures,
    maxConsecutiveFailures: MAX_CONSECUTIVE_FAILURES,
    healthy: consecutiveFailures < MAX_CONSECUTIVE_FAILURES
  };
}

/**
 * SD-LEO-FIX-FIX-SESSION-LIVENESS-001 (US-002): Set is_alive flag in database
 * @param {string} sessionId - Session ID
 * @param {boolean} alive - Whether the session is alive
 */
async function setIsAlive(sessionId, alive) {
  try {
    // Route through stampBranch so current_branch is populated alongside the
    // liveness flag. See lib/session-writer.cjs and SD-LEO-INFRA-SESSION-CURRENT-BRANCH-001.
    const { createRequire } = await import('module');
    const req = createRequire(import.meta.url);
    const { stampBranch } = req('./session-writer.cjs');
    const payload = stampBranch({ is_alive: alive, updated_at: new Date().toISOString() });
    await hbSupabase
      .from('claude_sessions')
      .update(payload)
      .eq('session_id', sessionId);
  } catch (err) {
    console.warn(`[Heartbeat] Failed to set is_alive=${alive}: ${err.message}`);
  }
}

/**
 * Internal: Send a heartbeat update
 */
async function sendHeartbeat() {
  if (!currentSessionId) {
    return;
  }

  try {
    const result = await dbUpdateHeartbeat(currentSessionId);

    if (result.success || result.heartbeat_at) {
      consecutiveFailures = 0;
      lastSuccessfulHeartbeat = new Date();

      // SD-LEO-INFRA-INTELLIGENT-CLAIM-HEALTH-001: Run self-heal on every successful heartbeat
      // SD-LEO-INFRA-FLEET-COORDINATION-RESILIENCE-001 (FR-004): Added timeout safeguard and failure logging
      const SELF_HEAL_TIMEOUT_MS = parseInt(process.env.SELF_HEAL_TIMEOUT_MS, 10) || 2000;
      const healStart = Date.now();
      const healPromise = selfHeal(hbSupabase, currentSessionId);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('self-heal timeout')), SELF_HEAL_TIMEOUT_MS)
      );
      Promise.race([healPromise, timeoutPromise]).then(healResult => {
        const elapsed = Date.now() - healStart;
        if (healResult.released.length > 0) {
          console.log(`[Heartbeat] Self-heal released ${healResult.released.length} ghost claim(s) in ${elapsed}ms: ${healResult.released.join(', ')}`);
        }
        if (healResult.errors.length > 0) {
          console.warn(`[Heartbeat] Self-heal errors (${elapsed}ms, session=${currentSessionId}): ${healResult.errors.join('; ')}`);
        }
      }).catch(err => {
        const elapsed = Date.now() - healStart;
        console.warn(`[Heartbeat] Self-heal failed (${elapsed}ms, session=${currentSessionId}): ${err.message}`);
      });
    } else {
      consecutiveFailures++;
      console.warn(`[Heartbeat] Update returned no success (session=${currentSessionId}, attempt ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}, last_success=${lastSuccessfulHeartbeat?.toISOString() || 'never'})`);
    }
  } catch (error) {
    consecutiveFailures++;
    console.warn(`[Heartbeat] Failed to update (session=${currentSessionId}, attempt ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}): ${error.message}`);

    // Stop heartbeat if too many consecutive failures
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      console.error(`[Heartbeat] Too many consecutive failures - stopping heartbeat (session=${currentSessionId}, last_success=${lastSuccessfulHeartbeat?.toISOString() || 'never'})`);
      stopHeartbeat();
    }
  }
}

/**
 * Force an immediate heartbeat update (in addition to scheduled ones)
 * @returns {Promise<object>} - Result of heartbeat update
 */
export async function forceHeartbeat() {
  if (!currentSessionId) {
    return { success: false, error: 'No active session' };
  }

  await sendHeartbeat();
  return {
    success: consecutiveFailures === 0,
    sessionId: currentSessionId,
    lastSuccessfulHeartbeat
  };
}

/**
 * SD-LEO-INFRA-ISL-001 (US-003): Validate if a process ID is still running
 * Uses OS-level check (process.kill with signal 0)
 *
 * @param {number} pid - Process ID to validate
 * @returns {boolean} - true if process exists, false otherwise
 */
export function isProcessRunning(pid) {
  if (!pid || typeof pid !== 'number') {
    return false;
  }

  try {
    // Signal 0 checks process existence without sending a signal
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // ESRCH means process doesn't exist
    if (err.code === 'ESRCH') {
      return false;
    }
    // EPERM means process exists but we don't have permission
    if (err.code === 'EPERM') {
      return true;
    }
    // Other errors - assume process doesn't exist
    return false;
  }
}

/**
 * SD-LEO-INFRA-ISL-001 (US-003): Validate PID and report failure if not running
 * Used by cleanup workers to detect orphaned sessions
 *
 * @param {string} sessionId - Session ID to validate
 * @param {number} pid - Process ID to check
 * @param {string} machineId - Machine ID for cross-machine safety
 * @param {object} supabase - Supabase client
 * @returns {Promise<{valid: boolean, reported?: boolean}>}
 */
export async function validateAndReportPid(sessionId, pid, machineId, supabase) {
  const isRunning = isProcessRunning(pid);

  if (isRunning) {
    return { valid: true };
  }

  // Report PID validation failure to database
  try {
    const { data, error } = await supabase.rpc('report_pid_validation_failure', {
      p_session_id: sessionId,
      p_machine_id: machineId
    });

    if (error) {
      console.warn(`[Heartbeat] Failed to report PID validation failure: ${error.message}`);
      return { valid: false, reported: false, error: error.message };
    }

    console.log(`[Heartbeat] Reported PID validation failure for session ${sessionId}`);
    return { valid: false, reported: true, result: data };
  } catch (err) {
    return { valid: false, reported: false, error: err.message };
  }
}

/**
 * SD-LEO-FIX-SESSION-LIFECYCLE-HYGIENE-001 (FR1): Heartbeat-on-DB-write wrapper.
 *
 * Returns a proxy around the given supabase client that auto-refreshes
 * `claude_sessions.heartbeat_at` for `sessionId` after any write to the
 * high-traffic tables observed to cause claim-loss during long gate
 * evaluation runs:
 *
 *   strategic_directives_v2
 *   product_requirements_v2
 *   sub_agent_execution_results
 *   sd_phase_handoffs
 *
 * Rationale: the dominant claim-loss vector observed on 2026-04-24 was a
 * multi-minute gate-prep run (validation-agent + Explore + SD field
 * updates) during which `session-tick`'s 30-second interval worked
 * correctly — but only as a best-effort backup. Any DB-write-heavy workload
 * that crosses the 15-minute TTL without a tick can still trigger
 * stale-sweep auto-release. Wrapping the client makes the heartbeat
 * refresh opportunistic at the *work* frequency, not the *tick* frequency,
 * closing the race end-to-end.
 *
 * The wrapper is fail-soft: heartbeat ping errors are logged and swallowed
 * so they never break the caller's DB write.
 *
 * Usage:
 *   import { withHeartbeat } from '../lib/heartbeat-manager.mjs';
 *   const db = withHeartbeat(supabase, sessionId);
 *   await db.from('sd_phase_handoffs').insert({ ... });
 *   // heartbeat_at automatically pinged after the insert resolves
 *
 * @param {object} supabaseClient - a PostgREST client (from @supabase/supabase-js)
 * @param {string} sessionId - owning session id for heartbeat pings
 * @param {object} [options]
 * @param {Set<string>|string[]} [options.tables] - override default set of
 *   tables that trigger pings. Default: the 4 high-traffic tables above.
 * @param {Function} [options.heartbeatFn] - override the heartbeat function
 *   (for testing). Default: `updateHeartbeat` from session-manager.mjs.
 * @returns {object} wrapped client — `.from()` calls are intercepted; all
 *   other client methods pass through.
 */
export function withHeartbeat(supabaseClient, sessionId, options = {}) {
  if (!supabaseClient || typeof supabaseClient.from !== 'function') {
    throw new Error('withHeartbeat: supabaseClient must be a PostgREST client');
  }
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('withHeartbeat: sessionId must be a non-empty string');
  }

  const defaultTables = new Set([
    'strategic_directives_v2',
    'product_requirements_v2',
    'sub_agent_execution_results',
    'sd_phase_handoffs',
  ]);
  const triggerTables = options.tables instanceof Set
    ? options.tables
    : new Set(options.tables || defaultTables);
  const heartbeatFn = options.heartbeatFn || dbUpdateHeartbeat;

  /**
   * Fire-and-forget heartbeat ping. Never throws; failures logged to stderr.
   * Returns a resolved Promise so await-ers aren't blocked.
   */
  const pingHeartbeat = () => {
    Promise.resolve()
      .then(() => heartbeatFn(sessionId))
      .catch((err) => {
        console.warn(`[withHeartbeat] Ping failed for session ${sessionId}: ${err?.message ?? err}`);
      });
  };

  // Wrap .from(table) to intercept terminal write methods.
  const wrappedFrom = (table) => {
    const builder = supabaseClient.from(table);
    if (!triggerTables.has(table)) {
      return builder;
    }
    return wrapQueryBuilder(builder, pingHeartbeat);
  };

  // Return a lightweight proxy that preserves all other client behavior.
  return new Proxy(supabaseClient, {
    get(target, prop, receiver) {
      if (prop === 'from') return wrappedFrom;
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

/**
 * Internal: wrap a PostgREST query builder so that after any terminal
 * write method (insert/update/upsert/delete) resolves, we trigger a
 * heartbeat ping. Non-write methods (select) pass through.
 *
 * PostgREST builders are thenables; we defer the ping via Promise chaining
 * on the underlying builder so we don't re-run the query or race the
 * caller's own `.then()` / `await`.
 */
function wrapQueryBuilder(builder, pingHeartbeat) {
  const WRITE_METHODS = new Set(['insert', 'update', 'upsert', 'delete']);

  // Heuristic: treat any object exposing a write method OR a `.then`
  // (PostgREST builders are thenables once a terminal is attached) as a
  // builder that should keep the wrapper. This preserves chained calls
  // like `.eq('id', x).update({...})` where `.eq()` returns a child
  // builder that still has write methods on it.
  const isBuilderLike = (v) =>
    v && typeof v === 'object' && (
      typeof v.then === 'function' ||
      typeof v.insert === 'function' ||
      typeof v.update === 'function' ||
      typeof v.upsert === 'function' ||
      typeof v.delete === 'function' ||
      typeof v.eq === 'function'
    );

  return new Proxy(builder, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);

      if (typeof value !== 'function') return value;

      // For write methods, wrap the returned builder so `.then/.await`
      // triggers the ping AFTER the write resolves.
      if (WRITE_METHODS.has(prop)) {
        return function (...args) {
          const next = value.apply(target, args);
          return wrapThenable(next, pingHeartbeat);
        };
      }

      // Other methods return child builders; wrap them recursively so
      // chained `.eq().update()` patterns still trigger pings. Builders
      // expose write methods; thenables expose `.then`. Anything matching
      // `isBuilderLike` gets a fresh wrapper that preserves the ping wiring.
      return function (...args) {
        const next = value.apply(target, args);
        if (isBuilderLike(next)) {
          return wrapQueryBuilder(next, pingHeartbeat);
        }
        return next;
      };
    },
  });
}

/**
 * Internal: wrap a thenable so `.then(onFulfilled)` fires a heartbeat ping
 * after the underlying promise resolves — regardless of whether the
 * caller awaits it. The ping is fire-and-forget; the caller's await
 * semantics are preserved.
 */
function wrapThenable(thenable, pingHeartbeat) {
  if (!thenable || typeof thenable.then !== 'function') {
    // Not a thenable (shouldn't happen for PostgREST writes) — ping now.
    pingHeartbeat();
    return thenable;
  }

  return {
    ...thenable,
    then(onFulfilled, onRejected) {
      return thenable.then(
        (result) => {
          pingHeartbeat();
          return onFulfilled ? onFulfilled(result) : result;
        },
        (err) => {
          // Ping even on failure — the write attempt itself counts as
          // session liveness evidence.
          pingHeartbeat();
          return onRejected ? onRejected(err) : Promise.reject(err);
        }
      );
    },
    catch(onRejected) {
      return this.then(undefined, onRejected);
    },
    finally(onFinally) {
      return this.then(
        (v) => { onFinally?.(); return v; },
        (e) => { onFinally?.(); throw e; }
      );
    },
  };
}

// Export default object
export default {
  startHeartbeat,
  stopHeartbeat,
  isHeartbeatActive,
  getHeartbeatStats,
  forceHeartbeat,
  isProcessRunning,
  validateAndReportPid,
  withHeartbeat
};
