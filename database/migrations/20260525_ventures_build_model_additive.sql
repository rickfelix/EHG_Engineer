-- ============================================================================
-- Migration: 20260525_ventures_build_model_additive.sql
-- SD: SD-LEO-INFRA-RECONCILE-VENTURE-BUILD-001 (RCA 813d4c3d) — ADDITIVE / NON-BREAKING
-- Purpose: Add ventures.build_model — the SINGLE SSOT arbiter for which build path a venture
--          takes at Stage 19 ('leo_bridge' = LEO-SD bridge | 'seeded_repo' = seed+Replit-Agent+S20).
--          Resolves the un-arbitered "model schism" where the S19 entry gate and the post-stage
--          bridge hook each independently read venture_stage_work.advisory_data.build_method and
--          defaulted to 'replit_agent', so the seeded path silently won (0 SDs for CronLinter/Canvas AI).
-- Mode: IDEMPOTENT + ADDITIVE. NULLABLE with NO default → existing rows stay NULL → the arbiter
--       (lib/eva/bridge/resolve-build-model.js) resolves NULL to the safe default (seeded_repo via
--       legacy build_method), so in-flight ventures are UNAFFECTED. 'leo_bridge' is an explicit
--       per-venture opt-in (FR-3 sets it on CronLinter/Canvas AI).
-- ============================================================================

BEGIN;

ALTER TABLE public.ventures ADD COLUMN IF NOT EXISTS build_model varchar(20);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_ventures_build_model') THEN
    ALTER TABLE public.ventures
      ADD CONSTRAINT ck_ventures_build_model
      CHECK (build_model IS NULL OR build_model IN ('leo_bridge', 'seeded_repo'));
  END IF;
END $$;

COMMENT ON COLUMN public.ventures.build_model IS
  'SSOT venture build path at Stage 19: leo_bridge (LEO-SD bridge — orchestrator+child SDs) | seeded_repo (seed repo + Replit Agent + S20 gate) | NULL (arbiter default = seeded_repo until the venture EXEC loop ships). SD-LEO-INFRA-RECONCILE-VENTURE-BUILD-001.';

COMMIT;

-- ROLLBACK (manual): ALTER TABLE public.ventures DROP CONSTRAINT IF EXISTS ck_ventures_build_model;
--                    ALTER TABLE public.ventures DROP COLUMN IF EXISTS build_model;
