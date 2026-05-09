# venture_artifacts Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-05-09T18:40:29.089Z
**Rows**: 89
**RLS**: Enabled (4 policies)

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
- `venture_artifacts_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_artifacts_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `venture_artifacts_artifact_type_check`: CHECK (((artifact_type)::text = ANY (ARRAY[('intake_venture_analysis'::character varying)::text, ('truth_idea_brief'::character varying)::text, ('truth_ai_critique'::character varying)::text, ('truth_validation_decision'::character varying)::text, ('truth_competitive_analysis'::character varying)::text, ('truth_financial_model'::character varying)::text, ('truth_problem_statement'::character varying)::text, ('truth_target_market_analysis'::character varying)::text, ('truth_value_proposition'::character varying)::text, ('engine_risk_matrix'::character varying)::text, ('engine_pricing_model'::character varying)::text, ('engine_business_model_canvas'::character varying)::text, ('engine_exit_strategy'::character varying)::text, ('engine_risk_assessment'::character varying)::text, ('engine_revenue_model'::character varying)::text, ('identity_persona_brand'::character varying)::text, ('identity_brand_guidelines'::character varying)::text, ('identity_naming_visual'::character varying)::text, ('identity_brand_name'::character varying)::text, ('identity_gtm_sales_strategy'::character varying)::text, ('identity_logo_image'::character varying)::text, ('blueprint_product_roadmap'::character varying)::text, ('blueprint_technical_architecture'::character varying)::text, ('blueprint_data_model'::character varying)::text, ('blueprint_erd_diagram'::character varying)::text, ('blueprint_api_contract'::character varying)::text, ('blueprint_schema_spec'::character varying)::text, ('blueprint_risk_register'::character varying)::text, ('blueprint_user_story_pack'::character varying)::text, ('blueprint_wireframes'::character varying)::text, ('blueprint_financial_projection'::character varying)::text, ('blueprint_launch_readiness'::character varying)::text, ('blueprint_sprint_plan'::character varying)::text, ('blueprint_promotion_gate'::character varying)::text, ('blueprint_project_plan'::character varying)::text, ('blueprint_review_summary'::character varying)::text, ('blueprint_token_manifest'::character varying)::text, ('build_system_prompt'::character varying)::text, ('build_cicd_config'::character varying)::text, ('build_security_audit'::character varying)::text, ('build_mvp_build'::character varying)::text, ('build_test_coverage_report'::character varying)::text, ('build_brief'::character varying)::text, ('marketing_tagline'::character varying)::text, ('marketing_app_store_desc'::character varying)::text, ('marketing_landing_hero'::character varying)::text, ('marketing_email_welcome'::character varying)::text, ('marketing_email_onboarding'::character varying)::text, ('marketing_email_reengagement'::character varying)::text, ('marketing_social_posts'::character varying)::text, ('marketing_seo_meta'::character varying)::text, ('marketing_blog_draft'::character varying)::text, ('code_quality_report'::character varying)::text, ('visual_device_screenshots'::character varying)::text, ('visual_social_graphics'::character varying)::text, ('distribution_channel_config'::character varying)::text, ('distribution_ad_copy'::character varying)::text, ('launch_test_plan'::character varying)::text, ('launch_uat_report'::character varying)::text, ('launch_deployment_runbook'::character varying)::text, ('launch_marketing_checklist'::character varying)::text, ('launch_analytics_dashboard'::character varying)::text, ('launch_health_scoring'::character varying)::text, ('launch_churn_triggers'::character varying)::text, ('launch_retention_playbook'::character varying)::text, ('launch_optimization_roadmap'::character varying)::text, ('launch_assumptions_vs_reality'::character varying)::text, ('launch_launch_metrics'::character varying)::text, ('launch_user_feedback_summary'::character varying)::text, ('launch_production_app'::character varying)::text, ('launch_readiness_checklist'::character varying)::text, ('growth_playbook'::character varying)::text, ('system_devils_advocate_review'::character varying)::text, ('value_multiplier_assessment'::character varying)::text, ('economic_lens'::character varying)::text, ('lifecycle_sd_bridge'::character varying)::text, ('post_lifecycle_decision'::character varying)::text, ('stitch_project'::character varying)::text, ('stitch_curation'::character varying)::text, ('stitch_budget'::character varying)::text, ('stitch_design_export'::character varying)::text, ('stitch_qa_report'::character varying)::text, ('s17_archetypes'::character varying)::text, ('s17_session_state'::character varying)::text, ('s17_strategy_recommendation'::character varying)::text, ('s17_variant_wip'::character varying)::text, ('s17_approved'::character varying)::text, ('s17_approved_png'::character varying)::text, ('s17_design_system'::character varying)::text, ('s17_fill_screen'::character varying)::text, ('s17_preview'::character varying)::text, ('s17_qa_report'::character varying)::text, ('s17_strategy_stats'::character varying)::text, ('s17_variant_scores'::character varying)::text, ('stage_17_approved_desktop'::character varying)::text, ('stage_17_approved_mobile'::character varying)::text, ('stage_17_refined'::character varying)::text, ('s11_identity'::character varying)::text, ('stage10_finalization'::character varying)::text, ('stage11_identity'::character varying)::text, ('stage12_guidelines'::character varying)::text, ('stage13_implementation'::character varying)::text, ('stage14_review'::character varying)::text, ('stage15_wireframes'::character varying)::text, ('stage16_soul'::character varying)::text, ('stage18_sprint'::character varying)::text, ('stage19_deployment'::character varying)::text, ('stage1_raw_research'::character varying)::text, ('stage2_market_analysis'::character varying)::text, ('stage3_competitive'::character varying)::text, ('stage4_strategy'::character varying)::text, ('stage5_positioning'::character varying)::text, ('stage6_validation'::character varying)::text, ('stage7_formulation'::character varying)::text, ('stage8_evaluation'::character varying)::text, ('stage9_optimization'::character varying)::text, ('architecture_plan'::character varying)::text, ('design_token_manifest'::character varying)::text, ('genesis_scaffold'::character varying)::text, ('soul_document'::character varying)::text, ('vision_document'::character varying)::text, ('wireframe_screens'::character varying)::text, ('stage_0_analysis'::character varying)::text, ('stage_1_analysis'::character varying)::text, ('stage_2_analysis'::character varying)::text, ('stage_3_analysis'::character varying)::text, ('stage_4_analysis'::character varying)::text, ('stage_5_analysis'::character varying)::text, ('stage_6_analysis'::character varying)::text, ('stage_7_analysis'::character varying)::text, ('stage_8_analysis'::character varying)::text, ('stage_9_analysis'::character varying)::text, ('stage_10_analysis'::character varying)::text, ('stage_11_analysis'::character varying)::text, ('stage_12_analysis'::character varying)::text, ('stage_13_analysis'::character varying)::text, ('stage_14_analysis'::character varying)::text, ('stage_15_analysis'::character varying)::text, ('stage_16_analysis'::character varying)::text, ('stage_17_analysis'::character varying)::text, ('stage_18_analysis'::character varying)::text, ('stage_19_analysis'::character varying)::text, ('stage_20_analysis'::character varying)::text, ('stage_21_analysis'::character varying)::text, ('stage_22_analysis'::character varying)::text, ('stage_23_analysis'::character varying)::text, ('stage_24_analysis'::character varying)::text, ('stage_25_analysis'::character varying)::text, ('stage_26_analysis'::character varying)::text, ('s17_heartbeat'::character varying)::text, ('s17_variant_failed'::character varying)::text, ('postlaunch_assumptions_vs_reality'::character varying)::text, ('postlaunch_user_feedback_summary'::character varying)::text, ('postlaunch_analytics_dashboard'::character varying)::text, ('launch_metrics'::character varying)::text, ('growth_optimization_roadmap'::character varying)::text])))
- `venture_artifacts_epistemic_classification_check`: CHECK ((epistemic_classification = ANY (ARRAY['fact'::text, 'assumption'::text, 'simulation'::text, 'unknown'::text])))
- `venture_artifacts_indexing_status_check`: CHECK ((indexing_status = ANY (ARRAY['pending'::text, 'indexed'::text, 'failed'::text, 'skipped'::text])))
- `venture_artifacts_platform_check`: CHECK (((platform IS NULL) OR (platform = ANY (ARRAY['mobile'::text, 'desktop'::text]))))
- `venture_artifacts_quality_score_check`: CHECK (((quality_score >= 0) AND (quality_score <= 100)))
- `venture_artifacts_validation_status_check`: CHECK (((validation_status)::text = ANY ((ARRAY['pending'::character varying, 'validated'::character varying, 'rejected'::character varying, 'needs_revision'::character varying])::text[])))

## Indexes

- `idx_artifacts_epistemic`
  ```sql
  CREATE INDEX idx_artifacts_epistemic ON public.venture_artifacts USING btree (epistemic_classification)
  ```
- `idx_artifacts_epistemic_evidence`
  ```sql
  CREATE INDEX idx_artifacts_epistemic_evidence ON public.venture_artifacts USING gin (epistemic_evidence)
  ```
- `idx_unique_current_artifact`
  ```sql
  CREATE UNIQUE INDEX idx_unique_current_artifact ON public.venture_artifacts USING btree (venture_id, lifecycle_stage, artifact_type, COALESCE((metadata ->> 'screenId'::text), '__no_screen__'::text)) WHERE (is_current = true)
  ```
- `idx_va_plan_key_current`
  ```sql
  CREATE INDEX idx_va_plan_key_current ON public.venture_artifacts USING btree (supports_plan_key, is_current) WHERE ((supports_plan_key IS NOT NULL) AND (is_current = true))
  ```
- `idx_va_supports_plan_key`
  ```sql
  CREATE INDEX idx_va_supports_plan_key ON public.venture_artifacts USING btree (supports_plan_key) WHERE (supports_plan_key IS NOT NULL)
  ```
- `idx_va_supports_vision_key`
  ```sql
  CREATE INDEX idx_va_supports_vision_key ON public.venture_artifacts USING btree (supports_vision_key) WHERE (supports_vision_key IS NOT NULL)
  ```
- `idx_va_vision_key_current`
  ```sql
  CREATE INDEX idx_va_vision_key_current ON public.venture_artifacts USING btree (supports_vision_key, is_current) WHERE ((supports_vision_key IS NOT NULL) AND (is_current = true))
  ```
- `idx_venture_artifacts_content_trgm`
  ```sql
  CREATE INDEX idx_venture_artifacts_content_trgm ON public.venture_artifacts USING gin (content gin_trgm_ops)
  ```
- `idx_venture_artifacts_current`
  ```sql
  CREATE INDEX idx_venture_artifacts_current ON public.venture_artifacts USING btree (venture_id, artifact_type) WHERE (is_current = true)
  ```
- `idx_venture_artifacts_embedding_ivfflat`
  ```sql
  CREATE INDEX idx_venture_artifacts_embedding_ivfflat ON public.venture_artifacts USING ivfflat (artifact_embedding vector_cosine_ops) WITH (lists='1')
  ```
- `idx_venture_artifacts_platform`
  ```sql
  CREATE INDEX idx_venture_artifacts_platform ON public.venture_artifacts USING btree (venture_id, platform) WHERE (platform IS NOT NULL)
  ```
- `idx_venture_artifacts_quality_score`
  ```sql
  CREATE INDEX idx_venture_artifacts_quality_score ON public.venture_artifacts USING btree (quality_score) WHERE (quality_score IS NOT NULL)
  ```
- `idx_venture_artifacts_s17`
  ```sql
  CREATE INDEX idx_venture_artifacts_s17 ON public.venture_artifacts USING btree (venture_id, artifact_type) WHERE ((artifact_type)::text = ANY ((ARRAY['design_token_manifest'::character varying, 's17_archetypes'::character varying, 's17_session_state'::character varying, 's17_approved'::character varying])::text[]))
  ```
- `idx_venture_artifacts_stage`
  ```sql
  CREATE INDEX idx_venture_artifacts_stage ON public.venture_artifacts USING btree (lifecycle_stage)
  ```
- `idx_venture_artifacts_type`
  ```sql
  CREATE INDEX idx_venture_artifacts_type ON public.venture_artifacts USING btree (artifact_type)
  ```
- `idx_venture_artifacts_validation_status`
  ```sql
  CREATE INDEX idx_venture_artifacts_validation_status ON public.venture_artifacts USING btree (validation_status)
  ```
- `idx_venture_artifacts_venture`
  ```sql
  CREATE INDEX idx_venture_artifacts_venture ON public.venture_artifacts USING btree (venture_id)
  ```
- `venture_artifacts_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_artifacts_pkey ON public.venture_artifacts USING btree (id)
  ```

## RLS Policies

### 1. venture_artifacts_delete_policy (DELETE)

- **Roles**: {authenticated}
- **Using**: `fn_is_chairman()`

### 2. venture_artifacts_insert_policy (INSERT)

- **Roles**: {authenticated}
- **With Check**: `fn_user_has_venture_access(venture_id)`

### 3. venture_artifacts_select_policy (SELECT)

- **Roles**: {authenticated}
- **Using**: `fn_user_has_venture_access(venture_id)`

### 4. venture_artifacts_update_policy (UPDATE)

- **Roles**: {authenticated}
- **Using**: `fn_user_has_venture_access(venture_id)`
- **With Check**: `fn_user_has_venture_access(venture_id)`

## Triggers

### trg_venture_artifacts_updated

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_venture_artifacts_timestamp()`

---

[← Back to Schema Overview](../database-schema-overview.md)
