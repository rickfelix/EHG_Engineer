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

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { updateHeartbeat as dbUpdateHeartbeat, endSession } from './session-manager.mjs';
import { selfHeal } from '../scripts/modules/claim-health/self-heal.js';

const __hb_filename = fileURLToPath(import.meta.url);
const __hb_dirname = path.dirname(__hb_filename);
dotenv.config({ path: path.resolve(__hb_dirname, '../.env') });

const hbSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

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
 *
 * @param {string} sessionId - Session ID to send heartbeats for
 * @returns {object} - Result with success status
 */
export function startHeartbeat(sessionId) {
  if (heartbeatInterval) {
    // Already running - check if same session
    if (currentSessionId === sessionId) {
      return { success: true, message: 'Heartbeat already active for this session' };
    }
    // Different session - stop old one first
    stopHeartbeat();
  }

  currentSessionId = sessionId;
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
    const gracefulExitHandler = async (signal) => {
      console.log(`[Heartbeat] Received ${signal}, releasing session...`);
      stopHeartbeat();
      await releaseSessionWithRetry(`${signal.toLowerCase()}_exit`);
      process.exit(0);
    };

    process.on('SIGINT', () => gracefulExitHandler('SIGINT'));
    process.on('SIGTERM', () => gracefulExitHandler('SIGTERM'));

    // beforeExit is async-safe, use for final cleanup
    process.on('beforeExit', async (code) => {
      if (currentSessionId) {
        console.log(`[Heartbeat] beforeExit (code ${code}), releasing session...`);
        await releaseSessionWithRetry('process_exit');
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
    console.log(`[Heartbeat] Stopped automatic heartbeat for ${stoppedSession}`);
    return { success: true, stoppedSession };
  }
  return { success: false, message: 'No active heartbeat to stop' };
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
    await hbSupabase
      .from('claude_sessions')
      .update({ is_alive: alive, updated_at: new Date().toISOString() })
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
      // Non-blocking — fire and forget, must complete within 2s
      selfHeal(hbSupabase, currentSessionId).then(healResult => {
        if (healResult.released.length > 0) {
          console.log(`[Heartbeat] Self-heal released ${healResult.released.length} ghost claim(s): ${healResult.released.join(', ')}`);
        }
        if (healResult.errors.length > 0) {
          console.warn(`[Heartbeat] Self-heal errors: ${healResult.errors.join('; ')}`);
        }
      }).catch(() => { /* silent fail — self-heal is best-effort */ });
    } else {
      consecutiveFailures++;
      console.warn(`[Heartbeat] Update returned no success (attempt ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`);
    }
  } catch (error) {
    consecutiveFailures++;
    console.warn(`[Heartbeat] Failed to update (attempt ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}): ${error.message}`);

    // Stop heartbeat if too many consecutive failures
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      console.error(`[Heartbeat] Too many consecutive failures - stopping heartbeat`);
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

// Export default object
export default {
  startHeartbeat,
  stopHeartbeat,
  isHeartbeatActive,
  getHeartbeatStats,
  forceHeartbeat,
  isProcessRunning,
  validateAndReportPid
};
