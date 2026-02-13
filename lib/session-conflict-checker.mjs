#!/usr/bin/env node
/**
 * Session Conflict Checker for Multi-Instance Claude Code Coordination
 *
 * Purpose: Validate SD claims against conflict matrix and active sessions
 * Used by: claude-session-coordinator.mjs, sd-next.js
 *
 * Key Functions:
 * - checkConflicts(sdId) - Query conflict matrix for an SD
 * - canClaimSd(sdId, sessionId) - Full pre-claim validation
 * - getConflictingActiveSDs(sdId) - Find active SDs that conflict
 */

import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment from EHG_Engineer (Windows-compatible)
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * Check if an SD is already claimed by another session
 * Enhanced for SD-LEO-INFRA-MULTI-SESSION-COORDINATION-001 (FR-2)
 *
 * Returns detailed owner information including:
 * - session_id
 * - hostname
 * - tty
 * - heartbeat_age_human (e.g., "2m ago")
 * - heartbeat_age_seconds
 */
export async function isSDClaimed(sdId, excludeSessionId = null) {
  const { data, error } = await supabase
    .from('v_active_sessions')
    .select('session_id, sd_id, sd_title, track, heartbeat_age_minutes, heartbeat_age_seconds, heartbeat_age_human, hostname, tty, codebase')
    .eq('sd_id', sdId)
    .eq('computed_status', 'active');

  if (error) {
    console.error('Error checking SD claim:', error.message);
    return { claimed: null, queryFailed: true, error: error.message };
  }

  const claims = data?.filter(c => c.session_id !== excludeSessionId) || [];

  if (claims.length > 0) {
    const claim = claims[0];
    return {
      claimed: true,
      claimedBy: claim.session_id,
      track: claim.track,
      activeMinutes: Math.round(claim.heartbeat_age_minutes || 0),
      // Enhanced fields for FR-2
      heartbeatAgeSeconds: Math.round(claim.heartbeat_age_seconds || 0),
      heartbeatAgeHuman: claim.heartbeat_age_human || formatHeartbeatAge(claim.heartbeat_age_seconds),
      hostname: claim.hostname || 'unknown',
      tty: claim.tty || 'unknown',
      codebase: claim.codebase || 'unknown'
    };
  }

  return { claimed: false };
}

/**
 * Format heartbeat age in human-readable form (fallback if view column unavailable)
 */
function formatHeartbeatAge(seconds) {
  if (!seconds || seconds < 0) return 'just now';
  if (seconds < 60) return `${Math.round(seconds)}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  return `${Math.round(seconds / 3600)}h ago`;
}

/**
 * Get conflicts from sd_conflict_matrix for a given SD
 */
export async function getSDConflicts(sdId) {
  const { data, error } = await supabase
    .from('sd_conflict_matrix')
    .select('*')
    .or(`sd_id_a.eq.${sdId},sd_id_b.eq.${sdId}`)
    .is('resolved_at', null);

  if (error) {
    console.error('Error fetching conflicts:', error.message);
    return [];
  }

  return (data || []).map(c => ({
    conflictId: c.id,
    otherSdId: c.sd_id_a === sdId ? c.sd_id_b : c.sd_id_a,
    conflictType: c.conflict_type,
    severity: c.conflict_severity,
    affectedAreas: c.affected_areas
  }));
}

/**
 * Get all currently claimed SDs
 */
export async function getClaimedSDs() {
  const { data, error } = await supabase
    .from('v_active_sessions')
    .select('session_id, sd_id, track')
    .eq('computed_status', 'active')
    .not('sd_id', 'is', null);

  if (error) {
    console.error('Error fetching claimed SDs:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Find active SDs that conflict with a given SD
 */
export async function getConflictingActiveSDs(sdId, excludeSessionId = null) {
  const conflicts = await getSDConflicts(sdId);

  if (conflicts.length === 0) {
    return [];
  }

  const claimedSDs = await getClaimedSDs();
  const claimedSDIds = new Set(
    claimedSDs
      .filter(c => c.session_id !== excludeSessionId)
      .map(c => c.sd_id)
  );

  const activeConflicts = conflicts.filter(c => claimedSDIds.has(c.otherSdId));

  // Enrich with session info
  return activeConflicts.map(c => {
    const claimInfo = claimedSDs.find(s => s.sd_id === c.otherSdId);
    return {
      ...c,
      claimedBySession: claimInfo?.session_id,
      claimedByTrack: claimInfo?.track
    };
  });
}

/**
 * Check if a track is currently occupied by another session
 */
export async function isTrackOccupied(track, excludeSessionId = null) {
  const { data, error } = await supabase
    .from('v_active_sessions')
    .select('session_id, sd_id, track')
    .eq('track', track)
    .eq('computed_status', 'active')
    .not('sd_id', 'is', null);

  if (error) {
    console.error('Error checking track occupancy:', error.message);
    return { occupied: null, queryFailed: true, error: error.message };
  }

  const occupiers = data?.filter(c => c.session_id !== excludeSessionId) || [];

  if (occupiers.length > 0) {
    return {
      occupied: true,
      occupiedBy: occupiers[0].session_id,
      currentSD: occupiers[0].sd_id
    };
  }

  return { occupied: false };
}

/**
 * Full pre-claim validation for an SD
 *
 * Returns:
 * - canClaim: boolean
 * - blockingReasons: array of blocking issues
 * - warnings: array of non-blocking issues
 * - info: array of informational notes
 */
export async function canClaimSd(sdId, sessionId) {
  const result = {
    canClaim: true,
    blockingReasons: [],
    warnings: [],
    info: []
  };

  // 1. Check if SD is already claimed
  const claimStatus = await isSDClaimed(sdId, sessionId);
  if (claimStatus.queryFailed) {
    result.canClaim = false;
    result.blockingReasons.push({
      type: 'query_failed',
      message: `Could not verify claim status: ${claimStatus.error}. Database view may be out of sync.`
    });
    return result;
  }
  if (claimStatus.claimed) {
    result.canClaim = false;
    result.blockingReasons.push({
      type: 'already_claimed',
      message: `SD is already claimed by session ${claimStatus.claimedBy}`,
      session: claimStatus.claimedBy,
      activeMinutes: claimStatus.activeMinutes
    });
    return result;
  }

  // 2. Check for blocking conflicts with active SDs
  const activeConflicts = await getConflictingActiveSDs(sdId, sessionId);

  for (const conflict of activeConflicts) {
    if (conflict.severity === 'blocking') {
      result.canClaim = false;
      result.blockingReasons.push({
        type: 'conflict',
        conflictType: conflict.conflictType,
        message: `Blocking conflict with active SD ${conflict.otherSdId}`,
        conflictingSD: conflict.otherSdId,
        conflictingSession: conflict.claimedBySession,
        affectedAreas: conflict.affectedAreas
      });
    } else if (conflict.severity === 'warning') {
      result.warnings.push({
        type: 'conflict',
        conflictType: conflict.conflictType,
        message: `Warning: potential conflict with active SD ${conflict.otherSdId}`,
        conflictingSD: conflict.otherSdId,
        conflictingSession: conflict.claimedBySession
      });
    } else {
      result.info.push({
        type: 'conflict',
        conflictType: conflict.conflictType,
        message: `Info: ${conflict.conflictType} overlap with ${conflict.otherSdId}`,
        conflictingSD: conflict.otherSdId
      });
    }
  }

  // 3. Get SD track and check if track is occupied (warning only)
  const { data: sdData } = await supabase
    .from('sd_baseline_items')
    .select('track')
    .eq('sd_id', sdId)
    .single();

  if (sdData?.track) {
    const trackStatus = await isTrackOccupied(sdData.track, sessionId);
    if (trackStatus.occupied) {
      result.warnings.push({
        type: 'track_occupied',
        message: `Track ${sdData.track} already has an active session (${trackStatus.occupiedBy})`,
        track: sdData.track,
        occupiedBy: trackStatus.occupiedBy,
        currentSD: trackStatus.currentSD
      });
    }
  }

  return result;
}

/**
 * Claim an SD using the database function (atomic operation)
 */
export async function claimSD(sdId, sessionId) {
  // First validate
  const validation = await canClaimSd(sdId, sessionId);

  if (!validation.canClaim) {
    return {
      success: false,
      error: 'validation_failed',
      blockingReasons: validation.blockingReasons
    };
  }

  // Get track for the SD
  const { data: sdData } = await supabase
    .from('sd_baseline_items')
    .select('track')
    .eq('sd_id', sdId)
    .single();

  const track = sdData?.track || 'STANDALONE';

  // Call database function
  const { data, error } = await supabase.rpc('claim_sd', {
    p_sd_id: sdId,
    p_session_id: sessionId,
    p_track: track
  });

  if (error) {
    return {
      success: false,
      error: error.message
    };
  }

  return {
    ...data,
    warnings: validation.warnings,
    info: validation.info
  };
}

// Export for use as module
export default {
  isSDClaimed,
  getSDConflicts,
  getClaimedSDs,
  getConflictingActiveSDs,
  isTrackOccupied,
  canClaimSd,
  claimSD
};
