-- Migration: SD-LEO-INFRA-CLAIM-GUARD-001 - Claim Guard Hard Enforcement
-- Purpose: Add claiming_session_id column and FOR UPDATE to claim_sd function
-- Date: 2026-02-13
-- Backward Compatible: Yes (is_working_on kept as derived alias)

-- ============================================================
-- Step 1: Add claiming_session_id column to strategic_directives_v2
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'strategic_directives_v2'
    AND column_name = 'claiming_session_id'
  ) THEN
    ALTER TABLE strategic_directives_v2
    ADD COLUMN claiming_session_id TEXT DEFAULT NULL;

    COMMENT ON COLUMN strategic_directives_v2.claiming_session_id IS
      'Session ID of the Claude instance that owns this SD. Set by claimGuard, cleared by release_sd. Replaces is_working_on boolean.';
  END IF;
END $$;

-- ============================================================
-- Step 2: Update claim_sd function with FOR UPDATE and claiming_session_id
-- ============================================================
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
  -- FOR UPDATE SKIP LOCKED prevents TOCTOU race condition (FR-7)
  SELECT cs.session_id, cs.sd_id, vas.computed_status
  INTO v_existing_claim
  FROM claude_sessions cs
  JOIN v_active_sessions vas ON cs.session_id = vas.session_id
  WHERE cs.sd_id = p_sd_id
    AND vas.computed_status = 'active'
    AND cs.session_id != p_session_id
  LIMIT 1
  FOR UPDATE OF cs SKIP LOCKED;

  IF v_existing_claim IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'already_claimed',
      'message', format('SD %s is already claimed by session %s', p_sd_id, v_existing_claim.session_id),
      'claimed_by', v_existing_claim.session_id
    );
  END IF;

  -- Check for blocking conflicts with active SDs
  SELECT cm.*, vas.sd_id as active_sd, vas.session_id as active_session
  INTO v_conflict
  FROM sd_conflict_matrix cm
  JOIN v_active_sessions vas ON (
    (cm.sd_id_a = p_sd_id AND cm.sd_id_b = vas.sd_id) OR
    (cm.sd_id_b = p_sd_id AND cm.sd_id_a = vas.sd_id)
  )
  WHERE cm.conflict_severity = 'blocking'
    AND cm.resolved_at IS NULL
    AND vas.computed_status = 'active'
    AND vas.session_id != p_session_id
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

  -- Record the claim in sd_claims table
  INSERT INTO sd_claims (sd_id, session_id, track, claimed_at)
  VALUES (p_sd_id, p_session_id, p_track, NOW())
  ON CONFLICT (sd_id, session_id)
  DO UPDATE SET claimed_at = NOW(), track = p_track;

  -- Update session with SD
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

-- ============================================================
-- Step 3: Update release_sd to clear claiming_session_id
-- ============================================================
CREATE OR REPLACE FUNCTION release_sd(
  p_session_id TEXT
) RETURNS JSONB AS $$
DECLARE
  v_sd_id TEXT;
BEGIN
  -- Get the SD being released
  SELECT sd_id INTO v_sd_id
  FROM claude_sessions
  WHERE session_id = p_session_id;

  IF v_sd_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'No SD to release'
    );
  END IF;

  -- Clear session SD claim
  UPDATE claude_sessions
  SET sd_id = NULL,
      track = NULL
  WHERE session_id = p_session_id;

  -- Remove from sd_claims
  DELETE FROM sd_claims
  WHERE session_id = p_session_id;

  -- Clear claiming_session_id + is_working_on on the SD
  UPDATE strategic_directives_v2
  SET claiming_session_id = NULL,
      active_session_id = NULL,
      is_working_on = false
  WHERE sd_key = v_sd_id
    AND claiming_session_id = p_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', format('SD %s released', v_sd_id),
    'sd_id', v_sd_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Step 4: Backfill claiming_session_id from existing active claims
-- ============================================================
UPDATE strategic_directives_v2 sd
SET claiming_session_id = cs.session_id
FROM claude_sessions cs
JOIN v_active_sessions vas ON cs.session_id = vas.session_id
WHERE cs.sd_id = sd.sd_key
  AND vas.computed_status = 'active'
  AND sd.claiming_session_id IS NULL
  AND sd.is_working_on = true;
