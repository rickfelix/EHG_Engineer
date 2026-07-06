-- REFERENCE ONLY — golden reference, never on an apply path.
-- An APPLICATION of this reference lands under database/migrations/ with
-- requires_chairman_apply pre-flagged at sourcing, stages with its DOWN stanza,
-- and applies at a cutover — never on merge.
-- Source SD: SD-LEO-INFRA-GOLDEN-REFERENCES-CANONICAL-001-B
-- Hardening lineage: database/migrations/20251216_fix_security_definer_views.sql

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
-- Hardened pin (remediation lineage): pg_catalog first, never bare `public`.
-- The modal estate form `SET search_path = public` is the WEAKER survivor —
-- it leaves the function open to malicious same-name objects in public
-- schemas shadowing pg_catalog builtins.
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_row deviation_requests;
BEGIN
  -- AUTHZ (in-function, because SECURITY DEFINER bypasses RLS): only the
  -- service role or an authenticated caller may submit. Applications adapt
  -- this predicate to their role model; deleting it is never a legal
  -- adaptation.
  IF current_setting('request.jwt.claims', true) IS NULL
     AND current_user NOT IN ('service_role', 'postgres') THEN
    RAISE insufficient_privilege
      USING MESSAGE = 'submit_deviation_request: caller not authorized';
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
  INSERT INTO deviation_requests (venture_id, expected, actual, reason, requested_by)
  VALUES (p_venture_id, p_expected, p_actual, p_reason, current_user)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- Execution surface: closed by default, opened to named roles only.
-- PUBLIC/anon never call a definer function (estate precedents:
-- rescan_stage_20, fn_advance_venture_stage).
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
