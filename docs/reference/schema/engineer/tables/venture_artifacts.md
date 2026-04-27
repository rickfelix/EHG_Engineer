# venture_artifacts Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-27T11:26:09.324Z
**Rows**: 73
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
- `venture_artifacts_artifact_type_check`: CHECK (((artifact_type)::text = ANY ((ARRAY['intake_venture_analysis'::character varying, 'truth_idea_brief'::character varying, 'truth_ai_critique'::character varying, 'truth_validation_decision'::character varying, 'truth_competitive_analysis'::character varying, 'truth_financial_model'::character varying, 'truth_problem_statement'::character varying, 'truth_target_market_analysis'::character varying, 'truth_value_proposition'::character varying, 'engine_risk_matrix'::character varying, 'engine_pricing_model'::character varying, 'engine_business_model_canvas'::character varying, 'engine_exit_strategy'::character varying, 'engine_risk_assessment'::character varying, 'engine_revenue_model'::character varying, 'identity_persona_brand'::character varying, 'identity_brand_guidelines'::character varying, 'identity_naming_visual'::character varying, 'identity_brand_name'::character varying, 'identity_gtm_sales_strategy'::character varying, 'identity_logo_image'::character varying, 'blueprint_product_roadmap'::character varying, 'blueprint_technical_architecture'::character varying, 'blueprint_data_model'::character varying, 'blueprint_erd_diagram'::character varying, 'blueprint_api_contract'::character varying, 'blueprint_schema_spec'::character varying, 'blueprint_risk_register'::character varying, 'blueprint_user_story_pack'::character varying, 'blueprint_wireframes'::character varying, 'blueprint_financial_projection'::character varying, 'blueprint_launch_readiness'::character varying, 'blueprint_sprint_plan'::character varying, 'blueprint_promotion_gate'::character varying, 'blueprint_project_plan'::character varying, 'blueprint_review_summary'::character varying, 'blueprint_token_manifest'::character varying, 'build_system_prompt'::character varying, 'build_cicd_config'::character varying, 'build_security_audit'::character varying, 'build_mvp_build'::character varying, 'build_test_coverage_report'::character varying, 'build_brief'::character varying, 'marketing_tagline'::character varying, 'marketing_app_store_desc'::character varying, 'marketing_landing_hero'::character varying, 'marketing_email_welcome'::character varying, 'marketing_email_onboarding'::character varying, 'marketing_email_reengagement'::character varying, 'marketing_social_posts'::character varying, 'marketing_seo_meta'::character varying, 'marketing_blog_draft'::character varying, 'code_quality_report'::character varying, 'visual_device_screenshots'::character varying, 'visual_social_graphics'::character varying, 'distribution_channel_config'::character varying, 'distribution_ad_copy'::character varying, 'launch_test_plan'::character varying, 'launch_uat_report'::character varying, 'launch_deployment_runbook'::character varying, 'launch_marketing_checklist'::character varying, 'launch_analytics_dashboard'::character varying, 'launch_health_scoring'::character varying, 'launch_churn_triggers'::character varying, 'launch_retention_playbook'::character varying, 'launch_optimization_roadmap'::character varying, 'launch_assumptions_vs_reality'::character varying, 'launch_launch_metrics'::character varying, 'launch_user_feedback_summary'::character varying, 'launch_production_app'::character varying, 'launch_readiness_checklist'::character varying, 'growth_playbook'::character varying, 'system_devils_advocate_review'::character varying, 'value_multiplier_assessment'::character varying, 'economic_lens'::character varying, 'lifecycle_sd_bridge'::character varying, 'post_lifecycle_decision'::character varying, 'stitch_project'::character varying, 'stitch_curation'::character varying, 'stitch_budget'::character varying, 'stitch_design_export'::character varying, 'stitch_qa_report'::character varying, 's17_archetypes'::character varying, 's17_session_state'::character varying, 's17_strategy_recommendation'::character varying, 's17_variant_wip'::character varying, 's17_approved'::character varying, 's17_approved_png'::character varying, 's17_design_system'::character varying, 's17_fill_screen'::character varying, 's17_preview'::character varying, 's17_qa_report'::character varying, 's17_strategy_stats'::character varying, 's17_variant_scores'::character varying, 'stage_17_approved_desktop'::character varying, 'stage_17_approved_mobile'::character varying, 'stage_17_refined'::character varying, 's11_identity'::character varying, 'stage10_finalization'::character varying, 'stage11_identity'::character varying, 'stage12_guidelines'::character varying, 'stage13_implementation'::character varying, 'stage14_review'::character varying, 'stage15_wireframes'::character varying, 'stage16_soul'::character varying, 'stage18_sprint'::character varying, 'stage19_deployment'::character varying, 'stage1_raw_research'::character varying, 'stage2_market_analysis'::character varying, 'stage3_competitive'::character varying, 'stage4_strategy'::character varying, 'stage5_positioning'::character varying, 'stage6_validation'::character varying, 'stage7_formulation'::character varying, 'stage8_evaluation'::character varying, 'stage9_optimization'::character varying, 'architecture_plan'::character varying, 'design_token_manifest'::character varying, 'genesis_scaffold'::character varying, 'soul_document'::character varying, 'vision_document'::character varying, 'wireframe_screens'::character varying, 'stage_0_analysis'::character varying, 'stage_1_analysis'::character varying, 'stage_2_analysis'::character varying, 'stage_3_analysis'::character varying, 'stage_4_analysis'::character varying, 'stage_5_analysis'::character varying, 'stage_6_analysis'::character varying, 'stage_7_analysis'::character varying, 'stage_8_analysis'::character varying, 'stage_9_analysis'::character varying, 'stage_10_analysis'::character varying, 'stage_11_analysis'::character varying, 'stage_12_analysis'::character varying, 'stage_13_analysis'::character varying, 'stage_14_analysis'::character varying, 'stage_15_analysis'::character varying, 'stage_16_analysis'::character varying, 'stage_17_analysis'::character varying, 'stage_18_analysis'::character varying, 'stage_19_analysis'::character varying, 'stage_20_analysis'::character varying, 'stage_21_analysis'::character varying, 'stage_22_analysis'::character varying, 'stage_23_analysis'::character varying, 'stage_24_analysis'::character varying, 'stage_25_analysis'::character varying, 'stage_26_analysis'::character varying, 's17_heartbeat'::character varying, 's17_variant_failed'::character varying])::text[])))
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
