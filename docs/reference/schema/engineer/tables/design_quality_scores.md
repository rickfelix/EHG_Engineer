# design_quality_scores Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-26T21:16:02.093Z
**Rows**: 441
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `character varying` | **NO** | - | - |
| accessibility_score | `integer(32)` | YES | - | - |
| token_compliance_score | `integer(32)` | YES | - | - |
| component_reuse_score | `integer(32)` | YES | - | - |
| visual_polish_score | `integer(32)` | YES | - | - |
| composite_score | `integer(32)` | **NO** | - | - |
| dimensions | `jsonb` | YES | `'{}'::jsonb` | Raw dimension data from design-agent findings for audit trail |
| source_result_id | `uuid` | YES | - | FK to the sub_agent_execution_results row used for scoring |
| calculated_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `design_quality_scores_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `design_quality_scores_sd_id_fkey`: sd_id → strategic_directives_v2(id)
- `design_quality_scores_source_result_id_fkey`: source_result_id → sub_agent_execution_results(id)

### Check Constraints
- `design_quality_scores_accessibility_score_check`: CHECK (((accessibility_score >= 0) AND (accessibility_score <= 100)))
- `design_quality_scores_component_reuse_score_check`: CHECK (((component_reuse_score >= 0) AND (component_reuse_score <= 100)))
- `design_quality_scores_composite_score_check`: CHECK (((composite_score >= 0) AND (composite_score <= 100)))
- `design_quality_scores_token_compliance_score_check`: CHECK (((token_compliance_score >= 0) AND (token_compliance_score <= 100)))
- `design_quality_scores_visual_polish_score_check`: CHECK (((visual_polish_score >= 0) AND (visual_polish_score <= 100)))

## Indexes

- `design_quality_scores_pkey`
  ```sql
  CREATE UNIQUE INDEX design_quality_scores_pkey ON public.design_quality_scores USING btree (id)
  ```
- `idx_design_quality_scores_calculated_at`
  ```sql
  CREATE INDEX idx_design_quality_scores_calculated_at ON public.design_quality_scores USING btree (calculated_at DESC)
  ```
- `idx_design_quality_scores_sd_id`
  ```sql
  CREATE INDEX idx_design_quality_scores_sd_id ON public.design_quality_scores USING btree (sd_id)
  ```

## RLS Policies

### 1. design_quality_scores_insert_policy (INSERT)

- **Roles**: {public}
- **With Check**: `true`

### 2. design_quality_scores_select_policy (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 3. design_quality_scores_update_policy (UPDATE)

- **Roles**: {public}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
