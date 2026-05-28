-- SD-LEO-INFRA-AUTOMATE-STAGE-CASCADE-001 / FR-C
-- Migration: eva_cascade_errors + cascade_watcher_heartbeats
-- Design rationale: see retrospective + database-agent evidence row
--   sub_agent_execution_results.sd_id=74108dbf-766e-4f4c-958f-786ff1bc16fb, phase='PLAN'
--
-- Conventions mirror eva_vision_scores (SD-CRONGENIUS-LEO-INFRA-MAKE-HEAL-VISION-001):
--   - gen_random_uuid() primary keys
--   - timestamptz (NOT timestamp) for all temporal cols
--   - metadata jsonb NOT NULL DEFAULT '{}'::jsonb for forward-compat
--   - RLS posture: authenticated SELECT + service_role ALL (mirrors eva_arch_plans/eva_vision_*)
--
-- Rollback (manual, NOT a migration):
--   DROP TABLE IF EXISTS public.cascade_watcher_heartbeats;
--   DROP TABLE IF EXISTS public.eva_cascade_errors;

BEGIN;

-- ============================================================================
-- 1. eva_cascade_errors — refusal log for cascade pipeline stage transitions
-- ============================================================================
-- Each row records a refusal/failure at one of two pipeline transitions:
--   stage='vision_to_archplan'      : vision exists, archplan generation refused
--   stage='archplan_to_orchestrator': archplan exists, orchestrator gen refused
--
-- archplan_key is TEXT NULLABLE (NOT a FK) because:
--   - At stage='vision_to_archplan' refusal, the archplan does not yet exist.
--   - When it does exist later, we still want the historical refusal record
--     even if eva_architecture_plans rows are pruned/renamed.
--   - eva_architecture_plans.plan_key is varchar (already authoritative);
--     storing the key lets us soft-join without coupling lifecycles.
--
-- vision_id IS a FK (vision must exist for any refusal in this pipeline).
-- ON DELETE CASCADE: if a vision is hard-deleted, its refusal log goes too —
-- this is acceptable because the vision is the unit of analysis, and orphaned
-- refusal rows referencing a missing vision would be useless for remediation.

CREATE TABLE IF NOT EXISTS public.eva_cascade_errors (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  vision_id           uuid        NOT NULL REFERENCES public.eva_vision_documents(id) ON DELETE CASCADE,
  archplan_key        text        NULL,
  stage               text        NOT NULL,
  error_code          text        NOT NULL,
  error_message       text        NOT NULL,
  remediation_command text        NULL,
  metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  resolved_at         timestamptz NULL,
  resolved_by         text        NULL,
  CONSTRAINT eva_cascade_errors_stage_chk
    CHECK (stage IN ('vision_to_archplan','archplan_to_orchestrator')),
  CONSTRAINT eva_cascade_errors_resolved_pair_chk
    CHECK (
      (resolved_at IS NULL AND resolved_by IS NULL) OR
      (resolved_at IS NOT NULL AND resolved_by IS NOT NULL)
    ),
  CONSTRAINT eva_cascade_errors_error_code_nonempty_chk
    CHECK (length(btrim(error_code)) > 0),
  CONSTRAINT eva_cascade_errors_error_message_nonempty_chk
    CHECK (length(btrim(error_message)) > 0)
);

-- One OPEN refusal per (vision_id, stage, error_code).
-- ON CONFLICT target: (vision_id, stage, error_code) WHERE resolved_at IS NULL
CREATE UNIQUE INDEX IF NOT EXISTS eva_cascade_errors_open_uniq
  ON public.eva_cascade_errors (vision_id, stage, error_code)
  WHERE resolved_at IS NULL;

-- Lookup index for "all refusals for a vision" (resolved or not), most-recent-first.
CREATE INDEX IF NOT EXISTS eva_cascade_errors_vision_created_idx
  ON public.eva_cascade_errors (vision_id, created_at DESC);

-- Lookup index for "open refusals by stage" used by the dashboard.
CREATE INDEX IF NOT EXISTS eva_cascade_errors_stage_open_idx
  ON public.eva_cascade_errors (stage, created_at DESC)
  WHERE resolved_at IS NULL;

-- updated_at maintenance trigger (re-uses existing update_updated_at_column())
DROP TRIGGER IF EXISTS trg_eva_cascade_errors_updated_at ON public.eva_cascade_errors;
CREATE TRIGGER trg_eva_cascade_errors_updated_at
  BEFORE UPDATE ON public.eva_cascade_errors
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE  public.eva_cascade_errors                     IS 'Refusal log for cascade pipeline (vision->archplan->orchestrator). Open rows have resolved_at IS NULL.';
COMMENT ON COLUMN public.eva_cascade_errors.archplan_key        IS 'TEXT not FK: stage=vision_to_archplan refusals occur before the archplan exists. Soft-join to eva_architecture_plans.plan_key.';
COMMENT ON COLUMN public.eva_cascade_errors.remediation_command IS 'Suggested operator action, e.g. "node scripts/archplan-command.mjs --vision VISION-FOO-L2-001"';
COMMENT ON COLUMN public.eva_cascade_errors.stage               IS 'vision_to_archplan | archplan_to_orchestrator';

-- RLS posture (mirror eva_vision_scores / eva_arch_plans precedent):
--   - authenticated: SELECT only (dashboards, sweep, /heal readers)
--   - service_role:  ALL    (watcher writes, refusal-gate writes, resolution updates)
ALTER TABLE public.eva_cascade_errors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS eva_cascade_errors_authenticated_select ON public.eva_cascade_errors;
CREATE POLICY eva_cascade_errors_authenticated_select
  ON public.eva_cascade_errors
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS eva_cascade_errors_service_role_all ON public.eva_cascade_errors;
CREATE POLICY eva_cascade_errors_service_role_all
  ON public.eva_cascade_errors
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 2. cascade_watcher_heartbeats — per-run heartbeat for FR-B watcher
-- ============================================================================
-- One row per watcher run. started_at default now(); finished_at + exit_code
-- updated on completion. refusal_count / success_count are running tallies the
-- watcher updates throughout the run, so updated_at trigger applies.

CREATE TABLE IF NOT EXISTS public.cascade_watcher_heartbeats (
  run_id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  hostname       text        NOT NULL DEFAULT '',
  pid            integer     NULL,
  started_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz NULL,
  exit_code      integer     NULL,
  refusal_count  integer     NOT NULL DEFAULT 0,
  success_count  integer     NOT NULL DEFAULT 0,
  metadata       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cascade_watcher_heartbeats_counts_chk
    CHECK (refusal_count >= 0 AND success_count >= 0),
  CONSTRAINT cascade_watcher_heartbeats_finished_pair_chk
    CHECK (
      (finished_at IS NULL AND exit_code IS NULL) OR
      (finished_at IS NOT NULL AND exit_code IS NOT NULL)
    )
);

-- "Most recent runs" and "is any watcher live?" both want started_at desc.
CREATE INDEX IF NOT EXISTS cascade_watcher_heartbeats_started_idx
  ON public.cascade_watcher_heartbeats (started_at DESC);

-- Open (still-running) runs lookup — partial index keeps it tiny.
CREATE INDEX IF NOT EXISTS cascade_watcher_heartbeats_open_idx
  ON public.cascade_watcher_heartbeats (started_at DESC)
  WHERE finished_at IS NULL;

DROP TRIGGER IF EXISTS trg_cascade_watcher_heartbeats_updated_at ON public.cascade_watcher_heartbeats;
CREATE TRIGGER trg_cascade_watcher_heartbeats_updated_at
  BEFORE UPDATE ON public.cascade_watcher_heartbeats
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE  public.cascade_watcher_heartbeats              IS 'Per-run heartbeat for FR-B cascade watcher daemon. One row per process invocation.';
COMMENT ON COLUMN public.cascade_watcher_heartbeats.refusal_count IS 'Cumulative refusals observed by this watcher run (writes to eva_cascade_errors).';
COMMENT ON COLUMN public.cascade_watcher_heartbeats.success_count IS 'Cumulative successful cascade transitions in this run.';

ALTER TABLE public.cascade_watcher_heartbeats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cascade_watcher_heartbeats_authenticated_select ON public.cascade_watcher_heartbeats;
CREATE POLICY cascade_watcher_heartbeats_authenticated_select
  ON public.cascade_watcher_heartbeats
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS cascade_watcher_heartbeats_service_role_all ON public.cascade_watcher_heartbeats;
CREATE POLICY cascade_watcher_heartbeats_service_role_all
  ON public.cascade_watcher_heartbeats
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 3. Backfill: ARCH-CRONGENIUS-001.venture_id (Risk-11)
-- ============================================================================
-- Vision VISION-CRONGENIUS-API-L2-001 (id 83bc1fca-d4cd-4548-8359-d8dfe41735ca)
-- has venture_id=6e23ad2b-2f6c-45b2-8ee9-e9e69a32bb66; the corresponding archplan
-- ARCH-CRONGENIUS-001 currently has venture_id IS NULL — fix in same migration.

UPDATE public.eva_architecture_plans
   SET venture_id = '6e23ad2b-2f6c-45b2-8ee9-e9e69a32bb66'
 WHERE plan_key   = 'ARCH-CRONGENIUS-001'
   AND venture_id IS NULL;

COMMIT;

-- ============================================================================
-- Application-level ON CONFLICT pattern (reference, not executed here)
-- ============================================================================
-- Writers (refusal gate / watcher) should upsert open refusals like this:
--
-- INSERT INTO public.eva_cascade_errors
--   (vision_id, archplan_key, stage, error_code, error_message,
--    remediation_command, metadata)
-- VALUES
--   ($1, $2, $3, $4, $5, $6, $7)
-- ON CONFLICT (vision_id, stage, error_code) WHERE resolved_at IS NULL
-- DO UPDATE
--   SET error_message       = EXCLUDED.error_message,
--       remediation_command = EXCLUDED.remediation_command,
--       metadata            = public.eva_cascade_errors.metadata
--                             || EXCLUDED.metadata,
--       updated_at          = now()
-- RETURNING id, (xmax = 0) AS inserted;
--
-- Note: PostgreSQL supports partial-index ON CONFLICT targets only when the
-- WHERE clause matches the index predicate exactly (Postgres >=9.5). This
-- migration's eva_cascade_errors_open_uniq predicate is `WHERE resolved_at IS NULL`,
-- so the ON CONFLICT clause must echo that exact predicate.
