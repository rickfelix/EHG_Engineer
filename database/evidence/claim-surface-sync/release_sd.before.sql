CREATE OR REPLACE FUNCTION public.release_sd(p_session_id text, p_reason text DEFAULT 'manual'::text)
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
      status = 'idle',
      worktree_path = NULL,
      worktree_branch = NULL
  WHERE session_id = p_session_id;

  IF v_sd_key LIKE 'QF-%' THEN
    -- FR-2: clear the claim AND reopen, so the row returns to the belt instead of stranding.
    UPDATE quick_fixes
    SET claiming_session_id = NULL,
        status = CASE
                   WHEN status = 'in_progress'
                    AND pr_url IS NULL
                    AND commit_sha IS NULL
                   THEN 'open'
                   ELSE status
                 END
    WHERE id = v_sd_key
      -- Holder CAS, parity with the SD branch below: only the session that holds the claim may
      -- release it. Without this the reopen could clobber a concurrent re-claim.
      AND claiming_session_id = p_session_id;
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
$function$
