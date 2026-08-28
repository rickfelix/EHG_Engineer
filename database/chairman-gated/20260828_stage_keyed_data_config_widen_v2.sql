-- SD-LEO-INFRA-STAGE-KEYED-DATA-001 — widen the stage-keyed DATA/CONFIG surfaces the -B migration
-- (20260825_dedicated_venture_uat_stage_insert_and_renumber.sql, "v1" below) documented but
-- deliberately did not fix: 16 CHECK constraints capped at stage 26, 1 text-enum CHECK, and 3 live
-- data tables (gate_boundary_config, venture_stage_cutover_grandfather, stage_artifact_requirements)
-- whose row content still describes the OLD stage_number scheme after v1's renumber. Also fixes 3
-- functions this SD's own live sub-agent evidence found still hardcode stage 26 as the ceiling or a
-- pre-shift literal, missed by v1's own writer census.
-- Target DB: EHG_Engineer consolidated (dedlbzhpgkmetvhbkyzq)
--
-- @approved-by: PENDING
-- @approval-record: PENDING — chairman ratification not yet scheduled. DO NOT APPLY.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- STAGED, NOT APPLIED. CHAIRMAN-GATED. DO NOT RUN THIS FILE.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Authored as a NEW file (not an in-place edit of v1) deliberately, per this SD's own scope: editing
-- v1 in place would erase its own "DO NOT APPLY" self-blocking banner and approval history the
-- instant a diff touched it, and v1 has already been independently, adversarially reviewed twice
-- (see its own header) -- reopening it to append unrelated surfaces risks invalidating that review.
--
-- MUST APPLY AFTER v1, NEVER BEFORE OR INSTEAD OF. The precondition check immediately below refuses
-- to proceed if v1's own marker (the 'dedicated_venture_uat' venture_stages row) is absent, because
-- every data-shift in this file assumes v1's renumber has already happened -- applying this file
-- first would shift gate_boundary_config/venture_stage_cutover_grandfather/stage_artifact_requirements
-- to describe a scheme venture_stages does not yet have, a worse mismatch than the one being fixed.
--
-- BLAST RADIUS CONTRACT: docs/audits/stage-keyed-data-config-census.md (this SD's own committed
-- census, 22 disposition rows, negative-control PASS at 18 live CHECK constraints containing '26' on
-- a stage-bearing column). Every ALTER/UPDATE below traces to exactly one row in that table. Re-run
-- the census (node scripts/audits/stage-keyed-data-config-census.mjs) immediately before any apply
-- attempt -- do not trust the numbers below without re-measuring, per the same discipline v1's own
-- banner insists on for its own preflight.
--
-- APPLY (chairman ceremony, same tooling as v1):
--   node scripts/apply-migration.js --issue-token
--   MIGRATION_APPLY_TOKEN=<token from above> node scripts/apply-migration.js \
--     "database/chairman-gated/20260828_stage_keyed_data_config_widen_v2.sql" \
--     --prod-deploy --allow-any-path
--   A DRY RUN (apply-migration.js with no --prod-deploy) MUST be run and its output inspected first.
--
-- NOTE: no BEGIN;/COMMIT; here -- scripts/apply-migration.js wraps the file in its own transaction
-- (and holds an advisory lock), matching v1 and every other file in this directory.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT THIS FILE DOES (one transaction)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. Precondition: v1 already applied (dedicated_venture_uat row present) -- else abort.
-- 2. fn_parked_venture_preflight(): a SHARED SQL function (FR-5) implementing the SAME
--    real-venture-parked check v1's own inline DO-block hand-rolled and
--    lib/eva/uat-stage-migration/parked-venture-classifier.mjs's runParkedVentureClassification()
--    duplicates in JS -- this migration's own preflight calls this function directly; the Node
--    script is updated in this same SD to call it too (falling back to its existing JS logic only
--    if this function is not yet live, i.e. before this file is chairman-approved).
-- 3. Widen 16 CHECK constraints (upper bound 26 -> 27) across 14 tables -- the full list this SD's
--    own census measured live, EXCLUDING ventures.ventures_current_lifecycle_stage_check (already
--    widened by v1, section 4) and venture_artifacts_storm_quarantine_20260704's duplicate
--    artifact_type CHECK (a frozen quarantine snapshot, deliberately left untouched -- see note
--    at that statement).
-- 4. Widen venture_artifacts_artifact_type_check's enum to add 'stage_27_analysis'.
-- 5. Shift 3 live config/data tables whose row CONTENT still describes the pre-v1 scheme:
--    gate_boundary_config (1 boundary row), venture_stage_cutover_grandfather (7 rows),
--    stage_artifact_requirements (6 rows, two-phase per its own UNIQUE(stage_number, artifact_type)).
-- 6. CREATE OR REPLACE fn_bootstrap_venture_stages, bootstrap_venture_workflow,
--    approve_chairman_decision -- 3 functions this SD's own live pg_get_functiondef probe found
--    still hardcode a stage-26 ceiling or a pre-shift stage literal, missed by v1's writer census
--    (v1 covered advance_venture_stage/fn_advance_venture_stage only).
-- 7. Post-apply readback verification.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- DOCUMENTED, NOT FIXED (deliberate, with a stated reason -- not silently dropped)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- (a) stage_executions.lifecycle_stage -- NOT shifted. Live-measured (98 rows in the old 23-26
--     range): this is a worker-execution LOG table (worker_id/status/started_at/heartbeat_at
--     columns), the same "historical record, not live state" shape v1's own FR-4 rationale used to
--     justify shimming venture_stage_transitions/eva_stage_gate_attempts/stage_events rather than
--     shifting them. Shifting a log's historical stage_number would misrepresent what stage a past
--     execution actually ran at. Disposition: accepted-as-broken (by design, not a gap) -- add to
--     the v1 shim's translate-at-read view coverage if a reader is ever found expecting
--     current-scheme values here. Owner: EXEC (this SD). Re-review: when a stage_executions reader
--     is added that compares its lifecycle_stage against current venture_stages.stage_number.
-- (b) eva_ventures's trg_ventures_update_sync_eva (sync_ventures_to_eva_ventures_update()) --
--     the TRIGGER itself is NOT changed (its `IF COALESCE(NEW.is_demo, false) THEN RETURN NEW;
--     END IF;` early-return is a DELIBERATE design decision, SD-LEO-ORCH-ADAM-PLAN-KEEPER-001-F,
--     "demo/test fixtures never enter the EVA pipeline" -- changing it going forward would
--     contradict that SD's own intent). BUT section 5b below DOES add a one-time, precisely-scoped
--     DATA backfill for the STALE ROWS THIS SPECIFIC MIGRATION EVENT causes: this SD's own
--     TS-7 probe (scripts/eva/stage-keyed-data-ts7-eva-ventures-mirror-sync-probe.mjs) measured
--     live that 21 eva_ventures rows (not zero -- the earlier "zero current divergence" note
--     described the PRE-shift state, before section 3's own +1 UPDATE runs) go stale by exactly
--     the 1-stage delta v1's shift produces, because their eva_ventures rows already existed
--     from BEFORE the demo-exclusion trigger's own guard was added -- this migration's shift is
--     what creates the divergence, not something the trigger already tolerates in steady state.
--     Section 5b corrects exactly those rows (WHERE ev.current_lifecycle_stage = v.
--     current_lifecycle_stage - 1, scoped to the post-shift 24-27 range) without altering the
--     trigger's forward-looking behavior for any OTHER stage change. Disposition: shift (data
--     backfill, not a trigger-behavior change). Owner: EXEC (this SD).
-- (c) venture_artifacts_storm_quarantine_20260704.venture_artifacts_artifact_type_check -- NOT
--     widened. A frozen quarantine/archive table (named for its creation date, 2026-07-04); no
--     evidence found of live writes reaching it. Widening a dead table's CHECK constraint for a
--     value it will never receive a new write of has no benefit and needlessly touches archived
--     schema. Disposition: accepted-as-broken (dead table). Owner: EXEC (this SD). Re-review: if
--     this table is ever reactivated for live writes.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 1. PRECONDITION -- v1 already applied. Must be the first statement (mirrors v1's own -1. LOCK
--    convention of putting the hardest guardrail first).
-- ───────────────────────────────────────────────────────────────────────────────────────────────
DO $v1_precondition$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.venture_stages WHERE stage_key = 'dedicated_venture_uat') THEN
    RAISE EXCEPTION 'PRECONDITION FAILED: v1 (20260825_dedicated_venture_uat_stage_insert_and_renumber.sql) has not been applied yet -- the dedicated_venture_uat venture_stages row is absent. This file assumes v1''s renumber has already happened; applying it first would shift config/data rows to describe a scheme venture_stages does not yet have.';
  END IF;
END
$v1_precondition$;

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 2. FR-5 -- shared parked-venture preflight function. Same predicate as v1's own inline FR-6 check
--    and lib/eva/uat-stage-migration/parked-venture-classifier.mjs's classifyParkedVentures(), now
--    a single SQL implementation both a future DDL preflight and the Node script can call, removing
--    the asymmetry by construction (PRD FR-5, corrected acceptance criteria) rather than asserting
--    parity across two hand-maintained copies.
-- ───────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_parked_venture_preflight(p_min integer DEFAULT 23, p_max integer DEFAULT 26, p_override boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_real_count INTEGER;
  v_demo_count INTEGER;
  v_real_ids uuid[];
BEGIN
  SELECT count(*) FILTER (WHERE is_demo IS NOT TRUE),
         count(*) FILTER (WHERE is_demo IS TRUE),
         array_agg(id) FILTER (WHERE is_demo IS NOT TRUE)
    INTO v_real_count, v_demo_count, v_real_ids
  FROM public.ventures
  WHERE current_lifecycle_stage BETWEEN p_min AND p_max;

  RETURN jsonb_build_object(
    'blocked', (v_real_count > 0 AND NOT p_override),
    'real_count', COALESCE(v_real_count, 0),
    'demo_count', COALESCE(v_demo_count, 0),
    'total', COALESCE(v_real_count, 0) + COALESCE(v_demo_count, 0),
    'real_venture_ids', COALESCE(v_real_ids, ARRAY[]::uuid[]),
    'range_min', p_min,
    'range_max', p_max,
    'override', p_override
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_parked_venture_preflight(integer, integer, boolean) TO service_role;

DO $parked_preflight$
DECLARE
  v_verdict jsonb;
BEGIN
  -- This migration's own shift range is 23-26 in the PRE-v1 sense is already moot (v1 already
  -- moved everything); the surfaces THIS file shifts (gate_boundary_config, venture_stage_
  -- cutover_grandfather, stage_artifact_requirements) key off the SAME pre-v1 23-26 values that
  -- v1's own preflight already proved were real-venture-free before v1 ran. Re-check anyway: a
  -- venture could have advanced INTO 24-27 (the current live range) since v1 applied, and a
  -- currently-real venture parked there is exactly the condition future readers of these 3 tables
  -- must not be silently shifted underneath.
  v_verdict := public.fn_parked_venture_preflight(24, 27, false);
  IF (v_verdict->>'blocked')::boolean THEN
    RAISE EXCEPTION 'PREFLIGHT FAILED: % REAL (is_demo=false) venture(s) parked at stage 24-27 (%); refusing to shift config/data rows underneath live ventures without explicit chairman review.', v_verdict->>'real_count', v_verdict->'real_venture_ids';
  END IF;
END
$parked_preflight$;

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 3. Widen 16 CHECK constraints (26 -> 27). Every DROP/ADD pair below reproduces the LIVE
--    definition (pg_get_constraintdef, 2026-08-28) with ONLY the upper bound changed -- see
--    docs/audits/stage-keyed-data-config-census.md's "Live CHECK Constraints" table for the source.
--    IF EXISTS/idempotent by construction: a second run finds the already-widened (<=27) constraint
--    absent under its OLD name (DROP CONSTRAINT IF EXISTS is a no-op) and the ADD CONSTRAINT below
--    is skipped via a guard matching v1's DO $renumber$ pattern -- wrapped per-table since ALTER
--    TABLE ADD CONSTRAINT has no native IF NOT EXISTS in this Postgres version.
-- ───────────────────────────────────────────────────────────────────────────────────────────────
DO $widen_checks$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compliance_events_stage_number_check' AND connamespace = 'public'::regnamespace AND pg_get_constraintdef(oid) LIKE '%<= 27%') THEN
    ALTER TABLE public.compliance_events DROP CONSTRAINT IF EXISTS compliance_events_stage_number_check;
    ALTER TABLE public.compliance_events ADD CONSTRAINT compliance_events_stage_number_check CHECK (((stage_number >= 1) AND (stage_number <= 27)));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compliance_violations_stage_number_check' AND connamespace = 'public'::regnamespace AND pg_get_constraintdef(oid) LIKE '%<= 27%') THEN
    ALTER TABLE public.compliance_violations DROP CONSTRAINT IF EXISTS compliance_violations_stage_number_check;
    ALTER TABLE public.compliance_violations ADD CONSTRAINT compliance_violations_stage_number_check CHECK (((stage_number >= 1) AND (stage_number <= 27)));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'convergence_ledger_stages_stage_check' AND connamespace = 'public'::regnamespace AND pg_get_constraintdef(oid) LIKE '%<= 27%') THEN
    ALTER TABLE public.convergence_ledger_stages DROP CONSTRAINT IF EXISTS convergence_ledger_stages_stage_check;
    ALTER TABLE public.convergence_ledger_stages ADD CONSTRAINT convergence_ledger_stages_stage_check CHECK (((stage >= 0) AND (stage <= 27)));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eva_artifact_dependencies_source_stage_check' AND connamespace = 'public'::regnamespace AND pg_get_constraintdef(oid) LIKE '%<= 27%') THEN
    ALTER TABLE public.eva_artifact_dependencies DROP CONSTRAINT IF EXISTS eva_artifact_dependencies_source_stage_check;
    ALTER TABLE public.eva_artifact_dependencies ADD CONSTRAINT eva_artifact_dependencies_source_stage_check CHECK (((source_stage >= 1) AND (source_stage <= 27)));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eva_artifact_dependencies_target_stage_check' AND connamespace = 'public'::regnamespace AND pg_get_constraintdef(oid) LIKE '%<= 27%') THEN
    ALTER TABLE public.eva_artifact_dependencies DROP CONSTRAINT IF EXISTS eva_artifact_dependencies_target_stage_check;
    ALTER TABLE public.eva_artifact_dependencies ADD CONSTRAINT eva_artifact_dependencies_target_stage_check CHECK (((target_stage >= 1) AND (target_stage <= 27)));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eva_stage_gate_results_stage_number_check' AND connamespace = 'public'::regnamespace AND pg_get_constraintdef(oid) LIKE '%<= 27%') THEN
    ALTER TABLE public.eva_stage_gate_results DROP CONSTRAINT IF EXISTS eva_stage_gate_results_stage_number_check;
    ALTER TABLE public.eva_stage_gate_results ADD CONSTRAINT eva_stage_gate_results_stage_number_check CHECK (((stage_number >= 1) AND (stage_number <= 27)));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_lifecycle_stage' AND connamespace = 'public'::regnamespace AND pg_get_constraintdef(oid) LIKE '%<= 27%') THEN
    ALTER TABLE public.eva_ventures DROP CONSTRAINT IF EXISTS chk_lifecycle_stage;
    ALTER TABLE public.eva_ventures ADD CONSTRAINT chk_lifecycle_stage CHECK (((current_lifecycle_stage >= 1) AND (current_lifecycle_stage <= 27)));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eva_ventures_current_lifecycle_stage_check' AND connamespace = 'public'::regnamespace AND pg_get_constraintdef(oid) LIKE '%<= 27%') THEN
    ALTER TABLE public.eva_ventures DROP CONSTRAINT IF EXISTS eva_ventures_current_lifecycle_stage_check;
    ALTER TABLE public.eva_ventures ADD CONSTRAINT eva_ventures_current_lifecycle_stage_check CHECK (((current_lifecycle_stage >= 1) AND (current_lifecycle_stage <= 27)));
  END IF;

  -- stage_artifact_requirements_stage_number_check is deliberately NOT widened here: section 5
  -- below needs the constraint absent (not merely widened) while it runs its own two-phase
  -- negative-intermediate shift on this table, since a CHECK (stage_number >= 1) -- present here,
  -- unlike venture_stages -- rejects the negative intermediate value outright regardless of the
  -- upper bound. Section 5 drops this constraint before its shift and re-adds it (widened) after.

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stage_of_death_predictions_actual_death_stage_check' AND connamespace = 'public'::regnamespace AND pg_get_constraintdef(oid) LIKE '%<= 27%') THEN
    ALTER TABLE public.stage_of_death_predictions DROP CONSTRAINT IF EXISTS stage_of_death_predictions_actual_death_stage_check;
    ALTER TABLE public.stage_of_death_predictions ADD CONSTRAINT stage_of_death_predictions_actual_death_stage_check CHECK (((actual_death_stage IS NULL) OR ((actual_death_stage >= 1) AND (actual_death_stage <= 27))));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stage_of_death_predictions_predicted_death_stage_check' AND connamespace = 'public'::regnamespace AND pg_get_constraintdef(oid) LIKE '%<= 27%') THEN
    ALTER TABLE public.stage_of_death_predictions DROP CONSTRAINT IF EXISTS stage_of_death_predictions_predicted_death_stage_check;
    ALTER TABLE public.stage_of_death_predictions ADD CONSTRAINT stage_of_death_predictions_predicted_death_stage_check CHECK (((predicted_death_stage >= 1) AND (predicted_death_stage <= 27)));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stage_prop_contracts_stage_number_check' AND connamespace = 'public'::regnamespace AND pg_get_constraintdef(oid) LIKE '%<= 27%') THEN
    ALTER TABLE public.stage_prop_contracts DROP CONSTRAINT IF EXISTS stage_prop_contracts_stage_number_check;
    ALTER TABLE public.stage_prop_contracts ADD CONSTRAINT stage_prop_contracts_stage_number_check CHECK (((stage_number >= 1) AND (stage_number <= 27)));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stage_proving_journal_stage_number_check' AND connamespace = 'public'::regnamespace AND pg_get_constraintdef(oid) LIKE '%<= 27%') THEN
    ALTER TABLE public.stage_proving_journal DROP CONSTRAINT IF EXISTS stage_proving_journal_stage_number_check;
    ALTER TABLE public.stage_proving_journal ADD CONSTRAINT stage_proving_journal_stage_number_check CHECK (((stage_number >= 1) AND (stage_number <= 27)));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venture_capture_snapshots_lifecycle_stage_check' AND connamespace = 'public'::regnamespace AND pg_get_constraintdef(oid) LIKE '%<= 27%') THEN
    ALTER TABLE public.venture_capture_snapshots DROP CONSTRAINT IF EXISTS venture_capture_snapshots_lifecycle_stage_check;
    ALTER TABLE public.venture_capture_snapshots ADD CONSTRAINT venture_capture_snapshots_lifecycle_stage_check CHECK (((lifecycle_stage >= 1) AND (lifecycle_stage <= 27)));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venture_dependencies_required_stage_check' AND connamespace = 'public'::regnamespace AND pg_get_constraintdef(oid) LIKE '%<= 27%') THEN
    ALTER TABLE public.venture_dependencies DROP CONSTRAINT IF EXISTS venture_dependencies_required_stage_check;
    ALTER TABLE public.venture_dependencies ADD CONSTRAINT venture_dependencies_required_stage_check CHECK (((required_stage >= 1) AND (required_stage <= 27)));
  END IF;
END
$widen_checks$;

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 4. venture_artifacts_artifact_type_check -- add 'stage_27_analysis' to the enum. This is the
--    LIVE table only (venture_artifacts); the venture_artifacts_storm_quarantine_20260704 table
--    carries a duplicate of this same constraint and is deliberately NOT touched -- see note (c)
--    in the file banner above.
-- ───────────────────────────────────────────────────────────────────────────────────────────────
DO $widen_artifact_type$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venture_artifacts_artifact_type_check' AND conrelid = 'public.venture_artifacts'::regclass AND pg_get_constraintdef(oid) LIKE '%stage_27_analysis%') THEN
    ALTER TABLE public.venture_artifacts DROP CONSTRAINT IF EXISTS venture_artifacts_artifact_type_check;
    ALTER TABLE public.venture_artifacts ADD CONSTRAINT venture_artifacts_artifact_type_check CHECK (((artifact_type)::text = ANY (ARRAY['blueprint_api_contract'::text, 'blueprint_data_model'::text, 'blueprint_erd_diagram'::text, 'blueprint_financial_projection'::text, 'blueprint_launch_readiness'::text, 'blueprint_positioning_brief'::text, 'blueprint_product_roadmap'::text, 'blueprint_project_plan'::text, 'blueprint_promotion_gate'::text, 'blueprint_review_summary'::text, 'blueprint_risk_register'::text, 'blueprint_schema_spec'::text, 'blueprint_sprint_plan'::text, 'blueprint_technical_architecture'::text, 'blueprint_token_manifest'::text, 'blueprint_user_journey'::text, 'blueprint_user_story_pack'::text, 'blueprint_wireframes'::text, 'build_cicd_config'::text, 'build_deviation_record'::text, 'build_mvp_build'::text, 'build_security_audit'::text, 'build_system_prompt'::text, 'build_test_coverage_report'::text, 'code_quality_report'::text, 'design_token_manifest'::text, 'distribution_ad_copy'::text, 'distribution_block_marker'::text, 'distribution_channel_config'::text, 'distribution_skip_marker'::text, 'economic_lens'::text, 'engine_business_model_canvas'::text, 'engine_exit_strategy'::text, 'engine_pricing_model'::text, 'engine_revenue_model'::text, 'engine_risk_assessment'::text, 'engine_risk_matrix'::text, 'growth_optimization_roadmap'::text, 'growth_playbook'::text, 'identity_brand_guidelines'::text, 'identity_brand_name'::text, 'identity_gtm_sales_strategy'::text, 'identity_logo_image'::text, 'identity_naming_visual'::text, 'identity_persona_brand'::text, 'intake_venture_analysis'::text, 'launch_analytics_dashboard'::text, 'launch_assumptions_vs_reality'::text, 'launch_churn_triggers'::text, 'launch_deployment_runbook'::text, 'launch_health_scoring'::text, 'launch_launch_metrics'::text, 'launch_marketing_checklist'::text, 'launch_metrics'::text, 'launch_optimization_roadmap'::text, 'launch_production_app'::text, 'launch_readiness_checklist'::text, 'launch_retention_playbook'::text, 'launch_test_plan'::text, 'launch_uat_report'::text, 'launch_user_feedback_summary'::text, 'lifecycle_sd_bridge'::text, 'marketing_app_store_desc'::text, 'marketing_blog_draft'::text, 'marketing_email_onboarding'::text, 'marketing_email_reengagement'::text, 'marketing_email_welcome'::text, 'marketing_landing_hero'::text, 'marketing_seo_meta'::text, 'marketing_social_posts'::text, 'marketing_tagline'::text, 'post_lifecycle_decision'::text, 'postlaunch_analytics_dashboard'::text, 'postlaunch_assumptions_vs_reality'::text, 'postlaunch_user_feedback_summary'::text, 's17_approved'::text, 's17_approved_png'::text, 's17_archetypes'::text, 's17_design_system'::text, 's17_fill_screen'::text, 's17_preview'::text, 's17_qa_report'::text, 's17_session_state'::text, 's17_strategy_recommendation'::text, 's17_strategy_stats'::text, 's17_variant_scores'::text, 's17_variant_wip'::text, 'stage_0_analysis'::text, 'stage_10_analysis'::text, 'stage_11_analysis'::text, 'stage_12_analysis'::text, 'stage_13_analysis'::text, 'stage_14_analysis'::text, 'stage_15_analysis'::text, 'stage_16_analysis'::text, 'stage_17_analysis'::text, 'stage_17_refined'::text, 'stage_18_analysis'::text, 'stage_19_analysis'::text, 'stage_1_analysis'::text, 'stage_20_analysis'::text, 'stage_21_analysis'::text, 'stage_22_analysis'::text, 'stage_23_analysis'::text, 'stage_24_analysis'::text, 'stage_25_analysis'::text, 'stage_26_analysis'::text, 'stage_27_analysis'::text, 'stage_2_analysis'::text, 'stage_3_analysis'::text, 'stage_4_analysis'::text, 'stage_5_analysis'::text, 'stage_6_analysis'::text, 'stage_7_analysis'::text, 'stage_8_analysis'::text, 'stage_9_analysis'::text, 'stitch_budget'::text, 'stitch_curation'::text, 'stitch_design_export'::text, 'stitch_project'::text, 'stitch_qa_report'::text, 'system_devils_advocate_review'::text, 'truth_ai_critique'::text, 'truth_competitive_analysis'::text, 'truth_demand_thesis'::text, 'truth_financial_model'::text, 'truth_idea_brief'::text, 'truth_problem_statement'::text, 'truth_target_market_analysis'::text, 'truth_validation_decision'::text, 'truth_value_proposition'::text, 'value_multiplier_assessment'::text, 'visual_assets_skipped'::text, 'visual_device_screenshots'::text, 'visual_final_assets'::text, 'visual_social_graphics'::text, 'wireframe_screens'::text])));
  END IF;
END
$widen_artifact_type$;

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 5. Shift 3 live config/data tables to describe the post-v1 scheme. Guarded as a single block so
--    a second run is a true no-op (TS-9 convention, matching v1).
-- ───────────────────────────────────────────────────────────────────────────────────────────────
DO $shift_config_data$
BEGIN
  IF EXISTS (SELECT 1 FROM public.gate_boundary_config WHERE from_stage = 23 AND to_stage = 24) THEN
    -- gate_boundary_config PK is (from_stage, to_stage); no row currently occupies (24,25), so a
    -- direct UPDATE is collision-free (unlike venture_stages, which needed the two-phase trick).
    UPDATE public.gate_boundary_config
    SET from_stage = 24, to_stage = 25, updated_at = now()
    WHERE from_stage = 23 AND to_stage = 24;
  END IF;

  IF EXISTS (SELECT 1 FROM public.venture_stage_cutover_grandfather WHERE stage_number = 24) THEN
    -- PK is (venture_id, stage_number); each venture_id has exactly one row, and no row currently
    -- sits at stage_number=25, so a direct +1 UPDATE cannot collide.
    UPDATE public.venture_stage_cutover_grandfather
    SET stage_number = stage_number + 1
    WHERE stage_number BETWEEN 23 AND 26;
  END IF;

  IF EXISTS (SELECT 1 FROM public.stage_artifact_requirements WHERE stage_number = 23) THEN
    -- UNIQUE(stage_number, artifact_type) -- two-phase negative-intermediate shift, same technique
    -- v1 proved necessary for venture_stages' PK (a single-statement +1 collides mid-statement).
    -- UNLIKE venture_stages, this table ALSO carries CHECK (stage_number >= 1) -- caught live by
    -- actually dry-running this file: the negative intermediate value violates that lower bound the
    -- instant phase A runs, regardless of the upper-bound widening. Drop the constraint first, do
    -- both phases, then re-add it widened -- deliberately NOT handled in section 3 (see note there).
    ALTER TABLE public.stage_artifact_requirements DROP CONSTRAINT IF EXISTS stage_artifact_requirements_stage_number_check;

    UPDATE public.stage_artifact_requirements
    SET stage_number = -stage_number
    WHERE stage_number BETWEEN 23 AND 26;

    UPDATE public.stage_artifact_requirements
    SET stage_number = (-stage_number) + 1
    WHERE stage_number BETWEEN -26 AND -23;

    ALTER TABLE public.stage_artifact_requirements ADD CONSTRAINT stage_artifact_requirements_stage_number_check CHECK (((stage_number >= 1) AND (stage_number <= 27)));
  ELSIF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stage_artifact_requirements_stage_number_check' AND connamespace = 'public'::regnamespace AND pg_get_constraintdef(oid) LIKE '%<= 27%') THEN
    -- Idempotent re-run path: the shift already happened (no row at stage_number=23 anymore), but
    -- guard the constraint is still widened in case this file's own first run was interrupted
    -- between the DROP and the re-ADD above (this ALTER is cheap and safe to repeat).
    ALTER TABLE public.stage_artifact_requirements DROP CONSTRAINT IF EXISTS stage_artifact_requirements_stage_number_check;
    ALTER TABLE public.stage_artifact_requirements ADD CONSTRAINT stage_artifact_requirements_stage_number_check CHECK (((stage_number >= 1) AND (stage_number <= 27)));
  END IF;
END
$shift_config_data$;

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 5b. eva_ventures mirror backfill (see banner note (b)). TS-7 (this SD's own probe) measured 21
--    live eva_ventures rows going stale by exactly the +1 delta section 3's ventures UPDATE
--    produces, because those rows' eva_ventures mirror already existed from before
--    SD-LEO-ORCH-ADAM-PLAN-KEEPER-001-F's is_demo early-return guard was added to the trigger --
--    this migration's own shift is what creates the divergence, not steady-state trigger
--    behavior. Precisely scoped: only rows where the mirror is EXACTLY 1 behind the current value
--    within the post-shift 24-27 range are touched, so a pre-existing, unrelated divergence (if
--    any) is left alone rather than silently "corrected" by a blind sync. Idempotent by
--    construction: a second run finds no row still 1 behind.
-- ───────────────────────────────────────────────────────────────────────────────────────────────
UPDATE public.eva_ventures ev
SET current_lifecycle_stage = v.current_lifecycle_stage, updated_at = now()
FROM public.ventures v
WHERE ev.venture_id = v.id
  AND v.current_lifecycle_stage BETWEEN 24 AND 27
  AND ev.current_lifecycle_stage = v.current_lifecycle_stage - 1;

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 6. 3 functions this SD's own live pg_get_functiondef probe (2026-08-28) found still hardcode a
--    stage-26 ceiling or a pre-v1-shift stage literal -- missed by v1's own writer census, which
--    covered advance_venture_stage/fn_advance_venture_stage only. Full bodies below are the LIVE
--    definitions with ONLY the stage literals changed, matching v1's own "reproduce the live body
--    verbatim, change only what's named" convention.
-- ───────────────────────────────────────────────────────────────────────────────────────────────

-- fn_bootstrap_venture_stages: loop bound 1..26 -> 1..27 (a fresh bootstrap otherwise never seeds a
-- venture_stage_work row for the new top stage). v_gate_stages members >=23 shift +1 (23,24 -> 24,25),
-- matching the SAME renumber v1 already applied to venture_stages/chairman_decisions/venture_stage_work.
CREATE OR REPLACE FUNCTION public.fn_bootstrap_venture_stages(p_venture_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_venture RECORD;
  v_stage INTEGER;
  v_work_type TEXT;
  v_tier_max INTEGER;
  v_gate_stages INTEGER[] := ARRAY[3, 5, 13, 16, 17, 22, 24, 25];
BEGIN
  SELECT * INTO v_venture FROM ventures WHERE id = p_venture_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venture % not found', p_venture_id;
  END IF;

  v_tier_max := CASE v_venture.tier
    WHEN 0 THEN 3
    WHEN 1 THEN 10
    WHEN 2 THEN 15
    ELSE 27
  END;

  FOR v_stage IN 1..27 LOOP
    IF v_stage = ANY(v_gate_stages) THEN
      v_work_type := 'decision_gate';
    ELSIF v_stage = 2 THEN
      v_work_type := 'automated_check';
    ELSE
      v_work_type := 'artifact_only';
    END IF;

    INSERT INTO venture_stage_work (
      venture_id,
      lifecycle_stage,
      stage_status,
      work_type,
      started_at
    ) VALUES (
      p_venture_id,
      v_stage,
      CASE WHEN v_stage = 1 THEN 'in_progress' ELSE 'not_started' END,
      v_work_type,
      CASE WHEN v_stage = 1 THEN NOW() ELSE NULL END
    )
    ON CONFLICT (venture_id, lifecycle_stage) DO NOTHING;
  END LOOP;
END;
$function$;

-- bootstrap_venture_workflow: tier_max ELSE 26 -> 27 (tier 3+ ventures otherwise never get a
-- venture_stage_work row seeded for the new top stage). v_gate_stages members >=23 shift +1
-- (23,24,25 -> 24,25,26).
CREATE OR REPLACE FUNCTION public.bootstrap_venture_workflow(p_venture_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_venture RECORD;
  v_tier_max INTEGER;
  v_stage INTEGER;
  v_work_type TEXT;
  v_rows_created INTEGER := 0;
  v_current INTEGER;
  v_gate_stages INTEGER[] := ARRAY[3, 5, 10, 13, 17, 18, 24, 25, 26];
BEGIN
  IF NOT (public.fn_is_service_role() OR public.fn_is_chairman()
          OR public.fn_user_has_venture_access(p_venture_id)) THEN
    RAISE EXCEPTION 'access denied: venture access required (SD-MAN-FIX-SECURITY-GUARD-PACK-001)';
  END IF;

  SELECT id, name, tier, current_lifecycle_stage
    INTO v_venture
    FROM ventures
    WHERE id = p_venture_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Venture not found',
      'venture_id', p_venture_id
    );
  END IF;

  v_current := COALESCE(v_venture.current_lifecycle_stage, 1);

  v_tier_max := CASE v_venture.tier
    WHEN 0 THEN 3
    WHEN 1 THEN 10
    WHEN 2 THEN 15
    ELSE 27
  END;

  FOR v_stage IN 1..v_tier_max LOOP
    IF v_stage = ANY(v_gate_stages) THEN
      v_work_type := 'decision_gate';
    ELSIF v_stage = 2 THEN
      v_work_type := 'automated_check';
    ELSE
      v_work_type := 'artifact_only';
    END IF;

    INSERT INTO venture_stage_work (
      venture_id,
      lifecycle_stage,
      stage_status,
      work_type
    ) VALUES (
      p_venture_id,
      v_stage,
      CASE WHEN v_stage < v_current THEN 'completed'
           WHEN v_stage = v_current THEN 'in_progress'
           ELSE 'not_started'
      END,
      v_work_type
    )
    ON CONFLICT (venture_id, lifecycle_stage) DO NOTHING;

    v_rows_created := v_rows_created + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'venture_id', p_venture_id,
    'venture_name', v_venture.name,
    'stages_created', v_rows_created,
    'tier', v_venture.tier,
    'tier_max', v_tier_max
  );
END;
$function$;

-- approve_chairman_decision: SECURITY-relevant fix. The `decision` CASE literals (23->'release',
-- 26->'continue') described the PRE-v1 scheme; left unchanged they would mislabel the decision
-- recorded for the wrong stage after v1's shift. More materially, the step-up MFA gate condition
-- `v_decision.lifecycle_stage = 24` targeted the go_live decision when go_live sat at stage 24
-- (v1's own banner: "stage_key='go_live', currently stage_number=24"); after v1's shift, go_live
-- is at stage 25 -- left unchanged, this condition would silently stop requiring step-up
-- verification for the actual irreversible go_live decision and would incorrectly demand it for
-- whatever now sits at stage 24 instead. Found live via this SD's own pg_get_functiondef probe,
-- not named in v1's own "documented, not fixed" list.
CREATE OR REPLACE FUNCTION public.approve_chairman_decision(p_decision_id uuid, p_rationale text DEFAULT NULL::text, p_decided_by text DEFAULT NULL::text, p_approval_type approval_type_enum DEFAULT NULL::approval_type_enum, p_stepup_token uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_decision RECORD;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.fn_is_chairman()) THEN
    RETURN jsonb_build_object('success', false,
      'error', 'Only chairmen or service_role may approve gate decisions');
  END IF;

  IF COALESCE(p_decided_by, '') = ANY (ARRAY['monitoring_agent', 'testing_agent'])
     AND auth.role() <> 'service_role' THEN
    RETURN jsonb_build_object('success', false,
      'error', 'Agent decided_by identities may only be used by the service role');
  END IF;

  SELECT * INTO v_decision
  FROM chairman_decisions
  WHERE id = p_decision_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Decision not found or already resolved');
  END IF;

  IF (v_decision.consequence_level = 'high' OR v_decision.lifecycle_stage = 25) THEN
    PERFORM fn_verify_and_consume_stepup_token(p_stepup_token, p_decision_id);
  END IF;

  UPDATE chairman_decisions SET
    decision = CASE
      WHEN lifecycle_stage = 0 THEN 'proceed'
      WHEN lifecycle_stage = 10 THEN 'approve'
      WHEN lifecycle_stage = 24 THEN 'release'
      WHEN lifecycle_stage = 27 THEN 'continue'
      ELSE 'go'
    END,
    status = 'approved',
    rationale = COALESCE(p_rationale, 'Approved by Chairman'),
    decided_by = COALESCE(p_decided_by, auth.uid()::text),
    decided_by_user_id = auth.uid(),
    approval_type = p_approval_type,
    context = CASE
      WHEN auth.role() = 'service_role'
           AND COALESCE(p_decided_by, auth.uid()::text) = ANY (ARRAY['monitoring_agent', 'testing_agent'])
      THEN jsonb_build_object(
             'stage', v_decision.lifecycle_stage,
             'timestamp', now(),
             'decided_by', p_decided_by,
             'actor_role', auth.role(),
             'rationale', COALESCE(p_rationale, ''),
             'approval_type', p_approval_type,
             'auto_approved', true
           )
      ELSE context
    END,
    blocking = false,
    updated_at = now()
  WHERE id = p_decision_id;

  UPDATE ventures SET orchestrator_state = 'idle', updated_at = now()
  WHERE id = v_decision.venture_id AND orchestrator_state = 'blocked';

  UPDATE venture_stage_work
  SET stage_status = 'completed', completed_at = NOW()
  WHERE venture_id = v_decision.venture_id
    AND lifecycle_stage = v_decision.lifecycle_stage
    AND stage_status != 'completed';

  RETURN jsonb_build_object(
    'success', true,
    'decision_id', p_decision_id,
    'venture_id', v_decision.venture_id,
    'lifecycle_stage', v_decision.lifecycle_stage,
    'new_status', 'approved',
    'approval_type', p_approval_type
  );
END;
$function$;

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 7. POST-APPLY READBACK VERIFICATION
-- ───────────────────────────────────────────────────────────────────────────────────────────────
DO $verify$
DECLARE
  v_still_capped INTEGER;
BEGIN
  SELECT count(*) INTO v_still_capped
  FROM pg_constraint c
  WHERE c.contype = 'c'
    AND c.connamespace = 'public'::regnamespace
    AND c.conname IN (
      'compliance_events_stage_number_check', 'compliance_violations_stage_number_check',
      'convergence_ledger_stages_stage_check', 'eva_artifact_dependencies_source_stage_check',
      'eva_artifact_dependencies_target_stage_check', 'eva_stage_gate_results_stage_number_check',
      'chk_lifecycle_stage', 'eva_ventures_current_lifecycle_stage_check',
      'stage_artifact_requirements_stage_number_check',
      'stage_of_death_predictions_actual_death_stage_check',
      'stage_of_death_predictions_predicted_death_stage_check',
      'stage_prop_contracts_stage_number_check', 'stage_proving_journal_stage_number_check',
      'venture_capture_snapshots_lifecycle_stage_check', 'venture_dependencies_required_stage_check'
    )
    AND pg_get_constraintdef(c.oid) NOT LIKE '%<= 27%';
  IF v_still_capped <> 0 THEN
    RAISE EXCEPTION 'POST-APPLY FAILED: % of the 15 numeric-range CHECK constraints still do not read <= 27 after widening.', v_still_capped;
  END IF;

  IF EXISTS (SELECT 1 FROM public.gate_boundary_config WHERE from_stage = 23 AND to_stage = 24) THEN
    RAISE EXCEPTION 'POST-APPLY FAILED: gate_boundary_config still carries the pre-shift (23,24) boundary row.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.gate_boundary_config WHERE from_stage = 24 AND to_stage = 25) THEN
    RAISE EXCEPTION 'POST-APPLY FAILED: gate_boundary_config is missing the expected (24,25) boundary row.';
  END IF;

  -- NOTE: checking the whole 23-26 range here would be WRONG -- 24-26 are simultaneously legitimate
  -- POST-shift destination values (the row that was at 23 correctly lands at 24), the exact "24 and
  -- 25 are both old-range and new-destination" trap v1's own banner documents for its own verify
  -- block. Only check for the specific value(s) that should now be vacated: this table's only
  -- pre-shift occupant was 24 (live-measured 2026-08-28; no rows existed at 23/25/26), so only 24
  -- should now be empty.
  IF EXISTS (SELECT 1 FROM public.venture_stage_cutover_grandfather WHERE stage_number = 24) THEN
    RAISE EXCEPTION 'POST-APPLY FAILED: venture_stage_cutover_grandfather still carries a row at the pre-shift stage_number=24.';
  END IF;

  -- Same trap: stage_number BETWEEN -26 AND 22 would incorrectly flag the untouched, legitimate
  -- stage-22 rows this shift never touches. Only check for a negative (mid-shift) value or the
  -- specific pre-shift value (23) that should now be vacated.
  IF EXISTS (SELECT 1 FROM public.stage_artifact_requirements WHERE stage_number < 0 OR stage_number = 23) THEN
    RAISE EXCEPTION 'POST-APPLY FAILED: stage_artifact_requirements has a row left in an intermediate or pre-shift state.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.eva_ventures ev JOIN public.ventures v ON v.id = ev.venture_id
    WHERE v.current_lifecycle_stage BETWEEN 24 AND 27 AND ev.current_lifecycle_stage = v.current_lifecycle_stage - 1
  ) THEN
    RAISE EXCEPTION 'POST-APPLY FAILED: at least one eva_ventures row remains 1 stage behind its ventures row after the section 5b backfill.';
  END IF;

  RAISE NOTICE 'STAGE-KEYED-DATA-001 v2: post-apply verification passed.';
END
$verify$;
