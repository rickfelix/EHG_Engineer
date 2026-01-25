-- ============================================================================
-- FIX: Update claim_sd, release_sd functions and views to use sd_key instead of legacy_id
-- Date: 2026-01-25
-- Issue: PAT-LEGACYID-001 - legacy_id column was removed but functions still reference it
-- ============================================================================

-- Step 1: Update v_active_sessions view to use sd_key
DROP VIEW IF EXISTS v_active_sessions CASCADE;

CREATE OR REPLACE VIEW v_active_sessions AS
SELECT
  cs.session_id,
  cs.status,
  cs.heartbeat_at,
  cs.sd_id,
  sd.title as sd_title,
  sd.status as sd_status,
  cs.track,
  cs.metadata,
  cs.created_at,
  EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)) / 60 as heartbeat_age_minutes,
  CASE
    WHEN cs.status = 'active' AND cs.heartbeat_at > NOW() - INTERVAL '5 minutes' THEN 'active'
    WHEN cs.status = 'active' AND cs.heartbeat_at > NOW() - INTERVAL '15 minutes' THEN 'idle'
    ELSE 'stale'
  END as computed_status
FROM claude_sessions cs
LEFT JOIN strategic_directives_v2 sd ON cs.sd_id = sd.sd_key;  -- Changed from legacy_id to sd_key

-- Step 2: Update v_sd_session_allocation view to use sd_key
DROP VIEW IF EXISTS v_sd_session_allocation CASCADE;

CREATE OR REPLACE VIEW v_sd_session_allocation AS
SELECT
  bi.sd_id,
  bi.track,
  bi.sequence_rank,
  sd.title,
  sd.status as sd_status,
  sd.is_working_on,
  vas.session_id,
  vas.computed_status as session_status,
  vas.heartbeat_age_minutes
FROM sd_baseline_items bi
JOIN strategic_directives_v2 sd ON bi.sd_id = sd.sd_key  -- Changed from legacy_id to sd_key
LEFT JOIN v_active_sessions vas ON bi.sd_id = vas.sd_id
WHERE bi.baseline_id = (
  SELECT id FROM sd_baselines WHERE is_active = true LIMIT 1
);

-- Step 3: Update claim_sd function to use sd_key
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
  SELECT cs.session_id, cs.sd_id, vas.computed_status
  INTO v_existing_claim
  FROM claude_sessions cs
  JOIN v_active_sessions vas ON cs.session_id = vas.session_id
  WHERE cs.sd_id = p_sd_id
    AND vas.computed_status = 'active'
    AND cs.session_id != p_session_id
  LIMIT 1;

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

  -- Set is_working_on on the SD (using sd_key instead of legacy_id)
  UPDATE strategic_directives_v2
  SET active_session_id = p_session_id,
      is_working_on = true
  WHERE sd_key = p_sd_id;  -- Changed from legacy_id to sd_key

  RETURN jsonb_build_object(
    'success', true,
    'message', format('SD %s claimed successfully', p_sd_id),
    'sd_id', p_sd_id,
    'session_id', p_session_id,
    'track', p_track
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 4: Update release_sd function to use sd_key
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
      'message', 'No SD was claimed by this session'
    );
  END IF;

  -- Clear session's SD claim
  UPDATE claude_sessions
  SET sd_id = NULL,
      track = NULL
  WHERE session_id = p_session_id;

  -- Clear is_working_on on the SD (using sd_key instead of legacy_id)
  UPDATE strategic_directives_v2
  SET active_session_id = NULL,
      is_working_on = false
  WHERE sd_key = v_sd_id;  -- Changed from legacy_id to sd_key

  -- Mark claim as released
  UPDATE sd_claims
  SET released_at = NOW()
  WHERE sd_id = v_sd_id
    AND session_id = p_session_id
    AND released_at IS NULL;

  RETURN jsonb_build_object(
    'success', true,
    'message', format('SD %s released', v_sd_id),
    'sd_id', v_sd_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 5: Add comments
COMMENT ON VIEW v_active_sessions IS 'Active Claude sessions with computed status and SD info. Updated 2026-01-25 to use sd_key instead of legacy_id.';
COMMENT ON VIEW v_sd_session_allocation IS 'SD session allocation with track info. Updated 2026-01-25 to use sd_key instead of legacy_id.';
COMMENT ON FUNCTION claim_sd IS 'Atomically claim an SD for a session. Updated 2026-01-25 to use sd_key instead of legacy_id.';
COMMENT ON FUNCTION release_sd IS 'Release an SD claim for a session. Updated 2026-01-25 to use sd_key instead of legacy_id.';

-- Verification query
SELECT 'Migration complete. Functions and views updated to use sd_key instead of legacy_id.' as status;
