# venture_artifacts Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-01T22:49:08.070Z
**Rows**: 40
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (27 total)

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

## Constraints

### Primary Key
- `venture_artifacts_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_artifacts_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `venture_artifacts_artifact_type_check`: CHECK (((artifact_type)::text = ANY (ARRAY['intake_venture_analysis'::text, 'truth_idea_brief'::text, 'truth_ai_critique'::text, 'truth_validation_decision'::text, 'truth_competitive_analysis'::text, 'truth_financial_model'::text, 'truth_problem_statement'::text, 'truth_target_market_analysis'::text, 'truth_value_proposition'::text, 'engine_risk_matrix'::text, 'engine_pricing_model'::text, 'engine_business_model_canvas'::text, 'engine_exit_strategy'::text, 'engine_risk_assessment'::text, 'engine_revenue_model'::text, 'identity_persona_brand'::text, 'identity_brand_guidelines'::text, 'identity_naming_visual'::text, 'identity_brand_name'::text, 'identity_gtm_sales_strategy'::text, 'blueprint_product_roadmap'::text, 'blueprint_technical_architecture'::text, 'blueprint_data_model'::text, 'blueprint_erd_diagram'::text, 'blueprint_api_contract'::text, 'blueprint_schema_spec'::text, 'blueprint_risk_register'::text, 'blueprint_user_story_pack'::text, 'blueprint_wireframes'::text, 'blueprint_financial_projection'::text, 'blueprint_launch_readiness'::text, 'blueprint_sprint_plan'::text, 'blueprint_promotion_gate'::text, 'blueprint_project_plan'::text, 'build_system_prompt'::text, 'build_cicd_config'::text, 'build_security_audit'::text, 'build_mvp_build'::text, 'build_test_coverage_report'::text, 'launch_test_plan'::text, 'launch_uat_report'::text, 'launch_deployment_runbook'::text, 'launch_marketing_checklist'::text, 'launch_analytics_dashboard'::text, 'launch_health_scoring'::text, 'launch_churn_triggers'::text, 'launch_retention_playbook'::text, 'launch_optimization_roadmap'::text, 'launch_assumptions_vs_reality'::text, 'launch_launch_metrics'::text, 'launch_user_feedback_summary'::text, 'launch_production_app'::text, 'system_devils_advocate_review'::text])))
- `venture_artifacts_epistemic_classification_check`: CHECK ((epistemic_classification = ANY (ARRAY['fact'::text, 'assumption'::text, 'simulation'::text, 'unknown'::text])))
- `venture_artifacts_indexing_status_check`: CHECK ((indexing_status = ANY (ARRAY['pending'::text, 'indexed'::text, 'failed'::text, 'skipped'::text])))
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
- `idx_venture_artifacts_quality_score`
  ```sql
  CREATE INDEX idx_venture_artifacts_quality_score ON public.venture_artifacts USING btree (quality_score) WHERE (quality_score IS NOT NULL)
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
