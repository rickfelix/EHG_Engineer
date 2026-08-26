-- SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-A -- shared venture-agnostic usage-event ingestion
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- STAGED, NOT APPLIED. CHAIRMAN-GATED. DO NOT RUN THIS FILE.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- AWAITING CHAIRMAN REVIEW -- no @approved-by stamp exists for this file yet, deliberately.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT THIS FILE DOES
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Generalizes AltifyAI's already-built usage-event tracking (altifyai/lib/events/track.js, which
-- today writes only to a local Cloudflare D1 table) into venture-agnostic shared infrastructure:
-- a new venture_usage_events table plus an anon-callable, ingest-key-bound SECURITY DEFINER RPC
-- (fn_submit_venture_usage_event), mirroring fn_submit_venture_feedback/fn_submit_venture_error
-- (database/chairman-gated/20260812_venture_ingest_key_binding.sql) where their design transfers,
-- and deliberately diverging where DESIGN/DATABASE/TESTING sub-agent review (PLAN phase, this SD)
-- found the precedent would be unsafe to copy verbatim:
--
-- (1) DEDICATED RATE-LIMIT SUBSTRATE, NOT A REUSE OF THE PRECEDENT'S. fn_venture_ingest_prior_
--     hour_count/fn_anon_ingress_prior_hour_count both count FROM public.feedback -- reusing them
--     here would make the limiter blind to its own subject (usage volume never trips the cap)
--     while unrelated feedback traffic spuriously consumes the usage budget. This file adds its
--     own in-body per-venture count against venture_usage_events.ingested_at (never created_at --
--     see the timestamp-split note below) plus an O(1) tumbling-hour-bucket counter table for the
--     global cap, since a naive count(*) over a rolling window is quadratic in traffic at scale.
--
-- (2) A CALLER-SUPPLIED created_at IS NEVER A SECURITY-RELEVANT AXIS. The scope for this SD
--     required "an app-generated created_at with no DB-side default" AND a fixed parameter
--     signature -- two requirements that cannot both hold with a 5-parameter RPC, since no
--     parameter would carry a timestamp. Resolved with a 6th OPTIONAL parameter, p_occurred_at
--     (DEFAULT NULL, so the originally-scoped 5-arg call still works verbatim over PostgREST, no
--     PGRST203 overload). A caller-supplied timestamp is caller-CONTROLLED, so it is bounded
--     (created_at BETWEEN ingested_at - 30 days AND ingested_at + 5 minutes) and NEVER read by the
--     rate limiter or the artifact-cooldown logic below -- both key exclusively on ingested_at
--     (server-generated, clock_timestamp(), no default trusted from the caller).
--
-- (3) THE RPC SELF-PRODUCES ITS OWN GATE-WITNESS ARTIFACT. This SD also wires a new required_
--     artifacts entry into the launch_readiness_gate (Stage 23) kill gate -- but nothing in this
--     SD's own 5-child decomposition family would otherwise WRITE the venture_artifacts row that
--     satisfies it (a sibling child adds only venture_usage_events rows, which the gate does not
--     check). This repo already shipped exactly this failure once: tests/unit/eva/artifact-type-
--     producer-parity.test.js's own header records truth_demand_thesis -- "declared, gate-enforced,
--     and writable by nothing -- passed CI continuously while every venture reaching that stage
--     blocked in production". Fixed here by having fn_submit_venture_usage_event itself upsert the
--     venture_artifacts witness row on every successful ingestion, in the SAME transaction, with
--     NO exception handler around it -- if the upsert fails, the whole call fails, rather than
--     silently reporting event-ingestion success while the gate witness silently never lands.
--
-- (4) THE GATE'S required_artifacts APPEND IS KEYED BY stage_key, NEVER stage_number=23.
--     SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-B (pending_approval/LEAD_FINAL at authoring time) will
--     renumber venture_stages 23-26 to 24-27 by inserting a new UAT stage. This file's own
--     $migration_body$ DO block below resolves the target row by stage_key='launch_readiness_gate'
--     (venture_stages.stage_key is UNIQUE; stage_number is only the PK, not stable across that
--     pending renumbering). CONFIRMED (DATABASE sub-agent, measured against live prosrc): both
--     runtime gate-READ paths -- fn_advance_venture_stage and lib/eva/stage-artifact-precondition.js
--     -- already read venture_stages.required_artifacts generically (unnest/NOT EXISTS server-side;
--     plain array read client-side, no hardcoded artifact-type list) and key their OWN reads on
--     stage_number as they already do today, unaffected by which number is current at runtime.
--     Zero code edits to either gate-READ path are needed or made by this file; only this
--     migration's own row-LOCATOR must avoid a hardcoded 23.
--
-- (5) A FRESH PUBLIC TABLE ON THIS INSTANCE INHERITS ANON READ+WRITE BY DEFAULT (DATABASE sub-agent
--     finding, measured live via pg_default_acl: postgres/supabase_admin grant anon arwdDxtm on
--     every new public-schema table). venture_usage_events and venture_usage_ingest_global_bucket
--     would be directly anon-writable, bypassing this file's own ingest-secret RPC entirely, unless
--     explicitly revoked -- so both new tables get the same explicit REVOKE + RLS-deny-by-absence +
--     DO $verify$ four-privilege assertion this table family already established.
--
-- OVERSIZED-PAYLOAD RESOLUTION: app-side truncation (mirroring fn_submit_venture_error's p_context
-- handling) is the PRIMARY path for an oversized p_properties -- truncated to {truncated:true}
-- BEFORE insert, not rejected. The DB-level octet_length CHECK below is a defense-in-depth backstop
-- that should never fire on the RPC path; it exists to catch a direct-insert bypass or a future bug
-- in the truncation logic, and SHOULD raise loudly (23514) if it ever does.
--
-- ROLLBACK: additive-only file (one new table, one new bucket table, one new RPC, one new artifact-
-- type CHECK-constraint value, one required_artifacts array append). See the ROLLBACK block at the
-- foot of this file.

BEGIN;

-- ============================================================
-- 1. venture_usage_events: the shared, venture-agnostic usage-event log.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.venture_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES public.ventures(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_name TEXT NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- DATA axis: caller-supplied (via p_occurred_at, defaults to now() if omitted). Bounded below,
  -- but NEVER read by a security/rate-limit decision -- see file header note (2).
  created_at TIMESTAMPTZ NOT NULL,
  -- SECURITY axis: server-only, real wall-clock ingestion time. Every rate-limit and cooldown
  -- check in this file reads THIS column, never created_at.
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),

  CONSTRAINT venture_usage_events_event_type_check
    CHECK (event_type IN ('page_view', 'custom_event')),
  -- Name-agnostic pairing CHECK (AltifyAI's migration-level fix over the apexniche-ai original,
  -- which had two INDEPENDENT CHECKs that jointly accepted an inconsistent pair). event_name is
  -- intentionally left un-enumerated: apexniche-ai and AltifyAI's own event-name vocabularies are
  -- disjoint except 'page_view', so a closed event_name CHECK on this SHARED table would require a
  -- chairman-gated migration for every future venture's vocabulary.
  CONSTRAINT venture_usage_events_pairing_check
    CHECK (
      (event_name = 'page_view' AND event_type = 'page_view')
      OR (event_name <> 'page_view' AND event_type = 'custom_event')
    ),
  CONSTRAINT venture_usage_events_event_name_length_check
    CHECK (length(event_name) BETWEEN 1 AND 100),
  CONSTRAINT venture_usage_events_properties_shape_check
    CHECK (jsonb_typeof(properties) = 'object'),
  -- Backstop only -- see file header "OVERSIZED-PAYLOAD RESOLUTION" note. Should never fire via
  -- the RPC path.
  CONSTRAINT venture_usage_events_properties_size_check
    CHECK (octet_length(properties::text) <= 8000),
  -- PII-denylist backstop: a small set of keys that must never appear in an unstructured usage
  -- payload, closing the GDPR/erasure-boundary risk this SD's risk register flags (a venture-
  -- originated row cannot be reached by an erasure cascade in a DIFFERENT venture's database).
  CONSTRAINT venture_usage_events_properties_no_pii_keys_check
    CHECK (NOT (properties ?| ARRAY['user_id', 'email', 'phone', 'ssn', 'password', 'ip_address'])),
  -- Bounds a caller-supplied created_at without ever letting it become a security-relevant axis.
  CONSTRAINT venture_usage_events_created_at_bound_check
    CHECK (created_at BETWEEN ingested_at - interval '30 days' AND ingested_at + interval '5 minutes')
);

COMMENT ON TABLE public.venture_usage_events IS
  'SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-A: shared, venture-agnostic usage-event log (page_view / '
  'custom_event), generalized from AltifyAI''s lib/events/track.js. created_at is caller-supplied '
  '(data axis, bounded); ingested_at is server-only (security/rate-limit axis, never caller-'
  'controlled). RLS-deny-all plus an explicit REVOKE below -- see fn_submit_venture_error''s '
  'venture_ingest_keys precedent for why the REVOKE is not redundant with RLS on this instance.';

ALTER TABLE public.venture_usage_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.venture_usage_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.venture_usage_events TO service_role;

CREATE INDEX IF NOT EXISTS idx_venture_usage_events_venture_created
  ON public.venture_usage_events (venture_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_venture_usage_events_venture_ingested
  ON public.venture_usage_events (venture_id, ingested_at DESC);
CREATE INDEX IF NOT EXISTS idx_venture_usage_events_ingested
  ON public.venture_usage_events (ingested_at DESC);

-- ============================================================
-- 2. venture_usage_ingest_global_bucket: O(1) tumbling-hour counter for the global rate cap.
--    A naive count(*)-over-window global check would be quadratic in traffic at scale; this is a
--    single-row-per-hour increment instead.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.venture_usage_ingest_global_bucket (
  bucket_hour TIMESTAMPTZ PRIMARY KEY,
  event_count BIGINT NOT NULL DEFAULT 0
);

COMMENT ON TABLE public.venture_usage_ingest_global_bucket IS
  'SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-A: O(1) tumbling-hour-bucket counter for the global usage-'
  'event rate cap, keyed by date_trunc(''hour'', clock_timestamp()). One row per hour, incremented '
  'in-body by fn_submit_venture_usage_event -- avoids a quadratic count(*)-over-window check.';

ALTER TABLE public.venture_usage_ingest_global_bucket ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.venture_usage_ingest_global_bucket FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.venture_usage_ingest_global_bucket TO service_role;

-- ============================================================
-- 3. fn_venture_usage_event_prior_hour_count: per-venture rate-limit basis, dedicated to
--    venture_usage_events (NOT a reuse of fn_venture_ingest_prior_hour_count -- see file header
--    note (1)). Not anon/authenticated-executable: reached only via a nested call from inside
--    fn_submit_venture_usage_event, which executes as the function owner regardless of grants.
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_venture_usage_event_prior_hour_count(p_venture_id UUID)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT count(*)
  FROM public.venture_usage_events e
  WHERE e.venture_id = p_venture_id
    AND e.ingested_at > clock_timestamp() - interval '1 hour';
$function$;

COMMENT ON FUNCTION public.fn_venture_usage_event_prior_hour_count(UUID) IS
  'SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-A: per-venture prior-hour usage-event count, keyed on '
  'ingested_at (server axis), never created_at (caller-controlled axis). Dedicated to '
  'venture_usage_events -- NOT a reuse of fn_venture_ingest_prior_hour_count, which counts FROM '
  'public.feedback and would be blind to usage-event volume entirely.';

REVOKE EXECUTE ON FUNCTION public.fn_venture_usage_event_prior_hour_count(UUID) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 4. fn_submit_venture_usage_event: the anon-callable, ingest-key-bound RPC. Response is EXACTLY
--    three keys on every branch: {ok, id, reason}. RAISE for anything the caller must fix or must
--    not retry (auth, malformed input); RETURN {ok:false,...} only for a well-formed,
--    authenticated call deliberately not stored due to backpressure.
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_submit_venture_usage_event(
  p_venture_id UUID,
  p_ingest_secret TEXT,
  p_event_type TEXT,
  p_event_name TEXT,
  p_properties JSONB,
  p_occurred_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new_id UUID;
  v_stage_number INTEGER;
  v_properties JSONB;
  v_created_at TIMESTAMPTZ;
  v_bucket_hour TIMESTAMPTZ;
  v_global_count BIGINT;
BEGIN
  -- NULL-parameter guard, before any other check -- distinct from a present-but-invalid value.
  IF p_venture_id IS NULL OR p_ingest_secret IS NULL OR p_event_type IS NULL OR p_event_name IS NULL THEN
    RAISE EXCEPTION 'fn_submit_venture_usage_event: required parameter is NULL' USING ERRCODE = '22004';
  END IF;

  -- Ownership check FIRST, before ANY other validation -- so a nonexistent venture_id and a real
  -- venture_id with the wrong secret are indistinguishable, and so a present-but-invalid
  -- event_type/event_name can NEVER leak venture existence to an unauthenticated caller by
  -- raising a different error class before this check runs.
  IF public._verify_venture_ingest_secret(p_venture_id, p_ingest_secret) IS NOT TRUE THEN
    RAISE EXCEPTION 'fn_submit_venture_usage_event: unauthorized' USING ERRCODE = '28000';
  END IF;

  IF public.venture_exists_and_active(p_venture_id) IS NOT TRUE THEN
    -- Defense-in-depth: a venture can be soft-deleted or have ingestion disabled after its key
    -- was provisioned. Same uniform code -- do not distinguish "deactivated" from "unauthorized".
    RAISE EXCEPTION 'fn_submit_venture_usage_event: unauthorized' USING ERRCODE = '28000';
  END IF;

  -- All other validation only after the ownership check has already passed.
  IF p_event_type NOT IN ('page_view', 'custom_event') THEN
    RAISE EXCEPTION 'fn_submit_venture_usage_event: invalid event_type' USING ERRCODE = '22023';
  END IF;
  IF length(p_event_name) < 1 OR length(p_event_name) > 100 THEN
    RAISE EXCEPTION 'fn_submit_venture_usage_event: invalid event_name length' USING ERRCODE = '22023';
  END IF;
  IF NOT (
    (p_event_name = 'page_view' AND p_event_type = 'page_view')
    OR (p_event_name <> 'page_view' AND p_event_type = 'custom_event')
  ) THEN
    RAISE EXCEPTION 'fn_submit_venture_usage_event: invalid event_type/event_name pairing' USING ERRCODE = '22023';
  END IF;

  -- Oversized-payload resolution: app-side truncation is the PRIMARY path (mirrors
  -- fn_submit_venture_error's p_context handling) -- the DB-level size CHECK is a backstop that
  -- should never fire given this truncation runs first.
  v_properties := COALESCE(p_properties, '{}'::jsonb);
  IF jsonb_typeof(v_properties) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'fn_submit_venture_usage_event: properties must be a JSON object' USING ERRCODE = '22023';
  END IF;
  IF octet_length(v_properties::text) > 8000 THEN
    v_properties := jsonb_build_object('truncated', true);
  END IF;
  IF v_properties ?| ARRAY['user_id', 'email', 'phone', 'ssn', 'password', 'ip_address'] THEN
    RAISE EXCEPTION 'fn_submit_venture_usage_event: properties may not contain a direct PII key' USING ERRCODE = '22023';
  END IF;

  v_created_at := COALESCE(p_occurred_at, clock_timestamp());
  IF v_created_at < clock_timestamp() - interval '30 days' OR v_created_at > clock_timestamp() + interval '5 minutes' THEN
    RAISE EXCEPTION 'fn_submit_venture_usage_event: p_occurred_at out of bounds' USING ERRCODE = '22023';
  END IF;

  -- Rate limiting, keyed on ingested_at (server axis) -- strictly BEFORE the venture_artifacts
  -- upsert below, so a rate-limited call (zero events actually stored) can never still produce
  -- the Stage-23 gate witness.
  v_bucket_hour := date_trunc('hour', clock_timestamp());
  INSERT INTO public.venture_usage_ingest_global_bucket (bucket_hour, event_count)
  VALUES (v_bucket_hour, 0)
  ON CONFLICT (bucket_hour) DO NOTHING;
  SELECT event_count INTO v_global_count
  FROM public.venture_usage_ingest_global_bucket
  WHERE bucket_hour = v_bucket_hour
  FOR UPDATE;
  IF v_global_count >= 50000 THEN
    RETURN jsonb_build_object('ok', false, 'id', NULL, 'reason', 'rate_limited_global');
  END IF;
  IF public.fn_venture_usage_event_prior_hour_count(p_venture_id) >= 5000 THEN
    RETURN jsonb_build_object('ok', false, 'id', NULL, 'reason', 'rate_limited_venture');
  END IF;

  UPDATE public.venture_usage_ingest_global_bucket
  SET event_count = event_count + 1
  WHERE bucket_hour = v_bucket_hour;

  INSERT INTO public.venture_usage_events (venture_id, event_type, event_name, properties, created_at)
  VALUES (p_venture_id, p_event_type, p_event_name, v_properties, v_created_at)
  RETURNING id INTO v_new_id;

  -- Self-produce the Stage-23 (launch_readiness_gate) gate-witness artifact -- see file header
  -- note (3). Resolved by stage_key, never a hardcoded 23 -- see file header note (4). NO
  -- exception handler around this: if it fails, the whole call fails, rather than silently
  -- reporting event-ingestion success while the gate witness never lands.
  SELECT stage_number INTO v_stage_number
  FROM public.venture_stages
  WHERE stage_key = 'launch_readiness_gate';

  IF v_stage_number IS NOT NULL THEN
    INSERT INTO public.venture_artifacts (
      venture_id, lifecycle_stage, artifact_type, title, is_current, metadata
    ) VALUES (
      p_venture_id, v_stage_number, 'launch_usage_signal', 'Usage Signal Wired', true,
      jsonb_build_object(
        'produced_by', 'fn_submit_venture_usage_event',
        'sd', 'SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-A',
        'schema_version', 1,
        'stage_key', 'launch_readiness_gate',
        'first_event_at', clock_timestamp(),
        'last_event_at', clock_timestamp(),
        'first_event_id', v_new_id,
        'evidence', v_new_id
      )
    )
    ON CONFLICT (venture_id, lifecycle_stage, artifact_type, COALESCE((metadata ->> 'screenId'::text), '__no_screen__'::text))
    WHERE is_current = true
    DO UPDATE SET
      metadata = venture_artifacts.metadata || jsonb_build_object('last_event_at', clock_timestamp()),
      updated_at = clock_timestamp()
    WHERE
      -- 5-minute cooldown: bounds write amplification on a hot venture. first_event_at/
      -- first_event_id are never touched by this branch (jsonb || only overwrites last_event_at).
      (venture_artifacts.metadata ->> 'last_event_at')::timestamptz < clock_timestamp() - interval '5 minutes';
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_new_id, 'reason', NULL);
END;
$$;

COMMENT ON FUNCTION public.fn_submit_venture_usage_event(UUID, TEXT, TEXT, TEXT, JSONB, TIMESTAMPTZ) IS
  'SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-A: ownership-bound, venture-agnostic usage-event ingestion, '
  'mirroring fn_submit_venture_feedback/fn_submit_venture_error''s auth pattern with a dedicated '
  'rate-limit substrate (see COMMENT on fn_venture_usage_event_prior_hour_count). Response is '
  'ALWAYS exactly {ok, id, reason} -- stricter than either precedent, which disagree with each '
  'other on response shape. Self-produces its own launch_usage_signal venture_artifacts gate '
  'witness on successful ingestion, keyed by stage_key not a hardcoded stage_number.';

REVOKE EXECUTE ON FUNCTION public.fn_submit_venture_usage_event(UUID, TEXT, TEXT, TEXT, JSONB, TIMESTAMPTZ) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_submit_venture_usage_event(UUID, TEXT, TEXT, TEXT, JSONB, TIMESTAMPTZ) TO anon, service_role;

-- ============================================================
-- 5. Widen venture_artifacts_artifact_type_check to add 'launch_usage_signal' -- the Stage-23
--    kill-gate witness this SD's RPC self-produces. Additive only.
-- ============================================================
ALTER TABLE public.venture_artifacts
  DROP CONSTRAINT IF EXISTS venture_artifacts_artifact_type_check;

ALTER TABLE public.venture_artifacts
  ADD CONSTRAINT venture_artifacts_artifact_type_check
  CHECK (artifact_type::text = ANY (ARRAY[
    'blueprint_api_contract', 'blueprint_data_model', 'blueprint_erd_diagram',
    'blueprint_financial_projection', 'blueprint_launch_readiness', 'blueprint_positioning_brief',
    'blueprint_product_roadmap', 'blueprint_project_plan', 'blueprint_promotion_gate',
    'blueprint_review_summary', 'blueprint_risk_register', 'blueprint_schema_spec',
    'blueprint_sprint_plan', 'blueprint_technical_architecture', 'blueprint_token_manifest',
    'blueprint_user_story_pack', 'blueprint_wireframes', 'build_cicd_config', 'build_mvp_build',
    'build_security_audit', 'build_system_prompt', 'build_test_coverage_report',
    'code_quality_report', 'design_token_manifest', 'distribution_ad_copy',
    'distribution_channel_config', 'distribution_skip_marker', 'economic_lens',
    'engine_business_model_canvas', 'engine_exit_strategy', 'engine_pricing_model',
    'engine_revenue_model', 'engine_risk_assessment', 'engine_risk_matrix',
    'growth_optimization_roadmap', 'growth_playbook', 'identity_brand_guidelines',
    'identity_brand_name', 'identity_gtm_sales_strategy', 'identity_logo_image',
    'identity_naming_visual', 'identity_persona_brand', 'intake_venture_analysis',
    'launch_analytics_dashboard', 'launch_assumptions_vs_reality', 'launch_churn_triggers',
    'launch_deployment_runbook', 'launch_health_scoring', 'launch_launch_metrics',
    'launch_marketing_checklist', 'launch_metrics', 'launch_optimization_roadmap',
    'launch_production_app', 'launch_readiness_checklist', 'launch_retention_playbook',
    'launch_test_plan', 'launch_uat_report', 'launch_user_feedback_summary',
    -- SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-A: new value, the launch_readiness_gate gate-witness
    -- self-produced by fn_submit_venture_usage_event above.
    'launch_usage_signal',
    'lifecycle_sd_bridge', 'marketing_app_store_desc', 'marketing_blog_draft',
    'marketing_email_onboarding', 'marketing_email_reengagement', 'marketing_email_welcome',
    'marketing_landing_hero', 'marketing_seo_meta', 'marketing_social_posts', 'marketing_tagline',
    'post_lifecycle_decision', 'postlaunch_analytics_dashboard', 'postlaunch_assumptions_vs_reality',
    'postlaunch_user_feedback_summary', 's17_approved', 's17_approved_png', 's17_archetypes',
    's17_design_system', 's17_fill_screen', 's17_preview', 's17_qa_report', 's17_session_state',
    's17_strategy_recommendation', 's17_strategy_stats', 's17_variant_scores', 's17_variant_wip',
    'stage_0_analysis', 'stage_10_analysis', 'stage_11_analysis', 'stage_12_analysis',
    'stage_13_analysis', 'stage_14_analysis', 'stage_15_analysis', 'stage_16_analysis',
    'stage_17_analysis', 'stage_18_analysis', 'stage_19_analysis', 'stage_1_analysis',
    'stage_20_analysis', 'stage_21_analysis', 'stage_22_analysis', 'stage_23_analysis',
    'stage_24_analysis', 'stage_25_analysis', 'stage_26_analysis', 'stage_2_analysis',
    'stage_3_analysis', 'stage_4_analysis', 'stage_5_analysis', 'stage_6_analysis',
    'stage_7_analysis', 'stage_8_analysis', 'stage_9_analysis', 'stitch_budget', 'stitch_curation',
    'stitch_design_export', 'stitch_project', 'stitch_qa_report', 'system_devils_advocate_review',
    'truth_ai_critique', 'truth_competitive_analysis', 'truth_financial_model', 'truth_idea_brief',
    'truth_problem_statement', 'truth_target_market_analysis', 'truth_validation_decision',
    'truth_value_proposition', 'value_multiplier_assessment', 'visual_assets_skipped',
    'visual_device_screenshots', 'visual_final_assets', 'visual_social_graphics', 'wireframe_screens'
  ]::text[]));

-- ============================================================
-- 6. Append 'launch_usage_signal' to the launch_readiness_gate stage's required_artifacts.
--    Located by stage_key, NEVER stage_number=23 -- see file header note (4).
-- ============================================================
UPDATE public.venture_stages
SET required_artifacts = array_append(required_artifacts, 'launch_usage_signal')
WHERE stage_key = 'launch_readiness_gate'
  AND NOT ('launch_usage_signal' = ANY(required_artifacts));

-- ============================================================
-- 7. Self-verify the grant posture, matching this table family's established convention.
-- ============================================================
DO $verify$
BEGIN
  IF has_table_privilege('anon', 'public.venture_usage_events', 'SELECT')
     OR has_table_privilege('anon', 'public.venture_usage_events', 'INSERT')
     OR has_table_privilege('anon', 'public.venture_usage_events', 'UPDATE')
     OR has_table_privilege('anon', 'public.venture_usage_events', 'DELETE')
     OR has_table_privilege('authenticated', 'public.venture_usage_events', 'SELECT')
     OR has_table_privilege('authenticated', 'public.venture_usage_events', 'INSERT')
     OR has_table_privilege('authenticated', 'public.venture_usage_events', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.venture_usage_events', 'DELETE') THEN
    RAISE EXCEPTION 'VERIFY FAILED: venture_usage_events is reachable (SELECT/INSERT/UPDATE/DELETE) by anon or authenticated';
  END IF;

  IF has_table_privilege('anon', 'public.venture_usage_ingest_global_bucket', 'SELECT')
     OR has_table_privilege('anon', 'public.venture_usage_ingest_global_bucket', 'INSERT')
     OR has_table_privilege('anon', 'public.venture_usage_ingest_global_bucket', 'UPDATE')
     OR has_table_privilege('anon', 'public.venture_usage_ingest_global_bucket', 'DELETE')
     OR has_table_privilege('authenticated', 'public.venture_usage_ingest_global_bucket', 'SELECT')
     OR has_table_privilege('authenticated', 'public.venture_usage_ingest_global_bucket', 'INSERT')
     OR has_table_privilege('authenticated', 'public.venture_usage_ingest_global_bucket', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.venture_usage_ingest_global_bucket', 'DELETE') THEN
    RAISE EXCEPTION 'VERIFY FAILED: venture_usage_ingest_global_bucket is reachable by anon or authenticated';
  END IF;

  IF (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.venture_usage_events'::regclass) IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY FAILED: venture_usage_events does not have RLS enabled';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'venture_usage_events') <> 0 THEN
    RAISE EXCEPTION 'VERIFY FAILED: venture_usage_events has a policy -- it must remain deny-all-by-absence';
  END IF;

  IF has_function_privilege('anon', 'public.fn_submit_venture_usage_event(uuid,text,text,text,jsonb,timestamptz)', 'EXECUTE') IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY FAILED: fn_submit_venture_usage_event is NOT anon-callable -- the fix would be unreachable';
  END IF;
  IF has_function_privilege('anon', 'public.fn_venture_usage_event_prior_hour_count(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_venture_usage_event_prior_hour_count(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY FAILED: fn_venture_usage_event_prior_hour_count is callable by anon or authenticated';
  END IF;

  -- Disambiguate from the decoy table venture_artifacts_storm_quarantine_20260704, which shares
  -- a similarly-named CHECK constraint -- a conname-only lookup would have a false-positive match.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'venture_artifacts_artifact_type_check'
      AND conrelid = 'public.venture_artifacts'::regclass
      AND pg_get_constraintdef(oid) LIKE '%launch_usage_signal%'
  ) THEN
    RAISE EXCEPTION 'VERIFY FAILED: venture_artifacts_artifact_type_check on public.venture_artifacts does not include launch_usage_signal';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.venture_stages
    WHERE stage_key = 'launch_readiness_gate'
      AND 'launch_usage_signal' = ANY(required_artifacts)
  ) THEN
    RAISE EXCEPTION 'VERIFY FAILED: launch_readiness_gate.required_artifacts does not include launch_usage_signal';
  END IF;
END
$verify$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- ROLLBACK (manual, if needed -- additive-only migration):
-- ============================================================
-- UPDATE public.venture_stages SET required_artifacts = array_remove(required_artifacts, 'launch_usage_signal') WHERE stage_key = 'launch_readiness_gate';
-- (venture_artifacts_artifact_type_check widening left in place -- additive, no behavior change for any existing value)
-- REVOKE EXECUTE ON FUNCTION public.fn_submit_venture_usage_event(UUID, TEXT, TEXT, TEXT, JSONB, TIMESTAMPTZ) FROM anon, service_role;
-- DROP FUNCTION IF EXISTS public.fn_submit_venture_usage_event(UUID, TEXT, TEXT, TEXT, JSONB, TIMESTAMPTZ);
-- DROP FUNCTION IF EXISTS public.fn_venture_usage_event_prior_hour_count(UUID);
-- REVOKE ALL ON public.venture_usage_ingest_global_bucket FROM service_role;
-- DROP TABLE IF EXISTS public.venture_usage_ingest_global_bucket;
-- REVOKE ALL ON public.venture_usage_events FROM service_role;
-- DROP TABLE IF EXISTS public.venture_usage_events;
