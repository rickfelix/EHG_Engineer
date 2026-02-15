-- Migration: SD-LEO-FIX-CLAIM-DUAL-TRUTH-001 (US-003)
-- Purpose: Fix claim_sd() RPC ON CONFLICT clause to reference sd_claims_active_unique
--          partial index instead of the dropped sd_claims_sd_session_unique constraint.
-- Date: 2026-02-15
-- Backward Compatible: Yes (function signature unchanged)

CREATE OR REPLACE FUNCTION claim_sd(
  p_sd_id TEXT,
  p_session_id TEXT,
  p_track TEXT
) RETURNS JSONB AS $$
DECLARE
  v_existing_claim RECORD;
  v_conflict RECORD;
  v_result JSONB;
BEGIN
  -- Check if SD is already claimed by another active session
  -- SD-LEO-FIX-CLAIM-DUAL-TRUTH-001: Query sd_claims directly (authoritative source)
  -- instead of joining claude_sessions + v_active_sessions.
  SELECT sc.session_id, sc.sd_id
  INTO v_existing_claim
  FROM sd_claims sc
  JOIN claude_sessions cs ON sc.session_id = cs.session_id
  WHERE sc.sd_id = p_sd_id
    AND sc.released_at IS NULL
    AND sc.session_id != p_session_id
    AND cs.status IN ('active', 'idle')
    AND EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)) < 900
  LIMIT 1
  FOR UPDATE OF sc SKIP LOCKED;

  IF v_existing_claim IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'already_claimed',
      'message', format('SD %s is already claimed by session %s', p_sd_id, v_existing_claim.session_id),
      'claimed_by', v_existing_claim.session_id
    );
  END IF;

  -- Check for blocking conflicts with active SDs
  SELECT cm.*, sc.sd_id as active_sd, sc.session_id as active_session
  INTO v_conflict
  FROM sd_conflict_matrix cm
  JOIN sd_claims sc ON (
    (cm.sd_id_a = p_sd_id AND cm.sd_id_b = sc.sd_id) OR
    (cm.sd_id_b = p_sd_id AND cm.sd_id_a = sc.sd_id)
  )
  JOIN claude_sessions cs ON sc.session_id = cs.session_id
  WHERE cm.conflict_severity = 'blocking'
    AND cm.resolved_at IS NULL
    AND sc.released_at IS NULL
    AND cs.status IN ('active', 'idle')
    AND EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)) < 900
    AND sc.session_id != p_session_id
  LIMIT 1;

  IF v_conflict IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'blocking_conflict',
      'message', format('SD %s has blocking conflict with active SD %s', p_sd_id, v_conflict.active_sd),
      'conflict_type', v_conflict.conflict_type,
      'conflicting_sd', v_conflict.active_sd,
      'conflicting_session', v_conflict.active_session
    );
  END IF;

  -- Release any existing active claim for this session (switching SDs)
  UPDATE sd_claims
  SET released_at = NOW(), release_reason = 'claim_switch'
  WHERE session_id = p_session_id
    AND released_at IS NULL
    AND sd_id != p_sd_id;

  -- Record the claim in sd_claims table
  -- SD-LEO-FIX-CLAIM-DUAL-TRUTH-001 (US-003): Use partial unique index
  -- sd_claims_active_unique ON (sd_id) WHERE released_at IS NULL
  -- instead of the dropped sd_claims_sd_session_unique constraint.
  INSERT INTO sd_claims (sd_id, session_id, track, claimed_at)
  VALUES (p_sd_id, p_session_id, p_track, NOW())
  ON CONFLICT (sd_id) WHERE released_at IS NULL
  DO UPDATE SET session_id = p_session_id, track = p_track, claimed_at = NOW();

  -- Update session with SD (denormalized cache for backward compatibility)
  UPDATE claude_sessions
  SET sd_id = p_sd_id,
      track = p_track,
      heartbeat_at = NOW()
  WHERE session_id = p_session_id;

  -- Set claiming_session_id + is_working_on on the SD
  UPDATE strategic_directives_v2
  SET claiming_session_id = p_session_id,
      active_session_id = p_session_id,
      is_working_on = true
  WHERE sd_key = p_sd_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', format('SD %s claimed successfully', p_sd_id),
    'sd_id', p_sd_id,
    'session_id', p_session_id,
    'track', p_track
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
