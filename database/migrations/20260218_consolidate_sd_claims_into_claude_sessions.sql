-- ============================================================================
-- Migration: Consolidate sd_claims into claude_sessions
-- SD: SD-LEO-INFRA-CONSOLIDATE-CLAIMS-INTO-001
-- Date: 2026-02-18
-- Purpose: Eliminate sd_claims table; claim state lives in claude_sessions only
--
-- Functions updated (8 total):
--   claim_sd, release_sd (both overloads merged to 1),
--   release_session, cleanup_stale_sessions,
--   enforce_completed_phase_alignment, create_or_replace_session,
--   switch_sd_claim
--
-- View rebuilt: v_active_sessions (no sd_claims JOIN)
-- Table dropped: sd_claims
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 0: Fix unique active claim index to cover both 'active' AND 'idle'
-- The old index only covered status='active', meaning two idle sessions could
-- theoretically claim the same SD. Fix this before we rely on it.
-- ============================================================================

DROP INDEX IF EXISTS idx_claude_sessions_unique_active_claim;

CREATE UNIQUE INDEX idx_claude_sessions_unique_active_claim
  ON claude_sessions (sd_id)
  WHERE sd_id IS NOT NULL AND status IN ('active', 'idle');

-- ============================================================================
-- STEP 1: Migrate any active sd_claims state into claude_sessions
-- Ensure claude_sessions.sd_id matches sd_claims for any active claims
-- ============================================================================

UPDATE claude_sessions cs
SET sd_id = sc.sd_id,
    track = COALESCE(sc.track, cs.track),
    claimed_at = sc.claimed_at
FROM sd_claims sc
WHERE sc.session_id = cs.session_id
  AND sc.released_at IS NULL
  AND (cs.sd_id IS NULL OR cs.sd_id != sc.sd_id);

-- ============================================================================
-- STEP 2: Replace claim_sd() function
-- Writes claim state to claude_sessions directly, no sd_claims
-- ============================================================================

CREATE OR REPLACE FUNCTION public.claim_sd(
  p_sd_id text,
  p_session_id text,
  p_track text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_existing_claim RECORD;
  v_conflict RECORD;
  v_parent_sd_id TEXT;
BEGIN
  -- TOCTOU FIX (US-007): Acquire advisory lock to serialize concurrent claims
  PERFORM pg_advisory_xact_lock(hashtext(p_sd_id));

  -- Check if SD is already claimed by another active/idle session
  SELECT cs.session_id, cs.sd_id
  INTO v_existing_claim
  FROM claude_sessions cs
  WHERE cs.sd_id = p_sd_id
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

  -- Check for blocking conflicts with active SDs (reads from claude_sessions)
  SELECT cm.*, cs_other.sd_id as active_sd, cs_other.session_id as active_session
  INTO v_conflict
  FROM sd_conflict_matrix cm
  JOIN claude_sessions cs_other ON (
    (cm.sd_id_a = p_sd_id AND cm.sd_id_b = cs_other.sd_id) OR
    (cm.sd_id_b = p_sd_id AND cm.sd_id_a = cs_other.sd_id)
  )
  WHERE cm.conflict_severity = 'blocking'
    AND cm.resolved_at IS NULL
    AND cs_other.sd_id IS NOT NULL
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

  -- Look up the parent SD of the SD being claimed (if it is a child)
  SELECT parent_sd_id INTO v_parent_sd_id
  FROM strategic_directives_v2
  WHERE sd_key = p_sd_id;

  -- Release any existing claim for this session (switching SDs)
  -- BUT preserve the parent orchestrator claim when claiming a child SD
  UPDATE claude_sessions
  SET sd_id = NULL,
      track = NULL,
      claimed_at = NULL,
      released_at = NOW(),
      released_reason = 'claim_switch',
      status = 'idle'
  WHERE session_id = p_session_id
    AND sd_id IS NOT NULL
    AND sd_id != p_sd_id
    AND (v_parent_sd_id IS NULL OR sd_id != v_parent_sd_id);

  -- Write the claim directly into claude_sessions
  UPDATE claude_sessions
  SET sd_id = p_sd_id,
      track = p_track,
      claimed_at = NOW(),
      released_at = NULL,
      released_reason = NULL,
      heartbeat_at = NOW(),
      status = 'active'
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
    'track', p_track,
    'parent_preserved', v_parent_sd_id IS NOT NULL
  );
END;
$function$;

-- ============================================================================
-- STEP 3: Drop BOTH release_sd() overloads and recreate as single function
-- PostgreSQL requires explicit DROP of each overload by signature
-- ============================================================================

DROP FUNCTION IF EXISTS public.release_sd(text);
DROP FUNCTION IF EXISTS public.release_sd(text, text);

CREATE FUNCTION public.release_sd(
  p_session_id text,
  p_reason text DEFAULT 'manual'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_sd_id TEXT;
BEGIN
  -- Get current SD from claude_sessions
  SELECT sd_id INTO v_sd_id
  FROM claude_sessions
  WHERE session_id = p_session_id;

  IF v_sd_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'No SD to release'
    );
  END IF;

  -- Clear claim state on claude_sessions
  UPDATE claude_sessions
  SET sd_id = NULL,
      track = NULL,
      claimed_at = NULL,
      released_at = NOW(),
      released_reason = p_reason,
      heartbeat_at = NOW(),
      status = 'idle'
  WHERE session_id = p_session_id;

  -- Also explicitly update SD for safety
  UPDATE strategic_directives_v2
  SET claiming_session_id = NULL,
      active_session_id = NULL,
      is_working_on = false
  WHERE sd_key = v_sd_id
    AND (active_session_id = p_session_id OR claiming_session_id = p_session_id);

  RETURN jsonb_build_object(
    'success', true,
    'released_sd', v_sd_id,
    'reason', p_reason,
    'released_at', NOW()
  );
END;
$function$;

-- ============================================================================
-- STEP 4: Rebuild release_session() - remove sd_claims reference
-- ============================================================================

CREATE OR REPLACE FUNCTION public.release_session(p_session_id text, p_reason text DEFAULT 'graceful_exit'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_session RECORD;
BEGIN
  -- Get current session state
  SELECT session_id, status, sd_id, released_at INTO v_session
  FROM claude_sessions
  WHERE session_id = p_session_id;

  IF v_session IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'session_not_found',
      'message', format('Session %s not found', p_session_id)
    );
  END IF;

  -- Idempotent: if already released, return success with original timestamp
  IF v_session.status = 'released' THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_released', true,
      'session_id', p_session_id,
      'released_at', v_session.released_at
    );
  END IF;

  -- Release SD claim if session had one
  IF v_session.sd_id IS NOT NULL THEN
    UPDATE strategic_directives_v2
    SET active_session_id = NULL, is_working_on = false
    WHERE active_session_id = p_session_id;
  END IF;

  -- Update session to released (sd_id cleared here, no sd_claims needed)
  UPDATE claude_sessions
  SET status = 'released',
      released_at = NOW(),
      released_reason = p_reason,
      sd_id = NULL,
      track = NULL,
      claimed_at = NULL,
      updated_at = NOW()
  WHERE session_id = p_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'released_at', NOW(),
    'reason', p_reason,
    'had_sd_claim', v_session.sd_id IS NOT NULL
  );
END;
$function$;

-- ============================================================================
-- STEP 5: Rebuild cleanup_stale_sessions() - remove sd_claims reference
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cleanup_stale_sessions(p_stale_threshold_seconds integer DEFAULT 120, p_batch_size integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_stale_count INTEGER := 0;
  v_released_count INTEGER := 0;
BEGIN
  -- Step 1: Mark active sessions as stale if heartbeat too old
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

  -- Step 2: Release stale sessions that have been stale for >30 seconds
  WITH release_sessions AS (
    SELECT session_id, sd_id
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
        sd_id = NULL,
        track = NULL,
        claimed_at = NULL,
        updated_at = NOW()
    FROM release_sessions rs
    WHERE cs.session_id = rs.session_id
    RETURNING cs.session_id
  )
  SELECT COUNT(*) INTO v_released_count FROM released;

  -- Clear is_working_on for released sessions (no sd_claims needed)
  UPDATE strategic_directives_v2
  SET active_session_id = NULL, is_working_on = false
  WHERE active_session_id IN (
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

-- ============================================================================
-- STEP 6: Rebuild enforce_completed_phase_alignment() trigger
-- Remove sd_claims DELETE, use claude_sessions UPDATE instead
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_completed_phase_alignment()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- When status transitions to 'completed', ensure full cleanup
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        NEW.current_phase := 'COMPLETED';
        NEW.is_working_on := false;
        NEW.claiming_session_id := NULL;
        NEW.active_session_id := NULL;

        -- Clean up claim in claude_sessions (no sd_claims)
        UPDATE claude_sessions
        SET sd_id = NULL, track = NULL, claimed_at = NULL
        WHERE sd_id = NEW.sd_key;

        RAISE NOTICE 'Auto-released claims on completion for SD: %', NEW.id;
    END IF;

    -- Existing: phase/status alignment (for cases where phase is set directly)
    IF NEW.status = 'completed' AND NEW.current_phase != 'COMPLETED' THEN
        NEW.current_phase := 'COMPLETED';
        NEW.is_working_on := false;
    END IF;

    IF NEW.current_phase = 'COMPLETED' AND NEW.status != 'completed' THEN
        NEW.status := 'completed';
        NEW.is_working_on := false;
    END IF;

    RETURN NEW;
END;
$function$;

-- ============================================================================
-- STEP 7: Rebuild create_or_replace_session() - remove sd_claims reference
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_or_replace_session(p_session_id text, p_machine_id text, p_terminal_id text, p_tty text, p_pid integer, p_hostname text, p_codebase text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_terminal_identity TEXT;
  v_existing RECORD;
  v_heartbeat_age NUMERIC;
BEGIN
  -- Compute terminal identity (matches the GENERATED ALWAYS column)
  v_terminal_identity := COALESCE(p_machine_id, '') || ':' || COALESCE(p_terminal_id, p_tty, '');

  -- Strategy: Try to insert first. If it succeeds, no conflict exists.
  BEGIN
    INSERT INTO claude_sessions (
      session_id, machine_id, terminal_id, tty, pid, hostname, codebase,
      status, heartbeat_at, metadata, created_at, updated_at
    ) VALUES (
      p_session_id, p_machine_id, p_terminal_id, p_tty, p_pid, p_hostname, p_codebase,
      'idle', NOW(), p_metadata, NOW(), NOW()
    )
    ON CONFLICT (session_id) DO UPDATE SET
      machine_id = EXCLUDED.machine_id,
      terminal_id = EXCLUDED.terminal_id,
      tty = EXCLUDED.tty,
      pid = EXCLUDED.pid,
      hostname = EXCLUDED.hostname,
      heartbeat_at = NOW(),
      metadata = EXCLUDED.metadata,
      status = CASE
        WHEN claude_sessions.status = 'released' THEN 'idle'
        ELSE claude_sessions.status
      END,
      updated_at = NOW();

    RETURN jsonb_build_object(
      'success', true,
      'session_id', p_session_id,
      'terminal_identity', v_terminal_identity,
      'auto_released', false,
      'created_at', NOW()
    );

  EXCEPTION
    WHEN unique_violation THEN
      NULL; -- Fall through to conflict resolution below
  END;

  -- Find the conflicting session
  SELECT session_id, sd_id, status, heartbeat_at INTO v_existing
  FROM claude_sessions
  WHERE terminal_identity = v_terminal_identity
    AND status IN ('active', 'idle')
    AND session_id != p_session_id
  LIMIT 1;

  IF v_existing IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'session_id', p_session_id,
      'terminal_identity', v_terminal_identity,
      'error', 'terminal_conflict',
      'message', format('Terminal %s had unique violation but no conflicting session found', v_terminal_identity)
    );
  END IF;

  v_heartbeat_age := EXTRACT(EPOCH FROM (NOW() - v_existing.heartbeat_at));

  IF v_heartbeat_age < 300 THEN
    RETURN jsonb_build_object(
      'success', true,
      'session_id', p_session_id,
      'terminal_identity', v_terminal_identity,
      'auto_released', false,
      'conflict', true,
      'conflict_session_id', v_existing.session_id,
      'conflict_sd_id', v_existing.sd_id,
      'conflict_heartbeat_age_seconds', round(v_heartbeat_age)
    );
  END IF;

  -- Stale heartbeat (>= 5 min) -- safe to auto-release and create new session
  UPDATE claude_sessions
  SET status = 'released',
      released_at = NOW(),
      released_reason = 'AUTO_REPLACED',
      sd_id = NULL,
      track = NULL,
      claimed_at = NULL,
      updated_at = NOW()
  WHERE session_id = v_existing.session_id;

  -- Release SD working state if the stale session had one (no sd_claims needed)
  IF v_existing.sd_id IS NOT NULL THEN
    UPDATE strategic_directives_v2
    SET active_session_id = NULL, is_working_on = false
    WHERE active_session_id = v_existing.session_id;
  END IF;

  RAISE NOTICE 'Auto-released stale session % (heartbeat %s ago) for terminal %',
    v_existing.session_id, round(v_heartbeat_age), v_terminal_identity;

  -- Now insert the new session
  BEGIN
    INSERT INTO claude_sessions (
      session_id, machine_id, terminal_id, tty, pid, hostname, codebase,
      status, heartbeat_at, metadata, created_at, updated_at
    ) VALUES (
      p_session_id, p_machine_id, p_terminal_id, p_tty, p_pid, p_hostname, p_codebase,
      'idle', NOW(), p_metadata, NOW(), NOW()
    )
    ON CONFLICT (session_id) DO UPDATE SET
      machine_id = EXCLUDED.machine_id,
      terminal_id = EXCLUDED.terminal_id,
      tty = EXCLUDED.tty,
      pid = EXCLUDED.pid,
      hostname = EXCLUDED.hostname,
      heartbeat_at = NOW(),
      metadata = EXCLUDED.metadata,
      status = CASE
        WHEN claude_sessions.status = 'released' THEN 'idle'
        ELSE claude_sessions.status
      END,
      updated_at = NOW();

    RETURN jsonb_build_object(
      'success', true,
      'session_id', p_session_id,
      'terminal_identity', v_terminal_identity,
      'auto_released', true,
      'previous_session_id', v_existing.session_id,
      'created_at', NOW()
    );

  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object(
        'success', false,
        'session_id', p_session_id,
        'terminal_identity', v_terminal_identity,
        'error', 'terminal_conflict',
        'message', format('Terminal %s: race condition during stale session replacement', v_terminal_identity)
      );
  END;

END;
$function$;

-- ============================================================================
-- STEP 8: Rebuild switch_sd_claim() - remove sd_claims reference
-- ============================================================================

CREATE OR REPLACE FUNCTION public.switch_sd_claim(p_session_id text, p_old_sd_id text, p_new_sd_id text, p_new_track text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_session RECORD;
  v_conflict RECORD;
BEGIN
  -- Validate session exists and owns the old claim
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

  -- Verify session currently holds the old SD claim
  IF v_session.sd_id IS DISTINCT FROM p_old_sd_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Session does not hold claim on %s (current: %s)', p_old_sd_id, COALESCE(v_session.sd_id, 'none'))
    );
  END IF;

  -- Check if new SD is already claimed by another active/idle session
  SELECT session_id, sd_id INTO v_conflict
  FROM claude_sessions
  WHERE sd_id = p_new_sd_id
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

  -- Clear old SD's working state
  UPDATE strategic_directives_v2
  SET active_session_id = NULL, is_working_on = false
  WHERE sd_key = p_old_sd_id AND active_session_id = p_session_id;

  -- Atomic switch: update SD claim in claude_sessions (no sd_claims)
  UPDATE claude_sessions
  SET
    sd_id = p_new_sd_id,
    track = COALESCE(p_new_track, track),
    claimed_at = NOW(),
    heartbeat_at = NOW(),
    updated_at = NOW()
  WHERE session_id = p_session_id;

  -- Set new SD's working state
  UPDATE strategic_directives_v2
  SET active_session_id = p_session_id,
      claiming_session_id = p_session_id,
      is_working_on = true
  WHERE sd_key = p_new_sd_id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'old_sd_id', p_old_sd_id,
    'new_sd_id', p_new_sd_id,
    'switched_at', NOW()::TEXT
  );
END;
$function$;

-- ============================================================================
-- STEP 9: Rebuild v_active_sessions view (no sd_claims JOIN)
-- Reads exclusively from claude_sessions + strategic_directives_v2
-- ============================================================================

DROP VIEW IF EXISTS v_active_sessions;

CREATE VIEW v_active_sessions AS
SELECT
  cs.id,
  cs.session_id,
  cs.sd_id,
  sd.title AS sd_title,
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
  EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)) AS heartbeat_age_seconds,
  (EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)) / 60.0) AS heartbeat_age_minutes,
  GREATEST(0, 300.0 - EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at))) AS seconds_until_stale,
  CASE
    WHEN cs.status = 'released' THEN 'released'
    WHEN cs.status = 'stale' THEN 'stale'
    WHEN EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)) > 300 THEN 'stale'
    WHEN cs.sd_id IS NULL THEN 'idle'
    ELSE 'active'
  END AS computed_status,
  CASE
    WHEN cs.claimed_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (NOW() - cs.claimed_at)) / 60.0
    ELSE NULL
  END AS claim_duration_minutes,
  CASE
    WHEN EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)) < 60
      THEN EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at))::integer || 's ago'
    WHEN EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)) < 3600
      THEN (EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)) / 60.0)::integer || 'm ago'
    ELSE (EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)) / 3600.0)::integer || 'h ago'
  END AS heartbeat_age_human
FROM claude_sessions cs
LEFT JOIN strategic_directives_v2 sd ON cs.sd_id = sd.sd_key
WHERE cs.status <> 'released'
ORDER BY cs.track, cs.claimed_at DESC;

-- ============================================================================
-- STEP 10: Drop sd_claims table
-- All references have been removed from functions and views above
-- ============================================================================

DROP TABLE IF EXISTS sd_claims CASCADE;

COMMIT;

-- ============================================================================
-- ROLLBACK NOTES:
-- This migration drops sd_claims. To rollback:
-- 1. Recreate sd_claims table with original schema
-- 2. Restore claim_sd/release_sd/release_session/cleanup_stale_sessions/
--    enforce_completed_phase_alignment/create_or_replace_session/switch_sd_claim
-- 3. Rebuild v_active_sessions with sd_claims JOIN
-- A pre-migration pg_dump of sd_claims is recommended before applying.
-- ============================================================================
