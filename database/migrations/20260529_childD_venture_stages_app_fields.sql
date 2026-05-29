-- =============================================================================
-- Migration: Add app-only fields to venture_stages (Child D)
-- SD: SD-LEO-INFRA-UNIFY-VENTURE-STAGE-001-D
-- @approved-by: rickfelix@example.com
-- Date: 2026-05-29
--
-- Purpose:
--   Make venture_stages (the unified SSOT created by Child A, read by Children
--   B/C) able to regenerate ehg/src/config/venture-workflow.ts BYTE-IDENTICALLY.
--   The DB currently lacks three app-only fields that the frontend SSOT carries:
--     - gate_label      (human-readable gate caption; 9 gate stages)
--     - app_description (frontend stage description; distinct from the DB
--                        `description` column the backend reads)
--     - component_path  (already exists but is NULL for all 26 rows)
--
--   This migration is STRICTLY ADDITIVE. It adds two NULL columns and backfills
--   component_path. It does NOT touch any column the A/B/C backend repointed to
--   (stage_number, stage_name, stage_key, gate_type, review_mode, work_type,
--   chunk, description, required_artifacts, metadata) -> ZERO backend change.
--
--   The Child A old->new sync triggers write only the existing columns, so the
--   new app-owned columns are trigger-safe. ADD COLUMN ... NULL is metadata-only
--   on Postgres (no table rewrite), safe on the live shared table.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + deterministic VALUES-join backfill.
-- Rollback: 20260529_childD_venture_stages_app_fields_rollback.sql
-- =============================================================================

BEGIN;

-- 1. Additive columns (no-op if already present) --------------------------------
ALTER TABLE public.venture_stages ADD COLUMN IF NOT EXISTS gate_label      TEXT NULL;
ALTER TABLE public.venture_stages ADD COLUMN IF NOT EXISTS app_description TEXT NULL;
-- component_path already exists (created by Child A, currently NULL for all 26).

COMMENT ON COLUMN public.venture_stages.gate_label IS
  'App-only: human-readable gate caption mirrored into ehg venture-workflow.ts gateLabel (9 gate stages). Backend does not read this. SD-LEO-INFRA-UNIFY-VENTURE-STAGE-001-D.';
COMMENT ON COLUMN public.venture_stages.app_description IS
  'App-only: frontend stage description mirrored into ehg venture-workflow.ts description. Distinct from venture_stages.description (the backend-read column). SD-LEO-INFRA-UNIFY-VENTURE-STAGE-001-D.';

-- 2. Backfill from venture-workflow.ts (the app SSOT) ---------------------------
--    (stage_number, gate_label, app_description, component_path)
--    Deterministic: re-running sets the same 26 values.
UPDATE public.venture_stages vs
SET gate_label      = v.gate_label,
    app_description = v.app_description,
    component_path  = v.component_path,
    updated_at      = now()
FROM (VALUES
  (1, NULL, 'Initial venture idea capture and seed text', 'Stage1DraftIdea.tsx'),
  (2, NULL, 'AI-powered initial review and feedback', 'Stage2AIReview.tsx'),
  (3, 'KILL GATE: Venture viability check', 'First kill gate - validate or archive venture', 'Stage3ComprehensiveValidation.tsx'),
  (4, NULL, 'Market and competitor analysis', 'Stage4CompetitiveIntelligence.tsx'),
  (5, 'KILL GATE: Financial viability check', 'Second kill gate - validate financial model', 'Stage5ProfitabilityForecasting.tsx'),
  (6, NULL, 'Risk assessment and mitigation planning', 'Stage6RiskEvaluation.tsx'),
  (7, NULL, 'Revenue model design with pricing tiers and monetization strategy', 'Stage7RevenueArchitecture.tsx'),
  (8, NULL, 'Nine-block business model canvas analysis', 'Stage8BusinessModelCanvas.tsx'),
  (9, NULL, 'Exit thesis and acquisition/IPO strategy planning', 'Stage9ExitStrategy.tsx'),
  (10, 'PROMOTION GATE: Customer & Brand foundation (Chairman signature)', 'Customer personas, brand genome, and brand identity foundation', 'Stage10CustomerBrand.tsx'),
  (11, NULL, 'Define target markets, acquisition channels, and launch timeline', 'Stage11NamingVisualIdentity.tsx'),
  (12, NULL, 'Define sales process stages, success metrics, and customer journey', 'Stage12GtmSalesStrategy.tsx'),
  (13, 'KILL GATE: Technology viability check - venture can be terminated', 'Evaluate technology choices with kill gate enforcement', 'Stage13ProductRoadmap.tsx'),
  (14, NULL, 'Define entity relationships, data flows, and schema design', 'Stage14TechnicalArchitecture.tsx'),
  (15, NULL, 'Wireframe generation, visual convergence, and design materialization', 'Stage15DesignStudio.tsx'),
  (16, NULL, 'Financial projections and unit economics validation', 'Stage16FinancialProjections.tsx'),
  (17, 'PROMOTION GATE: Blueprint quality review before BUILD (Chairman signature)', 'Aggregates all pre-build artifacts, computes quality scores, identifies gaps — promotion gate', 'Stage17BlueprintReview.tsx'),
  (18, 'PROMOTION GATE: Marketing copy review (Chairman signature)', 'Generate persona-targeted marketing copy from upstream artifacts', 'Stage18MarketingCopy.tsx'),
  (19, NULL, 'Sprint tracking, feature backlog, and development progress', 'Stage19SprintPlanning.tsx'),
  (20, NULL, 'Security audit (RLS, secrets, DEFINER), build quality metrics, compliance verification', 'Stage20CodeQuality.tsx'),
  (21, NULL, 'Device screenshots, social media graphics, video storyboards from designs', 'Stage21VisualAssets.tsx'),
  (22, NULL, 'Integration testing assessment, environment analysis, chairman go/no-go decision', 'Stage22DistributionSetup.tsx'),
  (23, 'KILL GATE: Launch readiness - all prerequisites must pass', 'Deployment checklist, rollback procedures, blue-green deployment', 'Stage23LaunchReadiness.tsx'),
  (24, 'PROMOTION GATE: Chairman triggers launch across all channels', 'Go-live trigger, multi-channel announcement activation', 'Stage24GoLive.tsx'),
  (25, 'PROMOTION GATE: Post-launch performance review', 'Post-launch metrics, assumptions vs reality, key learnings', 'Stage25PostLaunchReview.tsx'),
  (26, NULL, 'Launch execution, scale planning, and operations handoff', 'Stage26GrowthPlaybook.tsx')
) AS v(stage_number, gate_label, app_description, component_path)
WHERE vs.stage_number = v.stage_number;

-- 3. Verification DO-block ------------------------------------------------------
--    Asserts the backfill is complete and well-formed. Fails the migration loud
--    if any invariant is violated.
DO $$
DECLARE
  cp_count        INT;
  cp_bad_format   INT;
  desc_count      INT;
  gl_count        INT;
  gl_wrong_stages INT;
BEGIN
  -- 3a. All 26 component_path non-null and matching ^Stage\d+...\.tsx$
  SELECT count(*) INTO cp_count FROM public.venture_stages WHERE component_path IS NOT NULL;
  IF cp_count <> 26 THEN
    RAISE EXCEPTION 'component_path backfill incomplete: % of 26 non-null', cp_count;
  END IF;
  SELECT count(*) INTO cp_bad_format FROM public.venture_stages
    WHERE component_path !~ '^Stage[0-9]+.*\.tsx$';
  IF cp_bad_format <> 0 THEN
    RAISE EXCEPTION 'component_path format invalid for % rows (expected ^Stage<n>...\.tsx$)', cp_bad_format;
  END IF;

  -- 3b. app_description non-null for all 26
  SELECT count(*) INTO desc_count FROM public.venture_stages WHERE app_description IS NOT NULL;
  IF desc_count <> 26 THEN
    RAISE EXCEPTION 'app_description backfill incomplete: % of 26 non-null', desc_count;
  END IF;

  -- 3c. gate_label non-null on EXACTLY the 9 gate stages (3,5,10,13,17,18,23,24,25)
  SELECT count(*) INTO gl_count FROM public.venture_stages WHERE gate_label IS NOT NULL;
  IF gl_count <> 9 THEN
    RAISE EXCEPTION 'gate_label expected on 9 stages, found %', gl_count;
  END IF;
  SELECT count(*) INTO gl_wrong_stages FROM public.venture_stages
    WHERE (gate_label IS NOT NULL) <> (stage_number IN (3,5,10,13,17,18,23,24,25));
  IF gl_wrong_stages <> 0 THEN
    RAISE EXCEPTION 'gate_label present on wrong stage set (% mismatched rows)', gl_wrong_stages;
  END IF;

  RAISE NOTICE 'Child D backfill verified: 26 component_path (format OK), 26 app_description, 9 gate_label on stages 3,5,10,13,17,18,23,24,25.';
END $$;

COMMIT;
