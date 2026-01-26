# venture_artifacts Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-26T04:24:06.742Z
**Rows**: 0
**RLS**: Enabled (5 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (19 total)

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

## Constraints

### Primary Key
- `venture_artifacts_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_artifacts_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `venture_artifacts_epistemic_classification_check`: CHECK ((epistemic_classification = ANY (ARRAY['fact'::text, 'assumption'::text, 'simulation'::text, 'unknown'::text])))
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
- `idx_venture_artifacts_current`
  ```sql
  CREATE INDEX idx_venture_artifacts_current ON public.venture_artifacts USING btree (venture_id, artifact_type) WHERE (is_current = true)
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

### 3. venture_artifacts_modify (ALL)

- **Roles**: {public}
- **Using**: `true`

### 4. venture_artifacts_select_policy (SELECT)

- **Roles**: {authenticated}
- **Using**: `fn_user_has_venture_access(venture_id)`

### 5. venture_artifacts_update_policy (UPDATE)

- **Roles**: {authenticated}
- **Using**: `fn_user_has_venture_access(venture_id)`
- **With Check**: `fn_user_has_venture_access(venture_id)`

## Triggers

### trg_venture_artifacts_updated

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_venture_artifacts_timestamp()`

---

[← Back to Schema Overview](../database-schema-overview.md)
