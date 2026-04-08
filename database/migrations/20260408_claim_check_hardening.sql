-- Migration: Claim Check Hardening
-- SD: SD-LEO-INFRA-CLAIM-CHECK-HARDENING-001
--
-- Changes:
-- 1. Create fn_check_sd_claim RPC (multi-signal claim detection)
-- 2. Rename claude_sessions.sd_id → sd_key
-- 3. Drop old indexes, recreate with sd_key
-- 4. Update 5 RPC functions (claim_sd, release_sd, release_session, cleanup_stale_sessions, switch_sd_claim)
-- 5. Recreate v_active_sessions view
-- 6. Update sync_is_working_on_with_session trigger function

BEGIN;

-- ============================================================
-- STEP 1: Create fn_check_sd_claim RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_check_sd_claim(
  p_sd_key TEXT,
  p_session_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sd RECORD;
  v_claimer RECORD;
  v_heartbeat_age_seconds NUMERIC;
  v_is_stale BOOLEAN;
  v_has_recent_handoff BOOLEAN;
  v_recommendation TEXT;
BEGIN
  -- Look up SD
  SELECT id, sd_key, claiming_session_id, is_working_on, current_phase, status
  INTO v_sd
  FROM strategic_directives_v2
  WHERE sd_key = p_sd_key;

  IF v_sd IS NULL THEN
    RETURN jsonb_build_object(
      'is_claimed', false,
      'error', 'sd_not_found',
      'sd_key', p_sd_key
    );
  END IF;

  -- No claiming session
  IF v_sd.claiming_session_id IS NULL THEN
    RETURN jsonb_build_object(
      'is_claimed', false,
      'sd_key', p_sd_key,
      'is_working_on', v_sd.is_working_on,
      'current_phase', v_sd.current_phase,
      'recommendation', 'available'
    );
  END IF;

  -- Look up claiming session
  SELECT session_id, status, heartbeat_at, created_at, metadata
  INTO v_claimer
  FROM claude_sessions
  WHERE session_id = v_sd.claiming_session_id;

  IF v_claimer IS NULL THEN
    -- Claiming session doesn't exist in claude_sessions — orphaned claim
    RETURN jsonb_build_object(
      'is_claimed', true,
      'claimer_session_id', v_sd.claiming_session_id,
      'claimer_exists', false,
      'is_stale', true,
      'sd_key', p_sd_key,
      'recommendation', 'release_orphaned'
    );
  END IF;

  -- Calculate heartbeat age
  v_heartbeat_age_seconds := EXTRACT(EPOCH FROM (NOW() - v_claimer.heartbeat_at));
  v_is_stale := v_claimer.status IN ('stale', 'released')
    OR v_heartbeat_age_seconds > 900; -- 15 min TTL

  -- Check for recent handoff activity (within last 30 min)
  SELECT EXISTS(
    SELECT 1 FROM sd_phase_handoffs
    WHERE sd_id = v_sd.id
      AND created_at > NOW() - INTERVAL '30 minutes'
  ) INTO v_has_recent_handoff;

  -- Determine recommendation
  IF v_is_stale AND NOT v_has_recent_handoff THEN
    v_recommendation := 'release_stale';
  ELSIF v_is_stale AND v_has_recent_handoff THEN
    v_recommendation := 'wait_recent_activity';
  ELSIF p_session_id IS NOT NULL AND v_sd.claiming_session_id = p_session_id THEN
    v_recommendation := 'self_owned';
  ELSE
    v_recommendation := 'claimed_active';
  END IF;

  RETURN jsonb_build_object(
    'is_claimed', true,
    'claimer_session_id', v_sd.claiming_session_id,
    'claimer_exists', true,
    'claimer_status', v_claimer.status,
    'heartbeat_age_seconds', ROUND(v_heartbeat_age_seconds),
    'is_stale', v_is_stale,
    'has_recent_handoff', v_has_recent_handoff,
    'is_working_on', v_sd.is_working_on,
    'current_phase', v_sd.current_phase,
    'sd_key', p_sd_key,
    'is_self', p_session_id IS NOT NULL AND v_sd.claiming_session_id = p_session_id,
    'recommendation', v_recommendation
  );
END;
$function$;

COMMENT ON FUNCTION fn_check_sd_claim IS 'Multi-signal claim detection: checks SD ownership via claiming_session_id, heartbeat freshness, handoff activity. SD-LEO-INFRA-CLAIM-CHECK-HARDENING-001';

-- ============================================================
-- STEP 2: Rename claude_sessions.sd_id → sd_key
-- ============================================================

ALTER TABLE claude_sessions RENAME COLUMN sd_id TO sd_key;

-- ============================================================
-- STEP 3: Drop and recreate indexes with new column name
-- ============================================================

DROP INDEX IF EXISTS idx_claude_sessions_sd;
DROP INDEX IF EXISTS idx_claude_sessions_unique_active_claim;

CREATE INDEX idx_claude_sessions_sd_key ON claude_sessions(sd_key) WHERE sd_key IS NOT NULL;
CREATE UNIQUE INDEX idx_claude_sessions_unique_active_claim ON claude_sessions (sd_key) WHERE sd_key IS NOT NULL AND status IN ('active', 'idle');

-- ============================================================
-- STEP 4: Update RPC functions to use sd_key
-- ============================================================

-- 4a. claim_sd
CREATE OR REPLACE FUNCTION public.claim_sd(p_sd_id text, p_session_id text, p_track text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_claim RECORD;
  v_conflict RECORD;
  v_parent_sd_id TEXT;
  v_is_qf BOOLEAN := p_sd_id LIKE 'QF-%';
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_sd_id));

  SELECT cs.session_id, cs.sd_key
  INTO v_existing_claim
  FROM claude_sessions cs
  WHERE cs.sd_key = p_sd_id
    AND cs.session_id != p_session_id
    AND cs.status IN ('active', 'idle')
    AND EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)) < 900
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_existing_claim IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'already_claimed',
      'message', format('SD %s is already claimed by session %s', p_sd_id, v_existing_claim.session_id),
      'claimed_by', v_existing_claim.session_id
    );
  END IF;

  IF NOT v_is_qf THEN
    SELECT cm.*, cs_other.sd_key as active_sd, cs_other.session_id as active_session
    INTO v_conflict
    FROM sd_conflict_matrix cm
    JOIN claude_sessions cs_other ON (
      (cm.sd_id_a = p_sd_id AND cm.sd_id_b = cs_other.sd_key) OR
      (cm.sd_id_b = p_sd_id AND cm.sd_id_a = cs_other.sd_key)
    )
    WHERE cm.conflict_severity = 'blocking'
      AND cm.resolved_at IS NULL
      AND cs_other.sd_key IS NOT NULL
      AND cs_other.status IN ('active', 'idle')
      AND EXTRACT(EPOCH FROM (NOW() - cs_other.heartbeat_at)) < 900
      AND cs_other.session_id != p_session_id
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

    SELECT parent_sd_id INTO v_parent_sd_id
    FROM strategic_directives_v2
    WHERE sd_key = p_sd_id;
  END IF;

  UPDATE claude_sessions
  SET sd_key = NULL,
      track = NULL,
      claimed_at = NULL,
      released_at = NOW(),
      released_reason = 'claim_switch',
      status = 'idle'
  WHERE session_id = p_session_id
    AND sd_key IS NOT NULL
    AND sd_key != p_sd_id
    AND (v_parent_sd_id IS NULL OR sd_key != v_parent_sd_id);

  UPDATE claude_sessions
  SET sd_key = p_sd_id,
      track = p_track,
      claimed_at = NOW(),
      released_at = NULL,
      released_reason = NULL,
      heartbeat_at = NOW(),
      status = 'active'
  WHERE session_id = p_session_id;

  IF v_is_qf THEN
    UPDATE quick_fixes
    SET claiming_session_id = p_session_id,
        status = 'in_progress'
    WHERE id = p_sd_id;
  ELSE
    UPDATE strategic_directives_v2
    SET claiming_session_id = p_session_id,
        active_session_id = p_session_id,
        is_working_on = true
    WHERE sd_key = p_sd_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', format('SD %s claimed successfully', p_sd_id),
    'sd_id', p_sd_id,
    'session_id', p_session_id,
    'track', p_track,
    'parent_preserved', v_parent_sd_id IS NOT NULL
  );
END;
$function$;

-- 4b. release_sd
CREATE OR REPLACE FUNCTION public.release_sd(p_session_id text, p_reason text DEFAULT 'manual')
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sd_key TEXT;
BEGIN
  SELECT sd_key INTO v_sd_key
  FROM claude_sessions
  WHERE session_id = p_session_id;

  IF v_sd_key IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'No SD to release'
    );
  END IF;

  UPDATE claude_sessions
  SET sd_key = NULL,
      track = NULL,
      claimed_at = NULL,
      released_at = NOW(),
      released_reason = p_reason,
      heartbeat_at = NOW(),
      status = 'idle'
  WHERE session_id = p_session_id;

  IF v_sd_key LIKE 'QF-%' THEN
    UPDATE quick_fixes
    SET claiming_session_id = NULL
    WHERE id = v_sd_key;
  ELSE
    UPDATE strategic_directives_v2
    SET claiming_session_id = NULL,
        active_session_id = NULL,
        is_working_on = false
    WHERE sd_key = v_sd_key
      AND (active_session_id = p_session_id OR claiming_session_id = p_session_id);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'released_sd', v_sd_key,
    'reason', p_reason,
    'released_at', NOW()
  );
END;
$function$;

-- 4c. release_session
CREATE OR REPLACE FUNCTION public.release_session(p_session_id text, p_reason text DEFAULT 'graceful_exit')
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_session RECORD;
BEGIN
  SELECT session_id, status, sd_key, released_at INTO v_session
  FROM claude_sessions
  WHERE session_id = p_session_id;

  IF v_session IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'session_not_found',
      'message', format('Session %s not found', p_session_id)
    );
  END IF;

  IF v_session.status = 'released' THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_released', true,
      'session_id', p_session_id,
      'released_at', v_session.released_at
    );
  END IF;

  IF v_session.sd_key IS NOT NULL THEN
    IF v_session.sd_key LIKE 'QF-%' THEN
      UPDATE quick_fixes
      SET claiming_session_id = NULL
      WHERE id = v_session.sd_key;
    ELSE
      UPDATE strategic_directives_v2
      SET active_session_id = NULL, is_working_on = false
      WHERE active_session_id = p_session_id;
    END IF;
  END IF;

  UPDATE claude_sessions
  SET status = 'released',
      released_at = NOW(),
      released_reason = p_reason,
      sd_key = NULL,
      track = NULL,
      claimed_at = NULL,
      updated_at = NOW()
  WHERE session_id = p_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'released_at', NOW(),
    'reason', p_reason,
    'had_sd_claim', v_session.sd_key IS NOT NULL
  );
END;
$function$;

-- 4d. cleanup_stale_sessions
CREATE OR REPLACE FUNCTION public.cleanup_stale_sessions(p_stale_threshold_seconds integer DEFAULT 120, p_batch_size integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_stale_count INTEGER := 0;
  v_released_count INTEGER := 0;
BEGIN
  WITH stale_sessions AS (
    SELECT session_id
    FROM claude_sessions
    WHERE status IN ('active', 'idle')
      AND heartbeat_at < NOW() - (p_stale_threshold_seconds || ' seconds')::INTERVAL
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE claude_sessions cs
    SET status = 'stale',
        stale_at = NOW(),
        stale_reason = 'HEARTBEAT_TIMEOUT',
        updated_at = NOW()
    FROM stale_sessions ss
    WHERE cs.session_id = ss.session_id
    RETURNING cs.session_id
  )
  SELECT COUNT(*) INTO v_stale_count FROM updated;

  WITH release_sessions AS (
    SELECT session_id, sd_key
    FROM claude_sessions
    WHERE status = 'stale'
      AND stale_at < NOW() - INTERVAL '30 seconds'
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  ),
  released AS (
    UPDATE claude_sessions cs
    SET status = 'released',
        released_at = NOW(),
        released_reason = 'STALE_CLEANUP',
        sd_key = NULL,
        track = NULL,
        claimed_at = NULL,
        updated_at = NOW()
    FROM release_sessions rs
    WHERE cs.session_id = rs.session_id
    RETURNING cs.session_id
  )
  SELECT COUNT(*) INTO v_released_count FROM released;

  UPDATE strategic_directives_v2
  SET active_session_id = NULL, is_working_on = false
  WHERE active_session_id IN (
    SELECT session_id FROM claude_sessions
    WHERE status = 'released' AND released_reason = 'STALE_CLEANUP'
    AND released_at > NOW() - INTERVAL '1 minute'
  );

  UPDATE quick_fixes
  SET claiming_session_id = NULL
  WHERE claiming_session_id IN (
    SELECT session_id FROM claude_sessions
    WHERE status = 'released' AND released_reason = 'STALE_CLEANUP'
    AND released_at > NOW() - INTERVAL '1 minute'
  );

  RETURN jsonb_build_object(
    'success', true,
    'sessions_marked_stale', v_stale_count,
    'sessions_released', v_released_count,
    'stale_threshold_seconds', p_stale_threshold_seconds,
    'batch_size', p_batch_size,
    'executed_at', NOW()
  );
END;
$function$;

-- 4e. switch_sd_claim
CREATE OR REPLACE FUNCTION public.switch_sd_claim(p_session_id text, p_old_sd_id text, p_new_sd_id text, p_new_track text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_session RECORD;
  v_conflict RECORD;
BEGIN
  SELECT * INTO v_session
  FROM claude_sessions
  WHERE session_id = p_session_id
    AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Session not found or not active'
    );
  END IF;

  IF v_session.sd_key IS DISTINCT FROM p_old_sd_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Session does not hold claim on %s (current: %s)', p_old_sd_id, COALESCE(v_session.sd_key, 'none'))
    );
  END IF;

  SELECT session_id, sd_key INTO v_conflict
  FROM claude_sessions
  WHERE sd_key = p_new_sd_id
    AND status IN ('active', 'idle')
    AND session_id != p_session_id
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('SD %s is already claimed by session %s', p_new_sd_id, v_conflict.session_id),
      'conflict_session_id', v_conflict.session_id
    );
  END IF;

  IF p_old_sd_id LIKE 'QF-%' THEN
    UPDATE quick_fixes
    SET claiming_session_id = NULL
    WHERE id = p_old_sd_id;
  ELSE
    UPDATE strategic_directives_v2
    SET active_session_id = NULL, is_working_on = false
    WHERE sd_key = p_old_sd_id AND active_session_id = p_session_id;
  END IF;

  UPDATE claude_sessions
  SET
    sd_key = p_new_sd_id,
    track = COALESCE(p_new_track, track),
    claimed_at = NOW(),
    heartbeat_at = NOW(),
    updated_at = NOW()
  WHERE session_id = p_session_id;

  IF p_new_sd_id LIKE 'QF-%' THEN
    UPDATE quick_fixes
    SET claiming_session_id = p_session_id,
        status = 'in_progress'
    WHERE id = p_new_sd_id;
  ELSE
    UPDATE strategic_directives_v2
    SET active_session_id = p_session_id,
        claiming_session_id = p_session_id,
        is_working_on = true
    WHERE sd_key = p_new_sd_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'old_sd_id', p_old_sd_id,
    'new_sd_id', p_new_sd_id,
    'switched_at', NOW()::TEXT
  );
END;
$function$;

-- ============================================================
-- STEP 5: Recreate v_active_sessions view
-- ============================================================

CREATE OR REPLACE VIEW v_active_sessions AS
SELECT cs.id,
    cs.session_id,
    cs.sd_key AS sd_id, -- backward-compat alias
    cs.sd_key,
    COALESCE(sd.title, qf.title::character varying) AS sd_title,
    cs.track,
    cs.tty,
    cs.pid,
    cs.hostname,
    cs.codebase,
    cs.current_branch,
    cs.machine_id,
    cs.terminal_id,
    cs.terminal_identity,
    cs.claimed_at,
    cs.heartbeat_at,
    cs.status,
    cs.released_reason,
    cs.released_at,
    cs.stale_reason,
    cs.stale_at,
    cs.metadata,
    cs.created_at,
    EXTRACT(epoch FROM now() - cs.heartbeat_at) AS heartbeat_age_seconds,
    EXTRACT(epoch FROM now() - cs.heartbeat_at) / 60.0 AS heartbeat_age_minutes,
    GREATEST(0::numeric, 600.0 - EXTRACT(epoch FROM now() - cs.heartbeat_at)) AS seconds_until_stale,
    CASE
        WHEN cs.status = 'released' THEN 'released'
        WHEN cs.status = 'stale' THEN 'stale'
        WHEN EXTRACT(epoch FROM now() - cs.heartbeat_at) > 600 THEN 'stale'
        WHEN cs.sd_key IS NULL THEN 'idle'
        ELSE 'active'
    END AS computed_status,
    CASE
        WHEN cs.claimed_at IS NOT NULL THEN EXTRACT(epoch FROM now() - cs.claimed_at) / 60.0
        ELSE NULL::numeric
    END AS claim_duration_minutes,
    CASE
        WHEN EXTRACT(epoch FROM now() - cs.heartbeat_at) < 60 THEN EXTRACT(epoch FROM now() - cs.heartbeat_at)::integer || 's ago'
        WHEN EXTRACT(epoch FROM now() - cs.heartbeat_at) < 3600 THEN (EXTRACT(epoch FROM now() - cs.heartbeat_at) / 60.0)::integer || 'm ago'
        ELSE (EXTRACT(epoch FROM now() - cs.heartbeat_at) / 3600.0)::integer || 'h ago'
    END AS heartbeat_age_human,
    cs.is_virtual,
    cs.parent_session_id
FROM claude_sessions cs
    LEFT JOIN strategic_directives_v2 sd ON cs.sd_key = sd.sd_key
    LEFT JOIN quick_fixes qf ON cs.sd_key = qf.id
WHERE cs.status <> 'released'
ORDER BY cs.track, cs.claimed_at DESC;

-- ============================================================
-- STEP 6: Update sync_is_working_on_with_session trigger function
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_is_working_on_with_session()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.sd_key IS NULL AND NEW.sd_key IS NOT NULL AND NEW.status = 'active' THEN
    UPDATE strategic_directives_v2
    SET is_working_on = true,
        active_session_id = NEW.session_id,
        updated_at = NOW()
    WHERE sd_key = NEW.sd_key;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND (
    (OLD.sd_key IS NOT NULL AND NEW.sd_key IS NULL) OR
    (OLD.status = 'active' AND NEW.status != 'active' AND OLD.sd_key IS NOT NULL)
  ) THEN
    UPDATE strategic_directives_v2
    SET is_working_on = false,
        active_session_id = NULL,
        updated_at = NOW()
    WHERE sd_key = OLD.sd_key
      AND active_session_id = OLD.session_id;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$;

COMMIT;
