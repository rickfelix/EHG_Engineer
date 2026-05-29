# eva_vision_scores Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-05-29T15:23:40.444Z
**Rows**: 3,688
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (15 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| vision_id | `uuid` | **NO** | - | - |
| arch_plan_id | `uuid` | YES | - | - |
| sd_id | `text` | YES | - | - |
| iteration | `integer(32)` | **NO** | `1` | - |
| total_score | `integer(32)` | **NO** | - | - |
| dimension_scores | `jsonb` | **NO** | - | Per-dimension scoring. Format: [{"dimension":"...", "score":72, "weight":0.15, "reasoning":"..."}] |
| threshold_action | `character varying(20)` | **NO** | - | Action taken based on score: accept (>=85), minor_sd (70-84), gap_closure_sd (50-69), escalate (<50) |
| generated_sd_ids | `jsonb` | YES | - | - |
| rubric_snapshot | `jsonb` | **NO** | - | - |
| scored_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_by | `text` | YES | - | - |
| metadata | `jsonb` | **NO** | `'{}'::jsonb` | Free-form scoring metadata (e.g., invalidation provenance, scorer version notes). SD-CRONGENIUS-LEO-INFRA-MAKE-HEAL-VISION-001. |
| invalidated_at | `timestamp with time zone` | YES | - | Non-null when the score is known-invalid (e.g., scored against wrong codebase, scorer bug). SD-CRONGENIUS-LEO-INFRA-MAKE-HEAL-VISION-001. |
| invalidation_reason | `text` | YES | - | Free-form reason citing the pilot finding / SD that invalidated this score. SD-CRONGENIUS-LEO-INFRA-MAKE-HEAL-VISION-001. |

## Constraints

### Primary Key
- `eva_vision_scores_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `eva_vision_scores_arch_plan_id_fkey`: arch_plan_id → eva_architecture_plans(id)
- `eva_vision_scores_vision_id_fkey`: vision_id → eva_vision_documents(id)

### Check Constraints
- `eva_vision_scores_threshold_action_check`: CHECK (((threshold_action)::text = ANY ((ARRAY['accept'::character varying, 'minor_sd'::character varying, 'gap_closure_sd'::character varying, 'escalate'::character varying])::text[])))
- `eva_vision_scores_total_score_check`: CHECK (((total_score >= 0) AND (total_score <= 100)))

## Indexes

- `eva_vision_scores_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_vision_scores_pkey ON public.eva_vision_scores USING btree (id)
  ```
- `idx_eva_vision_scores_action`
  ```sql
  CREATE INDEX idx_eva_vision_scores_action ON public.eva_vision_scores USING btree (threshold_action)
  ```
- `idx_eva_vision_scores_dimensions`
  ```sql
  CREATE INDEX idx_eva_vision_scores_dimensions ON public.eva_vision_scores USING gin (dimension_scores)
  ```
- `idx_eva_vision_scores_scored_at`
  ```sql
  CREATE INDEX idx_eva_vision_scores_scored_at ON public.eva_vision_scores USING btree (scored_at DESC)
  ```
- `idx_eva_vision_scores_sd`
  ```sql
  CREATE INDEX idx_eva_vision_scores_sd ON public.eva_vision_scores USING btree (sd_id) WHERE (sd_id IS NOT NULL)
  ```
- `idx_eva_vision_scores_vision`
  ```sql
  CREATE INDEX idx_eva_vision_scores_vision ON public.eva_vision_scores USING btree (vision_id)
  ```

## RLS Policies

### 1. eva_vision_scores_authenticated_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. eva_vision_scores_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
