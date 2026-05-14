-- Migration: Pocock glossary schema (Child A of SD-LEO-PROTOCOL-POCOCK-PATTERNS-ORCH-001)
-- Tables: pocock_glossary_terms, pocock_oos_findings
-- RPC: promote_glossary_term(uuid, text) SECURITY DEFINER
-- RLS: service_role full; authenticated read-only on approved
-- Idempotent: IF NOT EXISTS guards throughout

BEGIN;

-- ============================================================================
-- TABLE: pocock_glossary_terms
-- Canonical writer surface for LEO glossary. CONTEXT.md is rendered from this.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.pocock_glossary_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term text UNIQUE NOT NULL,
  definition text NOT NULL,
  avoid_aliases text[] NOT NULL DEFAULT ARRAY[]::text[],
  relationships text[] NOT NULL DEFAULT ARRAY[]::text[],
  occurrence_count int NOT NULL DEFAULT 0,
  confidence_score numeric(4,3) NOT NULL DEFAULT 0.000,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'deprecated')),
  source_events jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  approved_by text
);

CREATE INDEX IF NOT EXISTS idx_pocock_glossary_terms_status
  ON public.pocock_glossary_terms (status);

CREATE INDEX IF NOT EXISTS idx_pocock_glossary_terms_created_at
  ON public.pocock_glossary_terms (created_at DESC);

ALTER TABLE public.pocock_glossary_terms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pocock_glossary_terms_service_role_all
  ON public.pocock_glossary_terms;
CREATE POLICY pocock_glossary_terms_service_role_all
  ON public.pocock_glossary_terms
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS pocock_glossary_terms_authenticated_read_approved
  ON public.pocock_glossary_terms;
CREATE POLICY pocock_glossary_terms_authenticated_read_approved
  ON public.pocock_glossary_terms
  FOR SELECT
  TO authenticated
  USING (status = 'approved');

-- ============================================================================
-- TABLE: pocock_oos_findings
-- Out-of-scope finding log (rejected glossary candidates, deletion-audit feed)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.pocock_oos_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  description text NOT NULL,
  rationale text NOT NULL,
  rejected_in_sd text,
  rejected_in_brainstorm uuid,
  source jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pocock_oos_findings_category
  ON public.pocock_oos_findings (category);

CREATE INDEX IF NOT EXISTS idx_pocock_oos_findings_created_at
  ON public.pocock_oos_findings (created_at DESC);

ALTER TABLE public.pocock_oos_findings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pocock_oos_findings_service_role_all
  ON public.pocock_oos_findings;
CREATE POLICY pocock_oos_findings_service_role_all
  ON public.pocock_oos_findings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS pocock_oos_findings_authenticated_read
  ON public.pocock_oos_findings;
CREATE POLICY pocock_oos_findings_authenticated_read
  ON public.pocock_oos_findings
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- RPC: promote_glossary_term(p_term_id uuid, p_approved_by text)
-- Flips draft → approved for the specified row. Emits audit_log entry.
-- SECURITY DEFINER; explicit role check for anon protection.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.promote_glossary_term(
  p_term_id uuid,
  p_approved_by text
)
RETURNS public.pocock_glossary_terms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_previous_status text;
  v_updated_row public.pocock_glossary_terms;
BEGIN
  -- Explicit role check: block anon role (defense-in-depth alongside RLS)
  IF current_setting('request.jwt.claim.role', true) = 'anon' THEN
    RAISE EXCEPTION 'permission denied: anon role cannot promote glossary terms'
      USING ERRCODE = '42501';
  END IF;

  -- Read previous status
  SELECT status INTO v_previous_status
  FROM public.pocock_glossary_terms
  WHERE id = p_term_id
  FOR UPDATE;

  IF v_previous_status IS NULL THEN
    RAISE EXCEPTION 'glossary term not found: %', p_term_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_previous_status <> 'draft' THEN
    RAISE EXCEPTION 'glossary term not in draft status (current: %)', v_previous_status
      USING ERRCODE = 'P0001';
  END IF;

  -- Flip to approved
  UPDATE public.pocock_glossary_terms
  SET status      = 'approved',
      approved_at = now(),
      approved_by = p_approved_by,
      updated_at  = now()
  WHERE id = p_term_id
  RETURNING * INTO v_updated_row;

  -- Audit trail (best-effort; if audit_log schema differs, swallow gracefully)
  BEGIN
    INSERT INTO public.audit_log (
      action,
      operator,
      target_table,
      target_id,
      previous_value,
      new_value,
      created_at
    ) VALUES (
      'glossary_term_approved',
      p_approved_by,
      'pocock_glossary_terms',
      p_term_id::text,
      jsonb_build_object('status', v_previous_status),
      jsonb_build_object('status', 'approved', 'term', v_updated_row.term),
      now()
    );
  EXCEPTION WHEN OTHERS THEN
    -- audit_log table may not match this schema in all envs; do not block promotion
    RAISE NOTICE 'audit_log insert failed (non-fatal): %', SQLERRM;
  END;

  RETURN v_updated_row;
END;
$$;

REVOKE ALL ON FUNCTION public.promote_glossary_term(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.promote_glossary_term(uuid, text) TO service_role;

COMMIT;
