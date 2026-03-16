# mental_model_effectiveness Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-16T00:53:05.043Z
**Rows**: N/A (RLS restricted)
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| model_id | `uuid` | **NO** | - | - |
| stage_number | `integer(32)` | **NO** | - | - |
| path | `text` | YES | - | - |
| strategy | `text` | YES | - | - |
| venture_archetype | `text` | YES | - | - |
| application_count | `integer(32)` | YES | `0` | - |
| avg_evaluation_score | `numeric` | YES | - | - |
| avg_operator_rating | `numeric` | YES | - | - |
| stage_progression_correlation | `numeric` | YES | - | - |
| revenue_correlation | `numeric` | YES | - | - |
| composite_effectiveness_score | `numeric` | YES | - | - |
| last_calculated_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `mental_model_effectiveness_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `mental_model_effectiveness_model_id_fkey`: model_id → mental_models(id)

### Check Constraints
- `mental_model_effectiveness_stage_progression_correlation_check`: CHECK (((stage_progression_correlation >= ('-1'::integer)::numeric) AND (stage_progression_correlation <= (1)::numeric)))

## Indexes

- `idx_mme_composite`
  ```sql
  CREATE INDEX idx_mme_composite ON public.mental_model_effectiveness USING btree (composite_effectiveness_score DESC)
  ```
- `idx_mme_model`
  ```sql
  CREATE INDEX idx_mme_model ON public.mental_model_effectiveness USING btree (model_id)
  ```
- `mental_model_effectiveness_pkey`
  ```sql
  CREATE UNIQUE INDEX mental_model_effectiveness_pkey ON public.mental_model_effectiveness USING btree (id)
  ```
- `uq_mme_model_stage_path_strat_arch`
  ```sql
  CREATE UNIQUE INDEX uq_mme_model_stage_path_strat_arch ON public.mental_model_effectiveness USING btree (model_id, stage_number, COALESCE(path, ''::text), COALESCE(strategy, ''::text), COALESCE(venture_archetype, ''::text))
  ```

## RLS Policies

### 1. mental_model_effectiveness_anon_select (SELECT)

- **Roles**: {anon}
- **Using**: `true`

### 2. mental_model_effectiveness_service_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
