-- STAGED, CHAIRMAN-GATED MIGRATION — requires_chairman_apply pre-flagged at
-- sourcing; stages with its DOWN stanza below, and applies at a cutover —
-- never on merge.
-- Adapted from golden reference: golden-references/gated-rpc-migration/migration.sql
-- Source SD: SD-LEO-INFRA-GOLDEN-REFERENCES-CANONICAL-001-B (delegate adaptation — escalation_requests)
-- Hardening lineage: database/migrations/20251216_fix_security_definer_views.sql

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
-- Hardened pin (remediation lineage): pg_catalog first, never bare `public`.
-- The modal estate form `SET search_path = public` is the WEAKER survivor —
-- it leaves the function open to malicious same-name objects in public
-- schemas shadowing pg_catalog builtins.
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_row escalation_requests;
BEGIN
  -- AUTHZ (in-function, because SECURITY DEFINER bypasses RLS): only the
  -- service role or an authenticated caller may submit. Applications adapt
  -- this predicate to their role model; deleting it is never a legal
  -- adaptation.
  IF current_setting('request.jwt.claims', true) IS NULL
     AND current_user NOT IN ('service_role', 'postgres') THEN
    RAISE insufficient_privilege
      USING MESSAGE = 'submit_escalation_request: caller not authorized';
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
  INSERT INTO escalation_requests (venture_id, summary, detail, severity, requested_by)
  VALUES (p_venture_id, p_summary, p_detail, p_severity, current_user)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- Execution surface: closed by default, opened to named roles only.
-- PUBLIC/anon never call a definer function (estate precedents:
-- rescan_stage_20, fn_advance_venture_stage).
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
