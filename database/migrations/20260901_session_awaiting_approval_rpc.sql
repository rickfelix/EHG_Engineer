-- QF-20260901-987: permission-prompt-blocked worker reads as alive-idle on every instrument.
--
-- A worker session waiting on a permission dialog (cd approval, commit approval, etc.) emits NO
-- signal: heartbeat daemons keep heartbeat_at fresh, no error, no coordination row. This RPC gives
-- the worker-side PreToolUse/PostToolUse hooks an atomic way to stamp/clear
-- claude_sessions.metadata.awaiting_approval_since without a read-modify-write race on the JSONB
-- column (two hooks firing back-to-back on different tool calls must not clobber each other's
-- other metadata keys, e.g. model/effort/tier_rank).
CREATE OR REPLACE FUNCTION set_session_awaiting_approval(p_session_id text, p_clear boolean DEFAULT false)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE claude_sessions
  SET metadata = CASE
    WHEN p_clear THEN (COALESCE(metadata, '{}'::jsonb) - 'awaiting_approval_since')
    ELSE jsonb_set(COALESCE(metadata, '{}'::jsonb), '{awaiting_approval_since}', to_jsonb(now()))
  END
  WHERE session_id = p_session_id;
$$;

GRANT EXECUTE ON FUNCTION set_session_awaiting_approval(text, boolean) TO service_role;
