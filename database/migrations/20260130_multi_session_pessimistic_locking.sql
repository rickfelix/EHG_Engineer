-- Multi-Session Pessimistic Locking Enhancement
-- SD-LEO-INFRA-MULTI-SESSION-COORDINATION-001
-- Purpose: Add database-level constraints for single active SD claim
-- Created: 2026-01-30

-- ============================================================================
-- FR-1: Database-Level Single Active Claim Constraint
-- Purpose: Prevent multiple sessions from claiming the same SD at database level
-- ============================================================================

-- Add partial unique index on claude_sessions to enforce single active claim per SD
-- This ensures that only ONE session can have a given sd_id when status is 'active'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_claude_sessions_unique_active_claim'
  ) THEN
    CREATE UNIQUE INDEX idx_claude_sessions_unique_active_claim
    ON claude_sessions (sd_id)
    WHERE sd_id IS NOT NULL AND status = 'active';

    RAISE NOTICE 'Created unique index idx_claude_sessions_unique_active_claim';
  ELSE
    RAISE NOTICE 'Index idx_claude_sessions_unique_active_claim already exists';
  END IF;
END $$;

-- Comment explaining the constraint
COMMENT ON INDEX idx_claude_sessions_unique_active_claim IS
  'Enforces single active claim per SD. Only one session can claim a given SD when status=active. Part of SD-LEO-INFRA-MULTI-SESSION-COORDINATION-001.';

-- ============================================================================
-- FR-3: Enhanced is_working_on Synchronization Trigger
-- Purpose: Keep strategic_directives_v2.is_working_on in sync with claims
-- ============================================================================

-- Create trigger function to sync is_working_on when session claims change
CREATE OR REPLACE FUNCTION sync_is_working_on_with_session()
RETURNS TRIGGER AS $$
BEGIN
  -- When a session claims an SD (sd_id set from NULL)
  IF TG_OP = 'UPDATE' AND OLD.sd_id IS NULL AND NEW.sd_id IS NOT NULL AND NEW.status = 'active' THEN
    UPDATE strategic_directives_v2
    SET is_working_on = true,
        active_session_id = NEW.session_id,
        updated_at = NOW()
    WHERE legacy_id = NEW.sd_id OR sd_key = NEW.sd_id;
    RETURN NEW;
  END IF;

  -- When a session releases an SD (sd_id set to NULL or status changes from active)
  IF TG_OP = 'UPDATE' AND (
    (OLD.sd_id IS NOT NULL AND NEW.sd_id IS NULL) OR
    (OLD.status = 'active' AND NEW.status != 'active' AND OLD.sd_id IS NOT NULL)
  ) THEN
    -- Only clear if this session was the active one
    UPDATE strategic_directives_v2
    SET is_working_on = false,
        active_session_id = NULL,
        updated_at = NOW()
    WHERE (legacy_id = OLD.sd_id OR sd_key = OLD.sd_id)
      AND active_session_id = OLD.session_id;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists, then create
DROP TRIGGER IF EXISTS sync_is_working_on_trigger ON claude_sessions;
CREATE TRIGGER sync_is_working_on_trigger
  AFTER UPDATE ON claude_sessions
  FOR EACH ROW
  EXECUTE FUNCTION sync_is_working_on_with_session();

COMMENT ON FUNCTION sync_is_working_on_with_session IS
  'Keeps strategic_directives_v2.is_working_on synchronized with claude_sessions claims. Part of FR-3.';

-- ============================================================================
-- FR-5: Stale Session Detection View Enhancement
-- Add computed field showing seconds until session becomes stale
-- ============================================================================

-- Enhance v_active_sessions view with stale countdown
CREATE OR REPLACE VIEW v_active_sessions AS
SELECT
  cs.id,
  cs.session_id,
  cs.sd_id,
  sd.title as sd_title,
  cs.track,
  cs.tty,
  cs.pid,
  cs.hostname,
  cs.codebase,
  cs.claimed_at,
  cs.heartbeat_at,
  cs.status,
  cs.metadata,
  cs.created_at,
  EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)) as heartbeat_age_seconds,
  EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)) / 60 as heartbeat_age_minutes,
  -- New: seconds until stale (5 min = 300 seconds threshold)
  GREATEST(0, 300 - EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at))) as seconds_until_stale,
  CASE
    WHEN cs.status = 'released' THEN 'released'
    WHEN EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)) > 300 THEN 'stale'  -- 5 minutes
    WHEN cs.sd_id IS NULL THEN 'idle'
    ELSE 'active'
  END as computed_status,
  CASE
    WHEN cs.claimed_at IS NOT NULL
    THEN EXTRACT(EPOCH FROM (NOW() - cs.claimed_at)) / 60
    ELSE NULL
  END as claim_duration_minutes,
  -- New: human-readable heartbeat age
  CASE
    WHEN EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)) < 60 THEN
      EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at))::int || 's ago'
    WHEN EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)) < 3600 THEN
      (EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)) / 60)::int || 'm ago'
    ELSE
      (EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)) / 3600)::int || 'h ago'
  END as heartbeat_age_human
FROM claude_sessions cs
LEFT JOIN strategic_directives_v2 sd ON cs.sd_id = sd.legacy_id OR cs.sd_id = sd.sd_key
WHERE cs.status NOT IN ('released')
ORDER BY cs.track NULLS LAST, cs.claimed_at DESC;

COMMENT ON VIEW v_active_sessions IS
  'Active sessions with computed staleness, human-readable heartbeat age, and stale countdown. Enhanced for SD-LEO-INFRA-MULTI-SESSION-COORDINATION-001.';

-- ============================================================================
-- Enhanced claim_sd function with better error messages
-- ============================================================================

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
  SELECT
    cs.session_id,
    cs.sd_id,
    vas.computed_status,
    vas.heartbeat_age_seconds,
    vas.heartbeat_age_human,
    vas.hostname,
    vas.tty
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
      'claimed_by', v_existing_claim.session_id,
      'heartbeat_age_seconds', v_existing_claim.heartbeat_age_seconds,
      'heartbeat_age_human', v_existing_claim.heartbeat_age_human,
      'hostname', v_existing_claim.hostname,
      'tty', v_existing_claim.tty
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
  WHERE cm.resolved_at IS NULL
    AND cm.conflict_severity = 'blocking'
    AND vas.computed_status = 'active'
    AND vas.session_id != p_session_id
  LIMIT 1;

  IF v_conflict IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'conflict',
      'message', format('SD %s has blocking conflict with active SD %s', p_sd_id, v_conflict.active_sd),
      'conflict_type', v_conflict.conflict_type,
      'conflicting_sd', v_conflict.active_sd,
      'conflicting_session', v_conflict.active_session
    );
  END IF;

  -- Release any existing claim for this session
  UPDATE sd_claims
  SET released_at = NOW(), release_reason = 'manual'
  WHERE session_id = p_session_id AND released_at IS NULL;

  -- Clear any previous active_session_id for this session
  UPDATE strategic_directives_v2
  SET active_session_id = NULL, is_working_on = false
  WHERE active_session_id = p_session_id;

  -- Create new claim
  INSERT INTO sd_claims (sd_id, session_id, track)
  VALUES (p_sd_id, p_session_id, p_track);

  -- Update session (this will trigger sync_is_working_on_trigger)
  UPDATE claude_sessions
  SET sd_id = p_sd_id,
      track = p_track,
      claimed_at = NOW(),
      heartbeat_at = NOW(),
      status = 'active'
  WHERE session_id = p_session_id;

  -- Also explicitly set is_working_on for safety (in case trigger doesn't fire)
  UPDATE strategic_directives_v2
  SET active_session_id = p_session_id,
      is_working_on = true
  WHERE legacy_id = p_sd_id OR sd_key = p_sd_id;

  RETURN jsonb_build_object(
    'success', true,
    'sd_id', p_sd_id,
    'session_id', p_session_id,
    'track', p_track,
    'claimed_at', NOW()
  );

EXCEPTION
  WHEN unique_violation THEN
    -- Check if this is specifically our unique index violation (race condition)
    -- vs some other unique violation (e.g., on session_id)
    IF SQLERRM LIKE '%idx_claude_sessions_unique_active_claim%' OR
       SQLERRM LIKE '%sd_id%' THEN
      -- This catches the case where another session claimed the SD between check and update
      RETURN jsonb_build_object(
        'success', false,
        'error', 'race_condition',
        'message', format('SD %s was claimed by another session during this operation (race condition prevented)', p_sd_id)
      );
    ELSE
      -- Re-raise if it's a different unique violation
      RAISE;
    END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION claim_sd IS
  'Atomically claim an SD for a session with pessimistic locking. Returns detailed owner info on conflict. Part of SD-LEO-INFRA-MULTI-SESSION-COORDINATION-001.';

-- ============================================================================
-- FR-4: Enhanced release_sd function
-- ============================================================================

CREATE OR REPLACE FUNCTION release_sd(
  p_session_id TEXT,
  p_reason TEXT DEFAULT 'manual'
) RETURNS JSONB AS $$
DECLARE
  v_sd_id TEXT;
BEGIN
  -- Get current SD
  SELECT sd_id INTO v_sd_id
  FROM claude_sessions
  WHERE session_id = p_session_id;

  IF v_sd_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'no_claim',
      'message', 'Session has no active SD claim'
    );
  END IF;

  -- Release the claim in sd_claims
  UPDATE sd_claims
  SET released_at = NOW(), release_reason = p_reason
  WHERE session_id = p_session_id AND released_at IS NULL;

  -- Update session (this will trigger sync_is_working_on_trigger)
  UPDATE claude_sessions
  SET sd_id = NULL,
      track = NULL,
      claimed_at = NULL,
      heartbeat_at = NOW(),
      status = 'idle'
  WHERE session_id = p_session_id;

  -- Also explicitly update SD for safety
  UPDATE strategic_directives_v2
  SET active_session_id = NULL,
      is_working_on = false
  WHERE (legacy_id = v_sd_id OR sd_key = v_sd_id)
    AND active_session_id = p_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'released_sd', v_sd_id,
    'reason', p_reason,
    'released_at', NOW()
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION release_sd IS
  'Release an SD claim for a session. Triggers is_working_on sync. Part of SD-LEO-INFRA-MULTI-SESSION-COORDINATION-001.';

-- ============================================================================
-- Verification queries (can be run to verify the migration worked)
-- ============================================================================

-- Verify the unique index exists
DO $$
DECLARE
  v_index_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_claude_sessions_unique_active_claim'
  ) INTO v_index_exists;

  IF v_index_exists THEN
    RAISE NOTICE 'SUCCESS: Unique index for single active claim exists';
  ELSE
    RAISE WARNING 'FAILED: Unique index not created';
  END IF;
END $$;

-- Verify the trigger exists
DO $$
DECLARE
  v_trigger_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'sync_is_working_on_trigger'
  ) INTO v_trigger_exists;

  IF v_trigger_exists THEN
    RAISE NOTICE 'SUCCESS: is_working_on sync trigger exists';
  ELSE
    RAISE WARNING 'FAILED: Trigger not created';
  END IF;
END $$;
