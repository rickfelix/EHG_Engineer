-- SD-LEO-INFRA-REALITY-GATE-ARTIFACT-001 FR-1
-- @approved-by: rickfelix@example.com
--
-- gate_boundary_config: DB-canonical source for cross-phase reality-gate
-- artifact requirements. Supersedes BOUNDARY_CONFIG (hardcoded in
-- lib/eva/reality-gates.js) and LEGACY_GATE_THRESHOLDS (hardcoded in
-- lib/eva/stage-zero/profile-service.js), both of which drifted from the
-- canonical names that stage analyzers actually emit.
--
-- Empirical witness: NameSignal venture 57e2645a-... hit a false-negative
-- gate failure at 9->10 on 2026-05-12 because BOUNDARY_CONFIG referenced
-- engine_risk_assessment / engine_revenue_model — names that NO stage
-- analyzer emits. The actual canonical names (per lifecycle_stage_config)
-- are engine_risk_matrix (S6) and engine_pricing_model (S7).
--
-- Closes the same audit issue class as the just-shipped
-- SD-LEO-INFRA-VENTURE-GATE-UNIFICATION-001, applied to the
-- artifact-name layer instead of the gate-decision layer.
--
-- Schema (text[] not JSONB per DATABASE C1/C2 review):
--   from_stage, to_stage         INT, PRIMARY KEY (from_stage, to_stage)
--   required_artifacts           TEXT[]   (matches lifecycle_stage_config.required_artifacts shape)
--   quality_thresholds           JSONB    (per-artifact min_quality_score, nullable, defaults to 0.5)
--   url_verification_required    BOOLEAN  (defaults to false)
--   description                  TEXT
--   metadata                     JSONB
--
-- RLS (per SECURITY C1/C2 review):
--   SELECT TO authenticated (USING true)
--   INSERT/UPDATE TO service_role explicit
--   NO DELETE policy — migration-only updates
--
-- Audit trigger (per DATABASE C6 review): gate_boundary_config_audit with
-- AFTER UPDATE trigger mirroring trg_stage_config_audit pattern.
--
-- Realtime (per DATABASE C3 BLOCKING): ALTER PUBLICATION supabase_realtime
-- ADD TABLE so FR-2's cache invalidation actually fires.
--
-- Coherence check (per DATABASE C2): inline DO block asserts every
-- required artifact_type appears in some upstream stage's
-- lifecycle_stage_config.required_artifacts. Without this guard, the
-- exact bug class this SD fixes could recur during reseeding.

BEGIN;

SET LOCAL application_name = 'SD-LEO-INFRA-REALITY-GATE-ARTIFACT-001-FR-1';

-- ============================================================================
-- Step 1: Create gate_boundary_config table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.gate_boundary_config (
  from_stage                  INT NOT NULL,
  to_stage                    INT NOT NULL,
  required_artifacts          TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  quality_thresholds          JSONB NOT NULL DEFAULT '{}'::jsonb,
  url_verification_required   BOOLEAN NOT NULL DEFAULT false,
  description                 TEXT,
  metadata                    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (from_stage, to_stage),
  CONSTRAINT gate_boundary_config_stage_order CHECK (to_stage > from_stage)
);

COMMENT ON TABLE public.gate_boundary_config IS
  'SD-LEO-INFRA-REALITY-GATE-ARTIFACT-001 FR-1: DB-canonical cross-phase reality-gate boundary requirements. Replaces BOUNDARY_CONFIG hardcoded in lib/eva/reality-gates.js.';
COMMENT ON COLUMN public.gate_boundary_config.required_artifacts IS
  'Artifact types (text[]) that must exist in venture_artifacts before this boundary transition can pass. Each entry must appear in some upstream stage''s lifecycle_stage_config.required_artifacts (enforced by validate-boundary-config-coherence.mjs CI guard).';
COMMENT ON COLUMN public.gate_boundary_config.quality_thresholds IS
  'Per-artifact min_quality_score overrides (JSONB: {"artifact_type": 0.5}). Empty object uses the DEFAULT_BOUNDARY_QUALITY_FLOOR=0.5 constant in lib/eva/reality-gates.js (SECURITY C4 preservation).';

-- ============================================================================
-- Step 2: Enable RLS with strict posture (SECURITY C1/C2)
-- DO NOT mirror lifecycle_stage_config (overly permissive authenticated writes).
-- Mirror stage_config (post-VGU-001) posture: read-public, write-service-role,
-- no DELETE policy.
-- ============================================================================
ALTER TABLE public.gate_boundary_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY gate_boundary_config_select_authenticated
  ON public.gate_boundary_config
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY gate_boundary_config_select_anon
  ON public.gate_boundary_config
  FOR SELECT TO anon
  USING (true);

CREATE POLICY gate_boundary_config_insert_service_role
  ON public.gate_boundary_config
  FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY gate_boundary_config_update_service_role
  ON public.gate_boundary_config
  FOR UPDATE TO service_role
  USING (true) WITH CHECK (true);

-- No DELETE policy — service-role bypasses RLS for migration-only deletes if ever needed.

-- ============================================================================
-- Step 3: Create audit table + trigger (DATABASE C6)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.gate_boundary_config_audit (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_stage      INT NOT NULL,
  to_stage        INT NOT NULL,
  changed_by      TEXT,
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  field_changed   TEXT NOT NULL,
  old_value       JSONB,
  new_value       JSONB
);

COMMENT ON TABLE public.gate_boundary_config_audit IS
  'Append-only audit log for gate_boundary_config changes. Written by trg_gate_boundary_config_audit AFTER UPDATE.';

ALTER TABLE public.gate_boundary_config_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY gate_boundary_config_audit_select_authenticated
  ON public.gate_boundary_config_audit
  FOR SELECT TO authenticated
  USING (true);

-- Audit table is append-only by trigger; no INSERT/UPDATE/DELETE policy for clients.

CREATE OR REPLACE FUNCTION public.fn_gate_boundary_config_audit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- required_artifacts change
  IF NEW.required_artifacts IS DISTINCT FROM OLD.required_artifacts THEN
    INSERT INTO public.gate_boundary_config_audit (from_stage, to_stage, changed_by, field_changed, old_value, new_value)
    VALUES (
      NEW.from_stage, NEW.to_stage, current_setting('application_name', true),
      'required_artifacts',
      to_jsonb(OLD.required_artifacts),
      to_jsonb(NEW.required_artifacts)
    );
  END IF;

  -- quality_thresholds change
  IF NEW.quality_thresholds IS DISTINCT FROM OLD.quality_thresholds THEN
    INSERT INTO public.gate_boundary_config_audit (from_stage, to_stage, changed_by, field_changed, old_value, new_value)
    VALUES (
      NEW.from_stage, NEW.to_stage, current_setting('application_name', true),
      'quality_thresholds',
      OLD.quality_thresholds,
      NEW.quality_thresholds
    );
  END IF;

  -- url_verification_required change
  IF NEW.url_verification_required IS DISTINCT FROM OLD.url_verification_required THEN
    INSERT INTO public.gate_boundary_config_audit (from_stage, to_stage, changed_by, field_changed, old_value, new_value)
    VALUES (
      NEW.from_stage, NEW.to_stage, current_setting('application_name', true),
      'url_verification_required',
      to_jsonb(OLD.url_verification_required),
      to_jsonb(NEW.url_verification_required)
    );
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gate_boundary_config_audit ON public.gate_boundary_config;
CREATE TRIGGER trg_gate_boundary_config_audit
  AFTER UPDATE ON public.gate_boundary_config
  FOR EACH ROW EXECUTE FUNCTION public.fn_gate_boundary_config_audit_trigger();

-- ============================================================================
-- Step 4: Seed all 5 cross-phase boundaries with CORRECTED artifact names.
-- Idempotent via ON CONFLICT.
-- ============================================================================

-- 5->6: SPARK -> ENGINE (CORRECTED — BOUNDARY_CONFIG referenced
-- truth_problem_statement / truth_target_market_analysis / truth_value_proposition
-- which NO stage analyzer emits. Replaced with artifacts that S1-S5 actually produce
-- per lifecycle_stage_config.required_artifacts. truth_financial_model is the
-- viability anchor; truth_validation_decision proves the kill-gate passed.)
INSERT INTO public.gate_boundary_config (from_stage, to_stage, required_artifacts, quality_thresholds, url_verification_required, description)
VALUES (
  5, 6,
  ARRAY['truth_idea_brief', 'truth_validation_decision', 'truth_financial_model']::TEXT[],
  '{"truth_idea_brief": 0.5, "truth_validation_decision": 0.6, "truth_financial_model": 0.6}'::jsonb,
  false,
  'SPARK -> ENGINE (corrected — was truth_problem_statement/target_market_analysis/value_proposition, names no stage emits)'
)
ON CONFLICT (from_stage, to_stage) DO UPDATE SET
  required_artifacts = EXCLUDED.required_artifacts,
  quality_thresholds = EXCLUDED.quality_thresholds,
  url_verification_required = EXCLUDED.url_verification_required,
  description = EXCLUDED.description;

-- 9->10: ENGINE -> IDENTITY (CORRECTED — was engine_risk_assessment + engine_revenue_model)
INSERT INTO public.gate_boundary_config (from_stage, to_stage, required_artifacts, quality_thresholds, url_verification_required, description)
VALUES (
  9, 10,
  ARRAY['engine_risk_matrix', 'engine_pricing_model', 'engine_business_model_canvas']::TEXT[],
  '{"engine_risk_matrix": 0.5, "engine_pricing_model": 0.5, "engine_business_model_canvas": 0.6}'::jsonb,
  false,
  'ENGINE -> IDENTITY (corrected names — was engine_risk_assessment + engine_revenue_model in deprecated BOUNDARY_CONFIG)'
)
ON CONFLICT (from_stage, to_stage) DO UPDATE SET
  required_artifacts = EXCLUDED.required_artifacts,
  quality_thresholds = EXCLUDED.quality_thresholds,
  url_verification_required = EXCLUDED.url_verification_required,
  description = EXCLUDED.description;

-- 12->13: IDENTITY -> BLUEPRINT (CORRECTED — BOUNDARY_CONFIG referenced
-- blueprint_project_plan which no S<=12 stage emits.)
INSERT INTO public.gate_boundary_config (from_stage, to_stage, required_artifacts, quality_thresholds, url_verification_required, description)
VALUES (
  12, 13,
  ARRAY['engine_business_model_canvas', 'identity_persona_brand', 'identity_gtm_sales_strategy']::TEXT[],
  '{"engine_business_model_canvas": 0.7, "identity_persona_brand": 0.5, "identity_gtm_sales_strategy": 0.5}'::jsonb,
  false,
  'IDENTITY -> BLUEPRINT (corrected — was engine_business_model_canvas/blueprint_technical_architecture/blueprint_project_plan; blueprint_* artifacts are not yet produced at S12)'
)
ON CONFLICT (from_stage, to_stage) DO UPDATE SET
  required_artifacts = EXCLUDED.required_artifacts,
  quality_thresholds = EXCLUDED.quality_thresholds,
  url_verification_required = EXCLUDED.url_verification_required,
  description = EXCLUDED.description;

-- 17->18: BLUEPRINT REVIEW -> BUILD LOOP (CORRECTED — BOUNDARY_CONFIG referenced
-- blueprint_review_summary which no stage emits. S17 emits system_devils_advocate_review.)
INSERT INTO public.gate_boundary_config (from_stage, to_stage, required_artifacts, quality_thresholds, url_verification_required, description)
VALUES (
  17, 18,
  ARRAY['system_devils_advocate_review', 'blueprint_financial_projection']::TEXT[],
  '{"system_devils_advocate_review": 0.6, "blueprint_financial_projection": 0.5}'::jsonb,
  false,
  'BLUEPRINT REVIEW -> BUILD LOOP (corrected — was blueprint_review_summary, name no stage emits; S17 emits system_devils_advocate_review)'
)
ON CONFLICT (from_stage, to_stage) DO UPDATE SET
  required_artifacts = EXCLUDED.required_artifacts,
  quality_thresholds = EXCLUDED.quality_thresholds,
  url_verification_required = EXCLUDED.url_verification_required,
  description = EXCLUDED.description;

-- 23->24: BUILD LOOP -> LAUNCH & LEARN (CORRECTED — BOUNDARY_CONFIG referenced
-- launch_metrics + launch_user_feedback_summary + launch_production_app, none of which
-- are emitted by S<=23. S23 emits launch_readiness_checklist; launch_metrics is S24's
-- output (NOT pre-transition).)
INSERT INTO public.gate_boundary_config (from_stage, to_stage, required_artifacts, quality_thresholds, url_verification_required, description)
VALUES (
  23, 24,
  ARRAY['launch_readiness_checklist']::TEXT[],
  '{"launch_readiness_checklist": 0.7}'::jsonb,
  false,
  'BUILD LOOP -> LAUNCH & LEARN (corrected — was launch_launch_metrics/launch_user_feedback_summary/launch_production_app, all post-S23 outputs not produced before this boundary)'
)
ON CONFLICT (from_stage, to_stage) DO UPDATE SET
  required_artifacts = EXCLUDED.required_artifacts,
  quality_thresholds = EXCLUDED.quality_thresholds,
  url_verification_required = EXCLUDED.url_verification_required,
  description = EXCLUDED.description;

-- ============================================================================
-- Step 5: Add gate_boundary_config to supabase_realtime publication
-- (DATABASE C3 BLOCKING — without this, FR-2 cache-invalidation is silent dead-code)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'gate_boundary_config'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.gate_boundary_config';
    RAISE NOTICE '[RG-001] Added gate_boundary_config to supabase_realtime publication';
  ELSE
    RAISE NOTICE '[RG-001] gate_boundary_config already in supabase_realtime publication (no-op)';
  END IF;
END $$;

-- ============================================================================
-- Step 6: COMMENT ON CHECK constraint to flag deprecated artifact_type names
-- (DATABASE C7) so the follow-up removal SD has a grep target.
-- ============================================================================
COMMENT ON CONSTRAINT venture_artifacts_artifact_type_check ON public.venture_artifacts IS
  'Deprecated names slated for removal in follow-up SD (post SD-LEO-INFRA-REALITY-GATE-ARTIFACT-001): engine_risk_assessment, engine_revenue_model, launch_launch_metrics. These were never emitted by stage analyzers — the names live in artifact-types.js as JSDoc-@deprecated aliases pointing to canonical engine_risk_matrix / engine_pricing_model / launch_metrics. Remove from the CHECK enum after one release window confirms zero historical rows.';

-- ============================================================================
-- Step 7: VERIFICATION — assert post-state matches the FR-1 contract.
-- DATABASE C2: coherence check using text[] + ANY/unnest.
-- ============================================================================
DO $$
DECLARE
  v_count          INT;
  v_pub_count      INT;
  v_audit_table    INT;
  v_trigger_count  INT;
  v_orphan_pair    TEXT;
BEGIN
  -- 1. Exactly 5 boundary rows
  SELECT count(*) INTO v_count FROM public.gate_boundary_config;
  IF v_count <> 5 THEN
    RAISE EXCEPTION '[RG-001-VERIFY] Expected 5 boundary rows, found %', v_count;
  END IF;

  -- 2. gate_boundary_config in supabase_realtime publication
  SELECT count(*) INTO v_pub_count
    FROM pg_publication_tables
   WHERE pubname = 'supabase_realtime'
     AND schemaname = 'public'
     AND tablename = 'gate_boundary_config';
  IF v_pub_count <> 1 THEN
    RAISE EXCEPTION '[RG-001-VERIFY] gate_boundary_config not in supabase_realtime publication (count=%)', v_pub_count;
  END IF;

  -- 3. Audit table + trigger present
  SELECT count(*) INTO v_audit_table
    FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'gate_boundary_config_audit';
  IF v_audit_table <> 1 THEN
    RAISE EXCEPTION '[RG-001-VERIFY] gate_boundary_config_audit table missing';
  END IF;

  SELECT count(*) INTO v_trigger_count
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
   WHERE c.relname = 'gate_boundary_config'
     AND t.tgname = 'trg_gate_boundary_config_audit';
  IF v_trigger_count <> 1 THEN
    RAISE EXCEPTION '[RG-001-VERIFY] trg_gate_boundary_config_audit trigger missing';
  END IF;

  -- 4. Coherence: every required_artifact in gate_boundary_config must
  --    appear in some upstream stage's lifecycle_stage_config.required_artifacts.
  SELECT format('boundary %s->%s requires %s', gbc.from_stage, gbc.to_stage, gbc.required_artifacts[i])
    INTO v_orphan_pair
    FROM public.gate_boundary_config gbc,
         generate_subscripts(gbc.required_artifacts, 1) i
   WHERE NOT EXISTS (
     SELECT 1
       FROM public.lifecycle_stage_config lsc
      WHERE lsc.stage_number <= gbc.from_stage
        AND gbc.required_artifacts[i] = ANY (lsc.required_artifacts)
   )
   LIMIT 1;

  IF v_orphan_pair IS NOT NULL THEN
    RAISE EXCEPTION '[RG-001-VERIFY] Coherence violation: % — no upstream stage emits this artifact_type', v_orphan_pair;
  END IF;

  RAISE NOTICE '[RG-001-VERIFY] All assertions passed: 5 boundaries, publication=1, audit table+trigger present, coherence OK';
END $$;

COMMIT;
