-- REFERENCE ONLY — golden reference, never on an apply path.
-- An APPLICATION of this reference lands under database/migrations/ with
-- requires_chairman_apply pre-flagged at sourcing, stages with its DOWN stanza,
-- and applies at a cutover — never on merge.
-- Source SD: SD-LEO-INFRA-GOLDEN-REFERENCES-CANONICAL-001-B
-- Hardening basis: PostgreSQL CVE-2018-1058 guidance for SECURITY DEFINER
-- (pin search_path with pg_temp explicitly LAST; never authorize on
-- current_user inside a definer). The estate's own precedents are
-- inconsistent on these points — this reference is the corrective, not a
-- citation of existing estate practice.

-- ============================================================================
-- UP
-- ============================================================================

-- Governed table: clients never write here directly (no INSERT grant, RLS on).
CREATE TABLE IF NOT EXISTS deviation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL,
  expected TEXT NOT NULL,
  actual TEXT NOT NULL,
  reason TEXT NOT NULL,
  -- CHECK constraints are the last line of defense; the RPC validates FIRST
  -- because supabase-js silently swallows CHECK violations on direct writes —
  -- a write can "succeed" client-side while the row never lands.
  disposition TEXT NOT NULL DEFAULT 'pending'
    CHECK (disposition IN ('pending', 'approved', 'rejected')),
  requested_by TEXT NOT NULL CHECK (length(requested_by) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS ON with a read-only policy. NOTE (the subtle killer): RLS does NOT
-- constrain the SECURITY DEFINER function below — definer functions bypass
-- RLS on every table they touch. Authorization therefore lives IN the
-- function body (see AUTHZ block), not in policies.
ALTER TABLE deviation_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deviation_requests_read ON deviation_requests;
CREATE POLICY deviation_requests_read ON deviation_requests
  FOR SELECT USING (true);

-- The gated write path. SECURITY DEFINER so the table needs no INSERT grant.
CREATE OR REPLACE FUNCTION submit_deviation_request(
  p_venture_id UUID,
  p_expected TEXT,
  p_actual TEXT,
  p_reason TEXT
)
RETURNS deviation_requests
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
  v_row deviation_requests;
  v_caller_role TEXT;
BEGIN
  -- AUTHZ (in-function, because SECURITY DEFINER bypasses RLS): read the
  -- CALLER's identity, never current_user — inside a definer, current_user
  -- is the function OWNER, so any current_user check is dead code. Under
  -- PostgREST the caller role lives in request.jwt.claims->>'role'; for
  -- direct DB sessions fall back to session_user. Fail CLOSED on anything
  -- not explicitly allowed. Applications adapt the allowed-role list;
  -- deleting the block or keying it on current_user is never a legal
  -- adaptation.
  v_caller_role := coalesce(
    current_setting('request.jwt.claims', true)::jsonb ->> 'role',
    session_user::text
  );
  IF v_caller_role NOT IN ('authenticated', 'service_role', 'postgres') THEN
    RAISE insufficient_privilege
      USING MESSAGE = 'submit_deviation_request: caller role '
        || coalesce(v_caller_role, '<none>') || ' not authorized';
  END IF;

  -- Argument validation FIRST, with a stable RAISE error contract — the
  -- client sees a real error, never a silent no-op.
  IF p_venture_id IS NULL THEN
    RAISE EXCEPTION 'submit_deviation_request: venture_id is required'
      USING ERRCODE = '22004';
  END IF;
  IF p_expected IS NULL OR length(trim(p_expected)) = 0 THEN
    RAISE EXCEPTION 'submit_deviation_request: expected is required'
      USING ERRCODE = '22004';
  END IF;
  IF p_actual IS NULL OR length(trim(p_actual)) = 0 THEN
    RAISE EXCEPTION 'submit_deviation_request: actual is required'
      USING ERRCODE = '22004';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'submit_deviation_request: reason must be at least 10 chars'
      USING ERRCODE = '22004';
  END IF;

  -- Write, then RETURN the row (verify-by-read-back: the caller receives the
  -- persisted row, so "succeeded but nothing landed" is impossible).
  -- requested_by records the CALLER (jwt sub, else session_user) — never
  -- current_user, which is the definer/owner inside this function.
  INSERT INTO deviation_requests (venture_id, expected, actual, reason, requested_by)
  VALUES (p_venture_id, p_expected, p_actual, p_reason, coalesce(
    current_setting('request.jwt.claims', true)::jsonb ->> 'sub',
    session_user::text
  ))
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- Execution surface: closed by default, opened to named roles only.
-- PUBLIC/anon never call a definer function. NOTE: functions are created
-- PUBLIC-executable by default, so the REVOKE below is load-bearing — and
-- several estate precedents omit it; this reference is the corrective.
REVOKE EXECUTE ON FUNCTION submit_deviation_request(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION submit_deviation_request(UUID, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION submit_deviation_request(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION submit_deviation_request(UUID, TEXT, TEXT, TEXT) TO service_role;

-- ============================================================================
-- DOWN (staged rollback — every gated migration carries one)
-- ============================================================================
-- DROP FUNCTION IF EXISTS submit_deviation_request(UUID, TEXT, TEXT, TEXT);
-- DROP POLICY IF EXISTS deviation_requests_read ON deviation_requests;
-- DROP TABLE IF EXISTS deviation_requests;
