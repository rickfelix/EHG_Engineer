# venture_artifacts_storm_quarantine_20260704 Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 7
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (28 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| lifecycle_stage | `integer(32)` | **NO** | - | - |
| artifact_type | `character varying(50)` | **NO** | - | Types: idea_brief, critique_report, validation_report, competitive_analysis, financial_model, risk_matrix, pricing_model, business_model_canvas, exit_strategy, strategic_narrative, marketing_manifest, brand_name, brand_guidelines, sales_playbook, tech_stack_decision, data_model, erd_diagram, user_story_pack, api_contract, schema_spec, system_prompt, cicd_config, deployment_config, launch_checklist, analytics_dashboard, optimization_plan |
| title | `character varying(255)` | **NO** | - | - |
| content | `text` | YES | - | - |
| file_url | `text` | YES | - | - |
| version | `integer(32)` | YES | `1` | - |
| is_current | `boolean` | YES | `true` | - |
| metadata | `jsonb` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| created_by | `uuid` | YES | - | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| quality_score | `integer(32)` | YES | - | Quality score (0-100) from AI validation or manual review. Required for quality gate enforcement at Stages 3, 5, 16. |
| validation_status | `character varying(20)` | YES | `'pending'::character varying` | Artifact validation state: pending (not reviewed), validated (passed), rejected (failed), needs_revision (fixable issues). |
| validated_at | `timestamp with time zone` | YES | - | Timestamp when artifact was validated or rejected. |
| validated_by | `character varying(100)` | YES | - | Who validated: chairman, auto_validation, crewai_agent_name, etc. |
| epistemic_classification | `text` | YES | - | Golden Nugget: Four Buckets classification (fact/assumption/simulation/unknown) |
| epistemic_evidence | `jsonb` | YES | - | Evidence linking for epistemic claims (sources, assumption IDs, simulation runs) |
| artifact_embedding | `USER-DEFINED` | YES | - | pgvector embedding (1536-dim, text-embedding-3-small) for semantic search |
| embedding_model | `text` | YES | `'text-embedding-3-small'::text` | - |
| embedding_updated_at | `timestamp with time zone` | YES | - | - |
| indexing_status | `text` | YES | `'pending'::text` | Embedding indexing status: pending, indexed, failed, skipped |
| source | `character varying(100)` | YES | - | - |
| artifact_data | `jsonb` | YES | - | - |
| supports_vision_key | `character varying(100)` | YES | - | - |
| supports_plan_key | `character varying(100)` | YES | - | - |
| platform | `text` | YES | - | Platform tag for generated design screens: mobile or desktop |

## Constraints

### Primary Key
- `venture_artifacts_storm_quarantine_20260704_pkey`: PRIMARY KEY (id)

### Check Constraints
- `venture_artifacts_artifact_type_check`: CHECK (((artifact_type)::text = ANY (ARRAY['blueprint_api_contract'::text, 'blueprint_data_model'::text, 'blueprint_erd_diagram'::text, 'blueprint_financial_projection'::text, 'blueprint_launch_readiness'::text, 'blueprint_positioning_brief'::text, 'blueprint_product_roadmap'::text, 'blueprint_project_plan'::text, 'blueprint_promotion_gate'::text, 'blueprint_review_summary'::text, 'blueprint_risk_register'::text, 'blueprint_schema_spec'::text, 'blueprint_sprint_plan'::text, 'blueprint_technical_architecture'::text, 'blueprint_token_manifest'::text, 'blueprint_user_story_pack'::text, 'blueprint_wireframes'::text, 'build_cicd_config'::text, 'build_mvp_build'::text, 'build_security_audit'::text, 'build_system_prompt'::text, 'build_test_coverage_report'::text, 'code_quality_report'::text, 'design_token_manifest'::text, 'distribution_ad_copy'::text, 'distribution_channel_config'::text, 'distribution_skip_marker'::text, 'economic_lens'::text, 'engine_business_model_canvas'::text, 'engine_exit_strategy'::text, 'engine_pricing_model'::text, 'engine_revenue_model'::text, 'engine_risk_assessment'::text, 'engine_risk_matrix'::text, 'growth_optimization_roadmap'::text, 'growth_playbook'::text, 'identity_brand_guidelines'::text, 'identity_brand_name'::text, 'identity_gtm_sales_strategy'::text, 'identity_logo_image'::text, 'identity_naming_visual'::text, 'identity_persona_brand'::text, 'intake_venture_analysis'::text, 'launch_analytics_dashboard'::text, 'launch_assumptions_vs_reality'::text, 'launch_churn_triggers'::text, 'launch_deployment_runbook'::text, 'launch_health_scoring'::text, 'launch_launch_metrics'::text, 'launch_marketing_checklist'::text, 'launch_metrics'::text, 'launch_optimization_roadmap'::text, 'launch_production_app'::text, 'launch_readiness_checklist'::text, 'launch_retention_playbook'::text, 'launch_test_plan'::text, 'launch_uat_report'::text, 'launch_user_feedback_summary'::text, 'lifecycle_sd_bridge'::text, 'marketing_app_store_desc'::text, 'marketing_blog_draft'::text, 'marketing_email_onboarding'::text, 'marketing_email_reengagement'::text, 'marketing_email_welcome'::text, 'marketing_landing_hero'::text, 'marketing_seo_meta'::text, 'marketing_social_posts'::text, 'marketing_tagline'::text, 'post_lifecycle_decision'::text, 'postlaunch_analytics_dashboard'::text, 'postlaunch_assumptions_vs_reality'::text, 'postlaunch_user_feedback_summary'::text, 's17_approved'::text, 's17_approved_png'::text, 's17_archetypes'::text, 's17_design_system'::text, 's17_fill_screen'::text, 's17_preview'::text, 's17_qa_report'::text, 's17_session_state'::text, 's17_strategy_recommendation'::text, 's17_strategy_stats'::text, 's17_variant_scores'::text, 's17_variant_wip'::text, 'stage_0_analysis'::text, 'stage_10_analysis'::text, 'stage_11_analysis'::text, 'stage_12_analysis'::text, 'stage_13_analysis'::text, 'stage_14_analysis'::text, 'stage_15_analysis'::text, 'stage_16_analysis'::text, 'stage_17_analysis'::text, 'stage_18_analysis'::text, 'stage_19_analysis'::text, 'stage_1_analysis'::text, 'stage_20_analysis'::text, 'stage_21_analysis'::text, 'stage_22_analysis'::text, 'stage_23_analysis'::text, 'stage_24_analysis'::text, 'stage_25_analysis'::text, 'stage_26_analysis'::text, 'stage_2_analysis'::text, 'stage_3_analysis'::text, 'stage_4_analysis'::text, 'stage_5_analysis'::text, 'stage_6_analysis'::text, 'stage_7_analysis'::text, 'stage_8_analysis'::text, 'stage_9_analysis'::text, 'stitch_budget'::text, 'stitch_curation'::text, 'stitch_design_export'::text, 'stitch_project'::text, 'stitch_qa_report'::text, 'system_devils_advocate_review'::text, 'truth_ai_critique'::text, 'truth_competitive_analysis'::text, 'truth_financial_model'::text, 'truth_idea_brief'::text, 'truth_problem_statement'::text, 'truth_target_market_analysis'::text, 'truth_validation_decision'::text, 'truth_value_proposition'::text, 'value_multiplier_assessment'::text, 'visual_assets_skipped'::text, 'visual_device_screenshots'::text, 'visual_final_assets'::text, 'visual_social_graphics'::text, 'wireframe_screens'::text])))
- `venture_artifacts_epistemic_classification_check`: CHECK ((epistemic_classification = ANY (ARRAY['fact'::text, 'assumption'::text, 'simulation'::text, 'unknown'::text])))
- `venture_artifacts_indexing_status_check`: CHECK ((indexing_status = ANY (ARRAY['pending'::text, 'indexed'::text, 'failed'::text, 'skipped'::text])))
- `venture_artifacts_platform_check`: CHECK (((platform IS NULL) OR (platform = ANY (ARRAY['mobile'::text, 'desktop'::text]))))
- `venture_artifacts_quality_score_check`: CHECK (((quality_score >= 0) AND (quality_score <= 100)))
- `venture_artifacts_validation_status_check`: CHECK (((validation_status)::text = ANY ((ARRAY['pending'::character varying, 'validated'::character varying, 'rejected'::character varying, 'needs_revision'::character varying])::text[])))

## Indexes

- `venture_artifacts_storm_quara_supports_vision_key_is_curren_idx`
  ```sql
  CREATE INDEX venture_artifacts_storm_quara_supports_vision_key_is_curren_idx ON public.venture_artifacts_storm_quarantine_20260704 USING btree (supports_vision_key, is_current) WHERE ((supports_vision_key IS NOT NULL) AND (is_current = true))
  ```
- `venture_artifacts_storm_quara_venture_id_lifecycle_stage_ar_idx`
  ```sql
  CREATE UNIQUE INDEX venture_artifacts_storm_quara_venture_id_lifecycle_stage_ar_idx ON public.venture_artifacts_storm_quarantine_20260704 USING btree (venture_id, lifecycle_stage, artifact_type, COALESCE((metadata ->> 'screenId'::text), '__no_screen__'::text)) WHERE (is_current = true)
  ```
- `venture_artifacts_storm_quaran_supports_plan_key_is_current_idx`
  ```sql
  CREATE INDEX venture_artifacts_storm_quaran_supports_plan_key_is_current_idx ON public.venture_artifacts_storm_quarantine_20260704 USING btree (supports_plan_key, is_current) WHERE ((supports_plan_key IS NOT NULL) AND (is_current = true))
  ```
- `venture_artifacts_storm_quarantin_venture_id_artifact_type_idx1`
  ```sql
  CREATE INDEX venture_artifacts_storm_quarantin_venture_id_artifact_type_idx1 ON public.venture_artifacts_storm_quarantine_20260704 USING btree (venture_id, artifact_type) WHERE ((artifact_type)::text = ANY ((ARRAY['design_token_manifest'::character varying, 's17_archetypes'::character varying, 's17_session_state'::character varying, 's17_approved'::character varying])::text[]))
  ```
- `venture_artifacts_storm_quarantine_20260704_artifact_type_idx`
  ```sql
  CREATE INDEX venture_artifacts_storm_quarantine_20260704_artifact_type_idx ON public.venture_artifacts_storm_quarantine_20260704 USING btree (artifact_type)
  ```
- `venture_artifacts_storm_quarantine_20260704_content_idx`
  ```sql
  CREATE INDEX venture_artifacts_storm_quarantine_20260704_content_idx ON public.venture_artifacts_storm_quarantine_20260704 USING gin (content gin_trgm_ops)
  ```
- `venture_artifacts_storm_quarantine_20260704_lifecycle_stage_idx`
  ```sql
  CREATE INDEX venture_artifacts_storm_quarantine_20260704_lifecycle_stage_idx ON public.venture_artifacts_storm_quarantine_20260704 USING btree (lifecycle_stage)
  ```
- `venture_artifacts_storm_quarantine_20260704_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_artifacts_storm_quarantine_20260704_pkey ON public.venture_artifacts_storm_quarantine_20260704 USING btree (id)
  ```
- `venture_artifacts_storm_quarantine_20260704_quality_score_idx`
  ```sql
  CREATE INDEX venture_artifacts_storm_quarantine_20260704_quality_score_idx ON public.venture_artifacts_storm_quarantine_20260704 USING btree (quality_score) WHERE (quality_score IS NOT NULL)
  ```
- `venture_artifacts_storm_quarantine_20260704_venture_id_idx`
  ```sql
  CREATE INDEX venture_artifacts_storm_quarantine_20260704_venture_id_idx ON public.venture_artifacts_storm_quarantine_20260704 USING btree (venture_id)
  ```
- `venture_artifacts_storm_quarantine_202607_supports_plan_key_idx`
  ```sql
  CREATE INDEX venture_artifacts_storm_quarantine_202607_supports_plan_key_idx ON public.venture_artifacts_storm_quarantine_20260704 USING btree (supports_plan_key) WHERE (supports_plan_key IS NOT NULL)
  ```
- `venture_artifacts_storm_quarantine_202607_validation_status_idx`
  ```sql
  CREATE INDEX venture_artifacts_storm_quarantine_202607_validation_status_idx ON public.venture_artifacts_storm_quarantine_20260704 USING btree (validation_status)
  ```
- `venture_artifacts_storm_quarantine_20260_artifact_embedding_idx`
  ```sql
  CREATE INDEX venture_artifacts_storm_quarantine_20260_artifact_embedding_idx ON public.venture_artifacts_storm_quarantine_20260704 USING ivfflat (artifact_embedding vector_cosine_ops) WITH (lists='1')
  ```
- `venture_artifacts_storm_quarantine_20260_epistemic_evidence_idx`
  ```sql
  CREATE INDEX venture_artifacts_storm_quarantine_20260_epistemic_evidence_idx ON public.venture_artifacts_storm_quarantine_20260704 USING gin (epistemic_evidence)
  ```
- `venture_artifacts_storm_quarantine_2026_supports_vision_key_idx`
  ```sql
  CREATE INDEX venture_artifacts_storm_quarantine_2026_supports_vision_key_idx ON public.venture_artifacts_storm_quarantine_20260704 USING btree (supports_vision_key) WHERE (supports_vision_key IS NOT NULL)
  ```
- `venture_artifacts_storm_quarantine_2026_venture_id_platform_idx`
  ```sql
  CREATE INDEX venture_artifacts_storm_quarantine_2026_venture_id_platform_idx ON public.venture_artifacts_storm_quarantine_20260704 USING btree (venture_id, platform) WHERE (platform IS NOT NULL)
  ```
- `venture_artifacts_storm_quarantine_epistemic_classification_idx`
  ```sql
  CREATE INDEX venture_artifacts_storm_quarantine_epistemic_classification_idx ON public.venture_artifacts_storm_quarantine_20260704 USING btree (epistemic_classification)
  ```
- `venture_artifacts_storm_quarantine_venture_id_artifact_type_idx`
  ```sql
  CREATE INDEX venture_artifacts_storm_quarantine_venture_id_artifact_type_idx ON public.venture_artifacts_storm_quarantine_20260704 USING btree (venture_id, artifact_type) WHERE (is_current = true)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
