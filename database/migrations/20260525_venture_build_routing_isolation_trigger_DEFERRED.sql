-- ============================================================================
-- Migration: 20260525_venture_build_routing_isolation_trigger_DEFERRED.sql
-- SD: SD-LEO-INFRA-RECONCILE-VENTURE-BUILD-001 (FR-5) — FAIL-CLOSED ENFORCEMENT
--
-- ⚠️  DEFERRED — DO NOT APPLY YET. ⚠️
--
-- This migration enables a fail-closed BEFORE INSERT OR UPDATE OF
-- target_application trigger on strategic_directives_v2. Applying it before the
-- leo-create-sd path is updated to AUTO-REGISTER a venture in public.applications
-- (BEFORE creating its SD) would block SD creation FLEET-WIDE for any venture
-- name not yet present in the registry — including in-flight parallel sessions.
--
-- PRECONDITIONS before applying this file (all must be true):
--   1. The additive migration (20260525_venture_build_routing_isolation_additive.sql)
--      has been applied and `public.applications` is populated (0 orphans).
--   2. leo-create-sd.js (and any other SD-creation path) auto-registers the
--      target_application in public.applications before INSERTing the SD row.
--   3. A guard exists so legitimate no-venture LEO work (sd_type in
--      infrastructure/governance/leo/documentation/refactor, or
--      metadata.engineering_only=true) defaults to a registered platform repo
--      (EHG / EHG_Engineer), mirroring lib/eva/bridge/sd-router.js.
--
-- Apply with: node scripts/run-sql-migration.js \
--   database/migrations/20260525_venture_build_routing_isolation_trigger_DEFERRED.sql
-- (or via the proven single-transaction direct-connection pattern).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Pre-flight: assert backfill covered every existing row. Fails LOUD so the
-- trigger is never activated against an inconsistent table.
-- ---------------------------------------------------------------------------
DO $preflight$
DECLARE orphan_cnt integer;
BEGIN
  SELECT count(*) INTO orphan_cnt
  FROM public.strategic_directives_v2 s
  LEFT JOIN public.applications a ON lower(a.name) = lower(s.target_application)
  WHERE s.target_application IS NOT NULL AND a.id IS NULL;
  IF orphan_cnt > 0 THEN
    RAISE EXCEPTION 'Backfill incomplete: % sd_v2 rows have target_application not in registry. Run the additive migration first.', orphan_cnt;
  END IF;
END
$preflight$;

-- ---------------------------------------------------------------------------
-- Fail-closed validating function. Registry-backed, case-insensitive.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_target_application_registry()
RETURNS trigger LANGUAGE plpgsql AS $enforce$
BEGIN
  -- Fail-closed: target_application must be NON-NULL and registry-known.
  IF NEW.target_application IS NULL OR btrim(NEW.target_application) = '' THEN
    RAISE EXCEPTION 'target_application is required (fail-closed routing). SD %', NEW.sd_key
      USING HINT = 'Set target_application to a registered application name (see public.applications).';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.applications a
    WHERE lower(a.name) = lower(NEW.target_application) AND a.status = 'active'
  ) THEN
    RAISE EXCEPTION 'target_application % is not a registered active application. SD %',
      NEW.target_application, NEW.sd_key
      USING HINT = 'Register the application in public.applications first, or fix the typo.';
  END IF;
  RETURN NEW;
END
$enforce$;

-- Fire ONLY when target_application is set/changed => historical completed
-- rows are never re-validated by unrelated UPDATEs (non-breaking).
DROP TRIGGER IF EXISTS trg_enforce_target_application_registry ON public.strategic_directives_v2;
CREATE TRIGGER trg_enforce_target_application_registry
  BEFORE INSERT OR UPDATE OF target_application ON public.strategic_directives_v2
  FOR EACH ROW EXECUTE FUNCTION public.enforce_target_application_registry();

COMMIT;

-- ============================================================================
-- ROLLBACK (manual, if needed):
--   DROP TRIGGER IF EXISTS trg_enforce_target_application_registry ON public.strategic_directives_v2;
--   DROP FUNCTION IF EXISTS public.enforce_target_application_registry();
-- ============================================================================
