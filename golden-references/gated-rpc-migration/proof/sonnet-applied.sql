-- Application of golden reference: gated-rpc-migration (escalation_requests / submit_escalation_request).
-- Chairman-gated migration: requires_chairman_apply pre-flagged at sourcing, stages with the
-- DOWN stanza below, and applies at a cutover — never on merge.
-- Hardening basis: PostgreSQL CVE-2018-1058 guidance for SECURITY DEFINER — search_path pinned
-- with pg_temp explicitly LAST; caller identity read from request.jwt.claims, never current_user.

-- ============================================================================
-- UP
-- ============================================================================

-- Governed table: clients never write here directly (no INSERT grant, RLS on).
CREATE TABLE IF NOT EXISTS escalation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL,
  summary TEXT NOT NULL,
  detail TEXT NOT NULL,
  -- CHECK constraints are the last line of defense; the RPC validates FIRST
  -- because supabase-js silently swallows CHECK violations on direct writes —
  -- a write can "succeed" client-side while the row never lands.
  severity TEXT NOT NULL
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  disposition TEXT NOT NULL DEFAULT 'open'
    CHECK (disposition IN ('open', 'acknowledged', 'resolved')),
  requested_by TEXT NOT NULL CHECK (length(requested_by) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS ON with a read-only policy. NOTE (the subtle killer): RLS does NOT
-- constrain the SECURITY DEFINER function below — definer functions bypass
-- RLS on every table they touch. Authorization therefore lives IN the
-- function body (see AUTHZ block), not in policies.
ALTER TABLE escalation_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS escalation_requests_read ON escalation_requests;
CREATE POLICY escalation_requests_read ON escalation_requests
  FOR SELECT USING (true);

-- The gated write path. SECURITY DEFINER so the table needs no INSERT grant.
CREATE OR REPLACE FUNCTION submit_escalation_request(
  p_venture_id UUID,
  p_summary TEXT,
  p_detail TEXT,
  p_severity TEXT
)
RETURNS escalation_requests
LANGUAGE plpgsql
SECURITY DEFINER
-- Hardened pin (CVE-2018-1058 class): pg_temp explicitly LAST. Unless
-- positioned, pg_temp is implicitly searched FIRST for relations — a
-- malicious temporary table could shadow the governed table inside this
-- definer. pg_catalog needs no listing (always first for builtins); the
-- hazard is temp-schema and cross-schema relation shadowing, not builtins.
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row escalation_requests;
  v_caller_role TEXT;
BEGIN
  -- AUTHZ (in-function, because SECURITY DEFINER bypasses RLS): read the
  -- CALLER's identity, never current_user — inside a definer, current_user
  -- is the function OWNER, so any current_user check is dead code. Under
  -- PostgREST the caller role lives in request.jwt.claims->>'role'; for
  -- direct DB sessions fall back to session_user. Fail CLOSED on anything
  -- not explicitly allowed.
  v_caller_role := coalesce(
    current_setting('request.jwt.claims', true)::jsonb ->> 'role',
    session_user::text
  );
  IF v_caller_role NOT IN ('authenticated', 'service_role', 'postgres') THEN
    RAISE insufficient_privilege
      USING MESSAGE = 'submit_escalation_request: caller role '
        || coalesce(v_caller_role, '<none>') || ' not authorized';
  END IF;

  -- Argument validation FIRST, with a stable RAISE error contract — the
  -- client sees a real error, never a silent no-op.
  IF p_venture_id IS NULL THEN
    RAISE EXCEPTION 'submit_escalation_request: venture_id is required'
      USING ERRCODE = '22004';
  END IF;
  IF p_summary IS NULL OR length(trim(p_summary)) = 0 THEN
    RAISE EXCEPTION 'submit_escalation_request: summary is required'
      USING ERRCODE = '22004';
  END IF;
  IF p_detail IS NULL OR length(trim(p_detail)) < 20 THEN
    RAISE EXCEPTION 'submit_escalation_request: detail must be at least 20 chars'
      USING ERRCODE = '22004';
  END IF;
  IF p_severity IS NULL OR p_severity NOT IN ('low', 'medium', 'high', 'critical') THEN
    RAISE EXCEPTION 'submit_escalation_request: severity must be one of low, medium, high, critical'
      USING ERRCODE = '22004';
  END IF;

  -- Write, then RETURN the row (verify-by-read-back: the caller receives the
  -- persisted row, so "succeeded but nothing landed" is impossible).
  -- requested_by records the CALLER (jwt sub, else session_user) — never
  -- current_user, which is the definer/owner inside this function.
  INSERT INTO escalation_requests (venture_id, summary, detail, severity, requested_by)
  VALUES (p_venture_id, p_summary, p_detail, p_severity, coalesce(
    current_setting('request.jwt.claims', true)::jsonb ->> 'sub',
    session_user::text
  ))
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- Execution surface: closed by default, opened to named roles only.
-- PUBLIC/anon never call a definer function. NOTE: functions are created
-- PUBLIC-executable by default, so the REVOKE below is load-bearing.
REVOKE EXECUTE ON FUNCTION submit_escalation_request(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION submit_escalation_request(UUID, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION submit_escalation_request(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION submit_escalation_request(UUID, TEXT, TEXT, TEXT) TO service_role;

-- ============================================================================
-- DOWN (staged rollback — every gated migration carries one)
-- ============================================================================
-- DROP FUNCTION IF EXISTS submit_escalation_request(UUID, TEXT, TEXT, TEXT);
-- DROP POLICY IF EXISTS escalation_requests_read ON escalation_requests;
-- DROP TABLE IF EXISTS escalation_requests;
