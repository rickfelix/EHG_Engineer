CREATE OR REPLACE FUNCTION public.release_session(p_session_id text, p_reason text DEFAULT 'graceful_exit'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
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
    -- LAYER-SIDE-CLAIMING-001 FR-3: clear claiming_session_id alongside active_session_id.
    -- (sd_claims table reference removed — table does not exist in current schema.)
    UPDATE strategic_directives_v2
    SET active_session_id = NULL, claiming_session_id = NULL, is_working_on = false
    WHERE active_session_id = p_session_id
       OR claiming_session_id = p_session_id;
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
$function$
