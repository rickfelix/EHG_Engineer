/**
 * Claim Analysis for SD-Next Display
 *
 * Thin display-oriented wrapper that imports existing claim/session functions
 * to classify claim relationships for richer sd:next output.
 *
 * Does NOT duplicate logic from claim-guard.mjs — imports and reuses it.
 */

import os from 'os';
import { isSameConversation } from '../../../lib/claim-guard.mjs';
import { isProcessRunning } from '../../../lib/heartbeat-manager.mjs';
import { getStaleThresholdSeconds } from '../../../lib/claim/stale-threshold.js';

/**
 * Analyze the relationship between the current session and a claiming session.
 *
 * @param {Object} params
 * @param {string} params.claimingSessionId - Session ID that holds the claim
 * @param {Object} params.claimingSession - Full session row from activeSessions (heartbeat_age_seconds, terminal_id, pid, hostname, etc.)
 * @param {Object} params.currentSession - Current session object (session_id, terminal_id)
 * @returns {{ relationship: string, canAutoRelease: boolean, displayLabel: string, pid: number|null }}
 *
 * Relationships:
 *   same_conversation - Post-compaction same conversation (terminal_id match)
 *   other_active      - Different session, heartbeat fresh
 *   stale_dead        - Stale heartbeat + same host + PID dead (safe to auto-release)
 *   stale_alive       - Stale heartbeat + same host + PID alive (risky)
 *   stale_remote      - Stale heartbeat + different host (can't check PID)
 */
export function analyzeClaimRelationship({ claimingSessionId, claimingSession, currentSession }) {
  const staleThreshold = getStaleThresholdSeconds();
  const heartbeatAge = Math.round(claimingSession?.heartbeat_age_seconds || 0);
  const claimPid = claimingSession?.pid ? parseInt(claimingSession.pid, 10) : null;
  const claimHostname = claimingSession?.hostname || null;
  const localHostname = os.hostname();
  const sameHost = claimHostname === localHostname;

  const myTerminalId = currentSession?.terminal_id || null;
  const claimTerminalId = claimingSession?.terminal_id || null;

  // Check same-conversation first (post-compaction recovery)
  if (myTerminalId && claimTerminalId) {
    const sameConv = isSameConversation(myTerminalId, claimTerminalId);
    if (sameConv === true) {
      return {
        relationship: 'same_conversation',
        canAutoRelease: false,
        displayLabel: 'YOURS (recovered)',
        pid: claimPid
      };
    }
    // 'ambiguous' with dead PID also counts as same_conversation for display
    if (sameConv === 'ambiguous' && sameHost && claimPid && !isProcessRunning(claimPid)) {
      return {
        relationship: 'same_conversation',
        canAutoRelease: false,
        displayLabel: 'YOURS (recovered)',
        pid: claimPid
      };
    }
  }

  // Fresh heartbeat → active different session
  if (heartbeatAge < staleThreshold) {
    return {
      relationship: 'other_active',
      canAutoRelease: false,
      displayLabel: 'CLAIMED',
      pid: claimPid
    };
  }

  // Stale heartbeat — classify by PID liveness
  if (sameHost && claimPid) {
    if (isProcessRunning(claimPid)) {
      return {
        relationship: 'stale_alive',
        canAutoRelease: false,
        displayLabel: 'STALE (busy)',
        pid: claimPid
      };
    }
    return {
      relationship: 'stale_dead',
      canAutoRelease: true,
      displayLabel: 'STALE (dead)',
      pid: claimPid
    };
  }

  // Different host or no PID — can't verify liveness
  return {
    relationship: 'stale_remote',
    canAutoRelease: false,
    displayLabel: 'STALE',
    pid: claimPid
  };
}

/**
 * Auto-release a stale dead claim. Only call when relationship is 'stale_dead'
 * (triple-confirmed: heartbeat stale + same host + PID dead).
 *
 * Uses release_sd RPC with direct-update fallback (same pattern as claim-guard.mjs).
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sessionId - The claiming session to release
 * @returns {Promise<boolean>} true if released successfully
 */
export async function autoReleaseStaleDeadClaim(supabase, sessionId) {
  const { error: rpcError } = await supabase.rpc('release_sd', {
    p_session_id: sessionId,
    p_reason: 'auto_release_dead_pid'
  });

  if (!rpcError) return true;

  // Fallback: direct update
  const { error: directErr } = await supabase
    .from('claude_sessions')
    .update({
      sd_id: null,
      released_at: new Date().toISOString(),
      released_reason: 'auto_release_dead_pid',
      status: 'idle'
    })
    .eq('session_id', sessionId);

  return !directErr;
}
