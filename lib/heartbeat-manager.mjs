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

import { updateHeartbeat as dbUpdateHeartbeat } from './session-manager.mjs';

// Configuration
const HEARTBEAT_INTERVAL_MS = 30000; // 30 seconds (safety margin under 60s requirement)
const MAX_CONSECUTIVE_FAILURES = 3;

// Module state
let heartbeatInterval = null;
let currentSessionId = null;
let consecutiveFailures = 0;
let lastSuccessfulHeartbeat = null;

/**
 * Start automatic heartbeat updates for a session
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

  // Send initial heartbeat
  sendHeartbeat();

  // Start interval
  heartbeatInterval = setInterval(() => {
    sendHeartbeat();
  }, HEARTBEAT_INTERVAL_MS);

  // Ensure cleanup on process exit
  process.on('beforeExit', stopHeartbeat);
  process.on('SIGINT', () => {
    stopHeartbeat();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    stopHeartbeat();
    process.exit(0);
  });

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

// Export default object
export default {
  startHeartbeat,
  stopHeartbeat,
  isHeartbeatActive,
  getHeartbeatStats,
  forceHeartbeat
};
