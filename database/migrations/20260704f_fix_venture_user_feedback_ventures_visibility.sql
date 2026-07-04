-- Migration: Fix venture_user_insert_feedback RLS — ventures visibility gap
-- SD: SD-LEO-INFRA-UNIVERSAL-VENTURE-TELEMETRY-001 (RCA follow-up, TS-1)
-- Purpose: the venture_user_insert_feedback policy (20260401_venture_user_feedback_channel.sql)
--          gates on `EXISTS (SELECT 1 FROM ventures v WHERE v.id = venture_id AND v.deleted_at
--          IS NULL)`, evaluated AS THE CALLING ROLE (anon) since it's a plain RLS expression,
--          not a SECURITY DEFINER function. ventures_select_policy on public.ventures requires
--          `current_setting('role')='service_role' OR portfolio.has_venture_access(id)` for
--          ALL roles (including anon) — has_venture_access() is an authenticated-user check
--          anon can never satisfy. So the EXISTS subquery has returned FALSE for every anon
--          caller since ventures' own RLS was tightened, silently breaking the ENTIRE
--          venture_user_insert_feedback INSERT path — confirmed live: a real MarketLens
--          feedback submission produced a genuine 401 "new row violates row-level security
--          policy" with the venture demonstrably existing and not deleted.
--          Fix: move the existence+active check into a SECURITY DEFINER helper function
--          (mirrors the existing check_feedback_rate_limit pattern) so it runs with the
--          function owner's privileges, bypassing ventures' RLS for this narrow read, without
--          granting anon direct table-level SELECT on ventures (which would leak the full
--          ventures table). Also folds in the FR-4 per-venture ingestion-enabled flag so
--          feedback forwarding, not just error forwarding, honors venture-scoped revocation.
-- Date: 2026-07-04

BEGIN;

CREATE OR REPLACE FUNCTION public.venture_exists_and_active(p_venture_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ventures v
    WHERE v.id = p_venture_id
      AND v.deleted_at IS NULL
      AND COALESCE(v.metadata->>'telemetry_ingestion_enabled', 'true') <> 'false'
  );
$$;

COMMENT ON FUNCTION public.venture_exists_and_active(uuid)
  IS 'SECURITY DEFINER: checks a venture exists, is not soft-deleted, and has telemetry ingestion enabled — bypasses ventures RLS for this narrow read so anon-role RLS policies (e.g. venture_user_insert_feedback) can gate on it without a direct SELECT grant on ventures. SD-LEO-INFRA-UNIVERSAL-VENTURE-TELEMETRY-001.';

REVOKE ALL ON FUNCTION public.venture_exists_and_active(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.venture_exists_and_active(uuid) TO anon;

DROP POLICY IF EXISTS venture_user_insert_feedback ON public.feedback;

CREATE POLICY venture_user_insert_feedback
  ON public.feedback
  FOR INSERT
  TO anon
  WITH CHECK (
    feedback_type LIKE 'user_%'
    AND venture_id IS NOT NULL
    AND public.venture_exists_and_active(venture_id)
    AND NOT public.check_feedback_rate_limit(venture_id)
  );

COMMIT;

-- ============================================================
-- ROLLBACK (manual, if needed — restores the original, RLS-broken EXISTS subquery):
-- ============================================================
-- BEGIN;
-- DROP POLICY IF EXISTS venture_user_insert_feedback ON public.feedback;
-- CREATE POLICY venture_user_insert_feedback ON public.feedback FOR INSERT TO anon
--   WITH CHECK (
--     feedback_type LIKE 'user_%' AND venture_id IS NOT NULL
--     AND EXISTS (SELECT 1 FROM public.ventures v WHERE v.id = venture_id AND v.deleted_at IS NULL)
--     AND NOT public.check_feedback_rate_limit(venture_id)
--   );
-- REVOKE EXECUTE ON FUNCTION public.venture_exists_and_active(uuid) FROM anon;
-- DROP FUNCTION IF EXISTS public.venture_exists_and_active(uuid);
-- COMMIT;
