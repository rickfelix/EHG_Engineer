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
export function analyzeClaimRelationship({ claimingSessionId: _claimingSessionId, claimingSession, currentSession }) {
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
 * Check whether the SD itself shows evidence of recent active work,
 * independent of session heartbeat status. Prevents treating an SD as
 * orphaned when a session compacted, restarted, or is mid-long-execution.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - The SD UUID (id column)
 * @param {Object} sd - SD row with current_phase, progress_percentage, updated_at
 * @param {number} [recencyMinutes=30] - How recent updated_at must be to count as active
 * @returns {Promise<{ hasEvidence: boolean, reasons: string[] }>}
 */
export async function hasActiveWorkEvidence(supabase, sdId, sd, recencyMinutes = 30) {
  const reasons = [];

  // 1. SD in EXEC with non-zero progress — real implementation work happened
  if (sd.current_phase === 'EXEC' && (sd.progress_percentage || 0) > 0) {
    reasons.push(`EXEC phase at ${sd.progress_percentage}% progress`);
  }

  // 2. SD updated_at is recent — someone touched this SD recently
  if (sd.updated_at) {
    const updatedAt = new Date(sd.updated_at);
    const ageMinutes = (Date.now() - updatedAt.getTime()) / 60000;
    if (ageMinutes < recencyMinutes) {
      reasons.push(`updated ${Math.round(ageMinutes)}m ago`);
    }
  }

  // 3. Recent phase handoff records — confirms pipeline activity
  const { data: handoffs } = await supabase
    .from('sd_phase_handoffs')
    .select('from_phase, to_phase, created_at')
    .eq('sd_id', sdId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (handoffs && handoffs.length > 0) {
    const handoffAge = (Date.now() - new Date(handoffs[0].created_at).getTime()) / 60000;
    if (handoffAge < recencyMinutes) {
      reasons.push(`handoff ${handoffs[0].from_phase}→${handoffs[0].to_phase} ${Math.round(handoffAge)}m ago`);
    }
  }

  return { hasEvidence: reasons.length > 0, reasons };
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
