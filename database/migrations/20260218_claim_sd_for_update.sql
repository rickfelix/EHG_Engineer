-- Migration: 20260218_claim_sd_for_update.sql
-- SD: SD-LEO-INFRA-CLAIM-GUARD-001 / US-007
-- Purpose: Eliminate TOCTOU race condition in claim_sd function
--
-- Problem: When two concurrent sessions claim the same unclaimed SD, the first
-- SELECT ... FOR UPDATE finds no existing claim row (nothing to lock). Both
-- transactions pass the check, both INSERT via ON CONFLICT DO UPDATE, and the
-- second writer silently steals the claim from the first.
--
-- Fix: Add pg_advisory_xact_lock(hashtext(p_sd_id)) at the top of the function.
-- This acquires a transaction-scoped advisory lock keyed on the SD ID, serializing
-- all concurrent claim attempts for the same SD. The lock is automatically released
-- when the transaction commits or rolls back.
--
-- Rollback: Re-deploy the previous version of claim_sd without the advisory lock line.

CREATE OR REPLACE FUNCTION public.claim_sd(p_sd_id text, p_session_id text, p_track text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_existing_claim RECORD;
  v_conflict RECORD;
  v_parent_sd_id TEXT;
  v_result JSONB;
BEGIN
  -- TOCTOU FIX (US-007): Acquire advisory lock to serialize concurrent claims
  -- for the same SD. Without this, two sessions can both pass the "is claimed?"
  -- check when no existing claim row exists, and both INSERT successfully.
  -- The lock is transaction-scoped and released automatically on COMMIT/ROLLBACK.
  PERFORM pg_advisory_xact_lock(hashtext(p_sd_id));

  -- Check if SD is already claimed by another active session
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

  -- Look up the parent SD of the SD being claimed (if it is a child)
  SELECT parent_sd_id INTO v_parent_sd_id
  FROM strategic_directives_v2
  WHERE sd_key = p_sd_id;

  -- Release any existing active claims for this session (switching SDs)
  -- BUT preserve the parent orchestrator claim when claiming a child SD
  UPDATE sd_claims
  SET released_at = NOW(), release_reason = 'claim_switch'
  WHERE session_id = p_session_id
    AND released_at IS NULL
    AND sd_id != p_sd_id
    AND (v_parent_sd_id IS NULL OR sd_id != v_parent_sd_id);

  -- Record the claim in sd_claims table
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
    'track', p_track,
    'parent_preserved', v_parent_sd_id IS NOT NULL
  );
END;
$function$;

-- Add comment documenting the advisory lock pattern
COMMENT ON FUNCTION public.claim_sd(text, text, text) IS
  'Atomically claim an SD for a session. Uses pg_advisory_xact_lock to serialize '
  'concurrent claims for the same SD, preventing TOCTOU race conditions. '
  'SD-LEO-INFRA-CLAIM-GUARD-001 / US-007.';
