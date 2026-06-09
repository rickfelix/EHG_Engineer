-- @approved-by: codestreetlabs@gmail.com
-- SD-LEO-FIX-SWITCH-CLAIM-RPC-001
-- switch_sd_claim RPC: existence + terminal-status guards for the NEW claim target.
--
-- Bug (PAT-OPTIMISTIC-RPC): switch_sd_claim took a free-form p_new_sd_id like claim_sd p_sd_id
-- but had NO existence guard and NO terminal-status guard. Its SD-side UPDATE keyed
-- WHERE sd_key=p_new_sd_id with no NOT FOUND check (a phantom/typo id matched zero SD rows
-- yet the claude_sessions UPDATE still wrote sd_key=p_new_sd_id), and no terminal check (a
-- claim could be switched onto a completed/cancelled/deferred SD). This adds, BEFORE any
-- UPDATE, the same two guards that landed on the sibling claim_sd RPC this session
-- (SD-FDBK-FIX-CLAIM-RPC-VALIDATE-001 existence + SD-LEO-FIX-CLAIM-RPC-TERMINAL-001 terminal),
-- using identical error codes (sd_not_found / sd_terminal_status) and terminal sets
-- (SD={completed,cancelled,deferred}; QF={completed,cancelled,escalated}).
--
-- The ENTIRE live function body is carried BYTE-VERBATIM (proven: reversing the 2 inserts
-- reproduces pg_get_functiondef exactly). Function-only CREATE OR REPLACE with the unchanged
-- switch_sd_claim(text,text,text,text) signature, SECURITY DEFINER + search_path preserved,
-- so EXECUTE grants (postgres, service_role) are preserved.

CREATE OR REPLACE FUNCTION public.switch_sd_claim(p_session_id text, p_old_sd_id text, p_new_sd_id text, p_new_track text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_session RECORD;
  v_conflict RECORD;
  v_new_is_qf boolean := p_new_sd_id LIKE 'QF-%';
  v_new_sd_status text;
  v_new_qf_status text;
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

  -- SD-LEO-FIX-SWITCH-CLAIM-RPC-001: existence + terminal-status guards for the NEW target.
  -- switch_sd_claim was OPTIMISTIC (PAT-OPTIMISTIC-RPC) -- a phantom/typo p_new_sd_id matched zero
  -- SD rows in the SD-side UPDATE below, yet the claude_sessions UPDATE still wrote sd_key=p_new_sd_id;
  -- and a claim could be switched onto a completed/cancelled/deferred SD. These guards fire BEFORE any
  -- UPDATE. Mirrors claim_sd (SD-FDBK-FIX-CLAIM-RPC-VALIDATE-001 + SD-LEO-FIX-CLAIM-RPC-TERMINAL-001):
  -- same error codes (sd_not_found / sd_terminal_status) and same terminal sets.
  IF NOT v_new_is_qf THEN
    SELECT sd.status INTO v_new_sd_status
      FROM strategic_directives_v2 sd
     WHERE sd.sd_key = p_new_sd_id
       FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', FALSE,
        'error', 'sd_not_found',
        'message', format('[SWITCH_SD_NOT_FOUND] SD %s does not exist in strategic_directives_v2 -- refusing to switch a claim onto a phantom id.', p_new_sd_id));
    END IF;
    IF v_new_sd_status IN ('completed', 'cancelled', 'deferred') THEN
      RETURN jsonb_build_object(
        'success', FALSE,
        'error', 'sd_terminal_status',
        'status', v_new_sd_status,
        'message', format('[SWITCH_SD_TERMINAL] SD %s is in terminal status %s -- refusing to switch a claim onto a finished/cancelled/deferred SD.', p_new_sd_id, v_new_sd_status));
    END IF;
  ELSE
    SELECT qf.status INTO v_new_qf_status FROM quick_fixes qf WHERE qf.id = p_new_sd_id FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', FALSE,
        'error', 'sd_not_found',
        'message', format('[SWITCH_QF_NOT_FOUND] Quick-fix %s does not exist in quick_fixes -- refusing to switch a claim onto a phantom id.', p_new_sd_id));
    END IF;
    IF v_new_qf_status IN ('completed', 'cancelled', 'escalated') THEN
      RETURN jsonb_build_object(
        'success', FALSE,
        'error', 'sd_terminal_status',
        'status', v_new_qf_status,
        'message', format('[SWITCH_QF_TERMINAL] Quick-fix %s is in terminal status %s -- refusing to switch a claim onto a finished/cancelled/escalated quick-fix.', p_new_sd_id, v_new_qf_status));
    END IF;
  END IF;

  IF p_old_sd_id LIKE 'QF-%' THEN
    UPDATE quick_fixes
    SET claiming_session_id = NULL
    WHERE id = p_old_sd_id;
  ELSE
    UPDATE strategic_directives_v2
    SET claiming_session_id = NULL,
        active_session_id = NULL,
        is_working_on = false
    WHERE sd_key = p_old_sd_id
      AND (active_session_id = p_session_id OR claiming_session_id = p_session_id);
  END IF;

  UPDATE claude_sessions
  SET
    sd_key = p_new_sd_id,
    track = COALESCE(p_new_track, track),
    claimed_at = NOW(),
    heartbeat_at = NOW(),
    updated_at = NOW(),
    worktree_path = NULL,
    worktree_branch = NULL
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
