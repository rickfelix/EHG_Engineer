-- SD-LEO-INFRA-UNIFY-VENTURE-STAGE-001-A — ROLLBACK companion
-- Reverts 20260529_create_venture_stages_unified.sql.
--
-- Removes ONLY the objects that migration created:
--   * venture_stages table (+ its triggers)
--   * venture_stages_audit table
--   * the 2 uni-directional sync triggers on the legacy tables + their fns
--   * the sync upsert helper fn
--   * the audit/append-only trigger fns for venture_stages
--   * the supabase_realtime publication entry for venture_stages
--   * public.canonical_rule(text,text) — ONLY if this migration created it
--     (i.e. ONLY if migration 20260519 has NOT been applied). Guarded so we
--     never drop a function another migration legitimately owns.
--
-- Leaves stage_config and lifecycle_stage_config 100% intact (structure + data).
-- Leaves public.set_updated_at() intact (shared, pre-existing).
-- Re-runnable: every DROP uses IF EXISTS / guarded blocks.
--
-- NOTE on transactions: apply-migration.js wraps the whole file in a single
-- transaction, so this rollback intentionally does NOT issue its own BEGIN/COMMIT.

-- -------------------------------------------------------------------------
-- 1. Remove the supabase_realtime publication entry (guarded)
-- -------------------------------------------------------------------------
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.venture_stages;
EXCEPTION
  WHEN undefined_object THEN
    NULL; -- table not in publication, or publication absent; no-op
  WHEN undefined_table THEN
    NULL; -- venture_stages already dropped; no-op
END $$;

-- -------------------------------------------------------------------------
-- 2. Drop the uni-directional sync triggers on the LEGACY tables.
--    (Removing only triggers we added; the tables themselves are untouched.)
-- -------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_stage_config_sync_venture_stages ON public.stage_config;
DROP TRIGGER IF EXISTS trg_lifecycle_sync_venture_stages ON public.lifecycle_stage_config;

DROP FUNCTION IF EXISTS public.tg_stage_config_sync_venture_stages();
DROP FUNCTION IF EXISTS public.tg_lifecycle_sync_venture_stages();
DROP FUNCTION IF EXISTS public.fn_sync_venture_stages_upsert(INTEGER);

-- -------------------------------------------------------------------------
-- 3. Drop triggers on venture_stages / venture_stages_audit, then the tables.
--    Dropping the tables removes their attached triggers anyway, but we drop
--    explicitly first for clarity and to make the fn drops safe.
-- -------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_venture_stages_audit ON public.venture_stages;
DROP TRIGGER IF EXISTS trg_venture_stages_set_updated_at ON public.venture_stages;
DROP TRIGGER IF EXISTS trg_venture_stages_audit_immutable ON public.venture_stages_audit;

DROP TABLE IF EXISTS public.venture_stages_audit;
DROP TABLE IF EXISTS public.venture_stages;

DROP FUNCTION IF EXISTS public.fn_venture_stages_audit_trigger();
DROP FUNCTION IF EXISTS public.fn_venture_stages_audit_immutable();

-- -------------------------------------------------------------------------
-- 4. Drop public.canonical_rule(text,text) ONLY if migration 20260519 did NOT
--    create it. Heuristic: 20260519 also creates a CHECK constraint named
--    stage_config_canonical_rule_check on stage_config. If that constraint
--    exists, 20260519 owns canonical_rule -> we must NOT drop it. If it does
--    NOT exist, this migration is the sole creator -> safe to drop.
-- -------------------------------------------------------------------------
DO $$
DECLARE
  v_20260519_owns BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stage_config_canonical_rule_check'
      AND conrelid = 'public.stage_config'::regclass
  ) INTO v_20260519_owns;

  IF v_20260519_owns THEN
    RAISE NOTICE 'Retaining public.canonical_rule(text,text): migration 20260519 '
                 '(stage_config_canonical_rule_check) owns it.';
  ELSE
    DROP FUNCTION IF EXISTS public.canonical_rule(TEXT, TEXT);
    RAISE NOTICE 'Dropped public.canonical_rule(text,text): created by this migration only.';
  END IF;
END $$;

-- -------------------------------------------------------------------------
-- 5. Restore the 4 read-only RPCs to their ORIGINAL legacy-table definitions
--    so callers keep working after rollback (they would otherwise reference the
--    now-dropped venture_stages and fail at call time).
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_gate_stages()
RETURNS integer[]
LANGUAGE sql
STABLE
AS $$
  SELECT ARRAY_AGG(stage_number ORDER BY stage_number)
  FROM stage_config
  WHERE gate_type != 'none';
$$;

CREATE OR REPLACE FUNCTION public.get_sd_required_stages()
RETURNS TABLE(stage_number integer, stage_name character varying, sd_suffix character varying)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT lsc.stage_number, lsc.stage_name, lsc.sd_suffix
  FROM lifecycle_stage_config lsc
  WHERE lsc.sd_required = true
  ORDER BY lsc.stage_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_stage_info(p_stage_number integer)
RETURNS TABLE(stage_number integer, stage_name character varying, phase_name character varying, work_type character varying, sd_required boolean, advisory_enabled boolean)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT lsc.stage_number, lsc.stage_name, lsc.phase_name, lsc.work_type, lsc.sd_required, lsc.advisory_enabled
  FROM lifecycle_stage_config lsc
  WHERE lsc.stage_number = p_stage_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_stages_by_phase(p_phase_number integer)
RETURNS TABLE(stage_number integer, stage_name character varying, work_type character varying)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT lsc.stage_number, lsc.stage_name, lsc.work_type
  FROM lifecycle_stage_config lsc
  WHERE lsc.phase_number = p_phase_number
  ORDER BY lsc.stage_number;
END;
$$;
