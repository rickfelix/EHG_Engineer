-- SD-LEO-INFRA-STAGE-KEYED-DATA-001 — rollback for 20260828_stage_keyed_data_config_widen_v2.sql.
--
-- ⚠️ WHAT ROLLING BACK DOES, STATED BEFORE THE COMMAND SO IT IS READ:
--
--   1. NARROWS 15 CHECK CONSTRAINTS BACK TO <= 26 and reverts the venture_artifacts_artifact_type
--      enum to drop 'stage_27_analysis'. This is UNSAFE if any row has been written at stage_number
--      = 27 (or artifact_type = 'stage_27_analysis') since v2 applied -- narrowing a CHECK does not
--      delete or move the offending rows, it makes the ALTER itself fail with a constraint
--      violation. The guard below checks for this and refuses to narrow if any such row exists,
--      rather than leaving the schema in a half-reverted state.
--
--   2. SHIFTS 3 DATA TABLES BACK (-1): gate_boundary_config's (24,25) boundary row back to (23,24),
--      venture_stage_cutover_grandfather's stage-25 rows back to 24, stage_artifact_requirements'
--      24-27 rows back to 23-26 (two-phase, same technique the forward migration used). Same
--      caveat as (1): this is a real DATA change, not just a schema one -- verify no other process
--      has since relied on the post-v2 values before rolling back.
--
--   3. REVERTS fn_bootstrap_venture_stages, bootstrap_venture_workflow, approve_chairman_decision
--      to their PRE-v2 bodies (loop bound 26, gate_stages arrays un-shifted, and CRITICALLY the
--      approve_chairman_decision step-up gate reverts to checking lifecycle_stage = 24 instead of
--      25 -- this UNDOES the security fix v2 made; do not roll back past this point while any
--      go_live decision might be pending approval, or the step-up MFA gate will silently stop
--      protecting it again).
--
--   4. DROPS fn_parked_venture_preflight(). Safe only if nothing else has started calling it --
--      this SD's own scripts/eva/uat-stage-migration-preconditions.mjs update falls back to its
--      pre-existing JS-only classification when this function is absent, so dropping it does not
--      break that script, only removes the shared-implementation benefit FR-5 added.
--
-- Does NOT revert v1 (20260825_dedicated_venture_uat_stage_insert_and_renumber.sql) -- this file is
-- v2's own rollback only. v1 has its own independent apply/rollback lifecycle.
--
-- APPLY (chairman ceremony, same tooling as the forward file):
--   node scripts/apply-migration.js --issue-token
--   MIGRATION_APPLY_TOKEN=<token> node scripts/apply-migration.js \
--     "database/chairman-gated/20260828_stage_keyed_data_config_widen_v2_DOWN.sql" \
--     --prod-deploy --allow-any-path

DO $guard_no_stage_27_writes$
DECLARE
  v_offenders jsonb := '[]'::jsonb;
BEGIN
  IF EXISTS (SELECT 1 FROM public.compliance_events WHERE stage_number = 27) THEN v_offenders := v_offenders || '"compliance_events"'::jsonb; END IF;
  IF EXISTS (SELECT 1 FROM public.compliance_violations WHERE stage_number = 27) THEN v_offenders := v_offenders || '"compliance_violations"'::jsonb; END IF;
  IF EXISTS (SELECT 1 FROM public.convergence_ledger_stages WHERE stage = 27) THEN v_offenders := v_offenders || '"convergence_ledger_stages"'::jsonb; END IF;
  IF EXISTS (SELECT 1 FROM public.eva_artifact_dependencies WHERE source_stage = 27 OR target_stage = 27) THEN v_offenders := v_offenders || '"eva_artifact_dependencies"'::jsonb; END IF;
  IF EXISTS (SELECT 1 FROM public.eva_stage_gate_results WHERE stage_number = 27) THEN v_offenders := v_offenders || '"eva_stage_gate_results"'::jsonb; END IF;
  IF EXISTS (SELECT 1 FROM public.eva_ventures WHERE current_lifecycle_stage = 27) THEN v_offenders := v_offenders || '"eva_ventures"'::jsonb; END IF;
  -- stage_artifact_requirements deliberately EXCLUDED from this guard: unlike every other table
  -- here, its rows at stage_number=27 are EXPECTED, legitimate content v2's own forward shift
  -- produced (growth_optimization_roadmap/growth_playbook, shifted from 26), and section 2 below
  -- already has a dedicated two-phase reversal path for exactly this table -- flagging it here
  -- would refuse a rollback DOWN's own next section is fully equipped to perform correctly.
  IF EXISTS (SELECT 1 FROM public.stage_of_death_predictions WHERE actual_death_stage = 27 OR predicted_death_stage = 27) THEN v_offenders := v_offenders || '"stage_of_death_predictions"'::jsonb; END IF;
  IF EXISTS (SELECT 1 FROM public.stage_prop_contracts WHERE stage_number = 27) THEN v_offenders := v_offenders || '"stage_prop_contracts"'::jsonb; END IF;
  IF EXISTS (SELECT 1 FROM public.stage_proving_journal WHERE stage_number = 27) THEN v_offenders := v_offenders || '"stage_proving_journal"'::jsonb; END IF;
  IF EXISTS (SELECT 1 FROM public.venture_capture_snapshots WHERE lifecycle_stage = 27) THEN v_offenders := v_offenders || '"venture_capture_snapshots"'::jsonb; END IF;
  IF EXISTS (SELECT 1 FROM public.venture_dependencies WHERE required_stage = 27) THEN v_offenders := v_offenders || '"venture_dependencies"'::jsonb; END IF;
  IF EXISTS (SELECT 1 FROM public.venture_artifacts WHERE artifact_type = 'stage_27_analysis') THEN v_offenders := v_offenders || '"venture_artifacts"'::jsonb; END IF;

  IF jsonb_array_length(v_offenders) > 0 THEN
    RAISE EXCEPTION 'ROLLBACK REFUSED: % table(s) carry a row at stage 27 written since v2 applied -- narrowing the CHECK constraints back to <= 26 would fail against live data. Resolve those rows (move or delete) before rolling back. Offending tables: %', jsonb_array_length(v_offenders), v_offenders;
  END IF;
END
$guard_no_stage_27_writes$;

-- ── 1. Narrow the 15 numeric-range CHECK constraints back to <= 26 ──────────────────────────────
ALTER TABLE public.compliance_events DROP CONSTRAINT IF EXISTS compliance_events_stage_number_check;
ALTER TABLE public.compliance_events ADD CONSTRAINT compliance_events_stage_number_check CHECK (((stage_number >= 1) AND (stage_number <= 26)));

ALTER TABLE public.compliance_violations DROP CONSTRAINT IF EXISTS compliance_violations_stage_number_check;
ALTER TABLE public.compliance_violations ADD CONSTRAINT compliance_violations_stage_number_check CHECK (((stage_number >= 1) AND (stage_number <= 26)));

ALTER TABLE public.convergence_ledger_stages DROP CONSTRAINT IF EXISTS convergence_ledger_stages_stage_check;
ALTER TABLE public.convergence_ledger_stages ADD CONSTRAINT convergence_ledger_stages_stage_check CHECK (((stage >= 0) AND (stage <= 26)));

ALTER TABLE public.eva_artifact_dependencies DROP CONSTRAINT IF EXISTS eva_artifact_dependencies_source_stage_check;
ALTER TABLE public.eva_artifact_dependencies ADD CONSTRAINT eva_artifact_dependencies_source_stage_check CHECK (((source_stage >= 1) AND (source_stage <= 26)));

ALTER TABLE public.eva_artifact_dependencies DROP CONSTRAINT IF EXISTS eva_artifact_dependencies_target_stage_check;
ALTER TABLE public.eva_artifact_dependencies ADD CONSTRAINT eva_artifact_dependencies_target_stage_check CHECK (((target_stage >= 1) AND (target_stage <= 26)));

ALTER TABLE public.eva_stage_gate_results DROP CONSTRAINT IF EXISTS eva_stage_gate_results_stage_number_check;
ALTER TABLE public.eva_stage_gate_results ADD CONSTRAINT eva_stage_gate_results_stage_number_check CHECK (((stage_number >= 1) AND (stage_number <= 26)));

ALTER TABLE public.eva_ventures DROP CONSTRAINT IF EXISTS chk_lifecycle_stage;
ALTER TABLE public.eva_ventures ADD CONSTRAINT chk_lifecycle_stage CHECK (((current_lifecycle_stage >= 1) AND (current_lifecycle_stage <= 26)));

ALTER TABLE public.eva_ventures DROP CONSTRAINT IF EXISTS eva_ventures_current_lifecycle_stage_check;
ALTER TABLE public.eva_ventures ADD CONSTRAINT eva_ventures_current_lifecycle_stage_check CHECK (((current_lifecycle_stage >= 1) AND (current_lifecycle_stage <= 26)));

ALTER TABLE public.stage_of_death_predictions DROP CONSTRAINT IF EXISTS stage_of_death_predictions_actual_death_stage_check;
ALTER TABLE public.stage_of_death_predictions ADD CONSTRAINT stage_of_death_predictions_actual_death_stage_check CHECK (((actual_death_stage IS NULL) OR ((actual_death_stage >= 1) AND (actual_death_stage <= 26))));

ALTER TABLE public.stage_of_death_predictions DROP CONSTRAINT IF EXISTS stage_of_death_predictions_predicted_death_stage_check;
ALTER TABLE public.stage_of_death_predictions ADD CONSTRAINT stage_of_death_predictions_predicted_death_stage_check CHECK (((predicted_death_stage >= 1) AND (predicted_death_stage <= 26)));

ALTER TABLE public.stage_prop_contracts DROP CONSTRAINT IF EXISTS stage_prop_contracts_stage_number_check;
ALTER TABLE public.stage_prop_contracts ADD CONSTRAINT stage_prop_contracts_stage_number_check CHECK (((stage_number >= 1) AND (stage_number <= 26)));

ALTER TABLE public.stage_proving_journal DROP CONSTRAINT IF EXISTS stage_proving_journal_stage_number_check;
ALTER TABLE public.stage_proving_journal ADD CONSTRAINT stage_proving_journal_stage_number_check CHECK (((stage_number >= 1) AND (stage_number <= 26)));

ALTER TABLE public.venture_capture_snapshots DROP CONSTRAINT IF EXISTS venture_capture_snapshots_lifecycle_stage_check;
ALTER TABLE public.venture_capture_snapshots ADD CONSTRAINT venture_capture_snapshots_lifecycle_stage_check CHECK (((lifecycle_stage >= 1) AND (lifecycle_stage <= 26)));

ALTER TABLE public.venture_dependencies DROP CONSTRAINT IF EXISTS venture_dependencies_required_stage_check;
ALTER TABLE public.venture_dependencies ADD CONSTRAINT venture_dependencies_required_stage_check CHECK (((required_stage >= 1) AND (required_stage <= 26)));

-- ── 2. Revert stage_artifact_requirements CHECK to allow the reverse two-phase shift, run it,
--       then re-narrow (mirrors the forward file's own drop/shift/re-add pattern) ────────────────
DO $revert_stage_artifact_requirements$
BEGIN
  IF EXISTS (SELECT 1 FROM public.stage_artifact_requirements WHERE stage_number = 24) THEN
    ALTER TABLE public.stage_artifact_requirements DROP CONSTRAINT IF EXISTS stage_artifact_requirements_stage_number_check;

    UPDATE public.stage_artifact_requirements SET stage_number = -stage_number WHERE stage_number BETWEEN 24 AND 27;
    UPDATE public.stage_artifact_requirements SET stage_number = (-stage_number) - 1 WHERE stage_number BETWEEN -27 AND -24;

    ALTER TABLE public.stage_artifact_requirements ADD CONSTRAINT stage_artifact_requirements_stage_number_check CHECK (((stage_number >= 1) AND (stage_number <= 26)));
  END IF;
END
$revert_stage_artifact_requirements$;

-- ── 3. Revert the enum widen (drop 'stage_27_analysis') ─────────────────────────────────────────
ALTER TABLE public.venture_artifacts DROP CONSTRAINT IF EXISTS venture_artifacts_artifact_type_check;
ALTER TABLE public.venture_artifacts ADD CONSTRAINT venture_artifacts_artifact_type_check CHECK (((artifact_type)::text = ANY (ARRAY['blueprint_api_contract'::text, 'blueprint_data_model'::text, 'blueprint_erd_diagram'::text, 'blueprint_financial_projection'::text, 'blueprint_launch_readiness'::text, 'blueprint_positioning_brief'::text, 'blueprint_product_roadmap'::text, 'blueprint_project_plan'::text, 'blueprint_promotion_gate'::text, 'blueprint_review_summary'::text, 'blueprint_risk_register'::text, 'blueprint_schema_spec'::text, 'blueprint_sprint_plan'::text, 'blueprint_technical_architecture'::text, 'blueprint_token_manifest'::text, 'blueprint_user_journey'::text, 'blueprint_user_story_pack'::text, 'blueprint_wireframes'::text, 'build_cicd_config'::text, 'build_deviation_record'::text, 'build_mvp_build'::text, 'build_security_audit'::text, 'build_system_prompt'::text, 'build_test_coverage_report'::text, 'code_quality_report'::text, 'design_token_manifest'::text, 'distribution_ad_copy'::text, 'distribution_block_marker'::text, 'distribution_channel_config'::text, 'distribution_skip_marker'::text, 'economic_lens'::text, 'engine_business_model_canvas'::text, 'engine_exit_strategy'::text, 'engine_pricing_model'::text, 'engine_revenue_model'::text, 'engine_risk_assessment'::text, 'engine_risk_matrix'::text, 'growth_optimization_roadmap'::text, 'growth_playbook'::text, 'identity_brand_guidelines'::text, 'identity_brand_name'::text, 'identity_gtm_sales_strategy'::text, 'identity_logo_image'::text, 'identity_naming_visual'::text, 'identity_persona_brand'::text, 'intake_venture_analysis'::text, 'launch_analytics_dashboard'::text, 'launch_assumptions_vs_reality'::text, 'launch_churn_triggers'::text, 'launch_deployment_runbook'::text, 'launch_health_scoring'::text, 'launch_launch_metrics'::text, 'launch_marketing_checklist'::text, 'launch_metrics'::text, 'launch_optimization_roadmap'::text, 'launch_production_app'::text, 'launch_readiness_checklist'::text, 'launch_retention_playbook'::text, 'launch_test_plan'::text, 'launch_uat_report'::text, 'launch_user_feedback_summary'::text, 'lifecycle_sd_bridge'::text, 'marketing_app_store_desc'::text, 'marketing_blog_draft'::text, 'marketing_email_onboarding'::text, 'marketing_email_reengagement'::text, 'marketing_email_welcome'::text, 'marketing_landing_hero'::text, 'marketing_seo_meta'::text, 'marketing_social_posts'::text, 'marketing_tagline'::text, 'post_lifecycle_decision'::text, 'postlaunch_analytics_dashboard'::text, 'postlaunch_assumptions_vs_reality'::text, 'postlaunch_user_feedback_summary'::text, 's17_approved'::text, 's17_approved_png'::text, 's17_archetypes'::text, 's17_design_system'::text, 's17_fill_screen'::text, 's17_preview'::text, 's17_qa_report'::text, 's17_session_state'::text, 's17_strategy_recommendation'::text, 's17_strategy_stats'::text, 's17_variant_scores'::text, 's17_variant_wip'::text, 'stage_0_analysis'::text, 'stage_10_analysis'::text, 'stage_11_analysis'::text, 'stage_12_analysis'::text, 'stage_13_analysis'::text, 'stage_14_analysis'::text, 'stage_15_analysis'::text, 'stage_16_analysis'::text, 'stage_17_analysis'::text, 'stage_17_refined'::text, 'stage_18_analysis'::text, 'stage_19_analysis'::text, 'stage_1_analysis'::text, 'stage_20_analysis'::text, 'stage_21_analysis'::text, 'stage_22_analysis'::text, 'stage_23_analysis'::text, 'stage_24_analysis'::text, 'stage_25_analysis'::text, 'stage_26_analysis'::text, 'stage_2_analysis'::text, 'stage_3_analysis'::text, 'stage_4_analysis'::text, 'stage_5_analysis'::text, 'stage_6_analysis'::text, 'stage_7_analysis'::text, 'stage_8_analysis'::text, 'stage_9_analysis'::text, 'stitch_budget'::text, 'stitch_curation'::text, 'stitch_design_export'::text, 'stitch_project'::text, 'stitch_qa_report'::text, 'system_devils_advocate_review'::text, 'truth_ai_critique'::text, 'truth_competitive_analysis'::text, 'truth_demand_thesis'::text, 'truth_financial_model'::text, 'truth_idea_brief'::text, 'truth_problem_statement'::text, 'truth_target_market_analysis'::text, 'truth_validation_decision'::text, 'truth_value_proposition'::text, 'value_multiplier_assessment'::text, 'visual_assets_skipped'::text, 'visual_device_screenshots'::text, 'visual_final_assets'::text, 'visual_social_graphics'::text, 'wireframe_screens'::text])));

-- ── 4. Reverse the data shifts ───────────────────────────────────────────────────────────────────
UPDATE public.gate_boundary_config SET from_stage = 23, to_stage = 24, updated_at = now() WHERE from_stage = 24 AND to_stage = 25;
UPDATE public.venture_stage_cutover_grandfather SET stage_number = stage_number - 1 WHERE stage_number = 25;

-- ── 5. Revert the 3 functions to their PRE-v2 bodies ────────────────────────────────────────────
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
  v_gate_stages INTEGER[] := ARRAY[3, 5, 13, 16, 17, 22, 23, 24];
BEGIN
  SELECT * INTO v_venture FROM ventures WHERE id = p_venture_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venture % not found', p_venture_id;
  END IF;

  v_tier_max := CASE v_venture.tier
    WHEN 0 THEN 3
    WHEN 1 THEN 10
    WHEN 2 THEN 15
    ELSE 26
  END;

  FOR v_stage IN 1..26 LOOP
    IF v_stage = ANY(v_gate_stages) THEN
      v_work_type := 'decision_gate';
    ELSIF v_stage = 2 THEN
      v_work_type := 'automated_check';
    ELSE
      v_work_type := 'artifact_only';
    END IF;

    INSERT INTO venture_stage_work (
      venture_id, lifecycle_stage, stage_status, work_type, started_at
    ) VALUES (
      p_venture_id, v_stage,
      CASE WHEN v_stage = 1 THEN 'in_progress' ELSE 'not_started' END,
      v_work_type,
      CASE WHEN v_stage = 1 THEN NOW() ELSE NULL END
    )
    ON CONFLICT (venture_id, lifecycle_stage) DO NOTHING;
  END LOOP;
END;
$function$;

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
  v_gate_stages INTEGER[] := ARRAY[3, 5, 10, 13, 17, 18, 23, 24, 25];
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
    RETURN jsonb_build_object('success', false, 'error', 'Venture not found', 'venture_id', p_venture_id);
  END IF;

  v_current := COALESCE(v_venture.current_lifecycle_stage, 1);

  v_tier_max := CASE v_venture.tier
    WHEN 0 THEN 3
    WHEN 1 THEN 10
    WHEN 2 THEN 15
    ELSE 26
  END;

  FOR v_stage IN 1..v_tier_max LOOP
    IF v_stage = ANY(v_gate_stages) THEN
      v_work_type := 'decision_gate';
    ELSIF v_stage = 2 THEN
      v_work_type := 'automated_check';
    ELSE
      v_work_type := 'artifact_only';
    END IF;

    INSERT INTO venture_stage_work (venture_id, lifecycle_stage, stage_status, work_type)
    VALUES (
      p_venture_id, v_stage,
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
    'success', true, 'venture_id', p_venture_id, 'venture_name', v_venture.name,
    'stages_created', v_rows_created, 'tier', v_venture.tier, 'tier_max', v_tier_max
  );
END;
$function$;

-- ⚠️ SECURITY REGRESSION ON ROLLBACK: this reverts the step-up MFA gate condition back to
-- `lifecycle_stage = 24`, which v2 fixed to `= 25` because go_live sits at stage 25 post-v1-shift.
-- Rolling back to this version means the step-up gate stops protecting the real go_live decision
-- again. Do not roll back while v1 remains applied and any go_live decision might be pending.
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

  IF (v_decision.consequence_level = 'high' OR v_decision.lifecycle_stage = 24) THEN
    PERFORM fn_verify_and_consume_stepup_token(p_stepup_token, p_decision_id);
  END IF;

  UPDATE chairman_decisions SET
    decision = CASE
      WHEN lifecycle_stage = 0 THEN 'proceed'
      WHEN lifecycle_stage = 10 THEN 'approve'
      WHEN lifecycle_stage = 23 THEN 'release'
      WHEN lifecycle_stage = 26 THEN 'continue'
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

-- ── 6. Drop the shared preflight function ────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_parked_venture_preflight(integer, integer, boolean);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_lifecycle_stage' AND connamespace = 'public'::regnamespace AND pg_get_constraintdef(oid) LIKE '%<= 27%') THEN
    RAISE EXCEPTION 'ROLLBACK FAILED: eva_ventures.chk_lifecycle_stage still reads <= 27.';
  END IF;
  IF to_regprocedure('public.fn_parked_venture_preflight(integer, integer, boolean)') IS NOT NULL THEN
    RAISE EXCEPTION 'ROLLBACK FAILED: fn_parked_venture_preflight still exists.';
  END IF;
END $$;
