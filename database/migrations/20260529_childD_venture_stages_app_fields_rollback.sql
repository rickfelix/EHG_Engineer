-- =============================================================================
-- ROLLBACK: Add app-only fields to venture_stages (Child D)
-- SD: SD-LEO-INFRA-UNIFY-VENTURE-STAGE-001-D
-- @approved-by: rickfelix@example.com
-- Date: 2026-05-29
--
-- Reverses 20260529_childD_venture_stages_app_fields.sql:
--   - Drops the two additive columns (gate_label, app_description).
--   - Resets component_path to NULL for all 26 rows (its pre-migration state,
--     since Child A created it NULL).
--
-- Strictly reverses Child D only. Does NOT touch any column the A/B/C backend
-- reads. Idempotent: DROP COLUMN IF EXISTS + unconditional NULL reset.
-- =============================================================================

BEGIN;

ALTER TABLE public.venture_stages DROP COLUMN IF EXISTS gate_label;
ALTER TABLE public.venture_stages DROP COLUMN IF EXISTS app_description;

UPDATE public.venture_stages SET component_path = NULL, updated_at = now()
WHERE component_path IS NOT NULL;

DO $$
DECLARE cp_remaining INT;
BEGIN
  SELECT count(*) INTO cp_remaining FROM public.venture_stages WHERE component_path IS NOT NULL;
  IF cp_remaining <> 0 THEN
    RAISE EXCEPTION 'rollback incomplete: % component_path still non-null', cp_remaining;
  END IF;
  RAISE NOTICE 'Child D rollback verified: gate_label + app_description dropped, component_path reset to NULL (26 rows).';
END $$;

COMMIT;
