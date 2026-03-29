# mental_model_applications Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-29T16:01:09.238Z
**Rows**: 200
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| model_id | `uuid` | **NO** | - | - |
| venture_id | `uuid` | YES | - | - |
| stage_number | `integer(32)` | **NO** | - | - |
| layer | `text` | **NO** | - | - |
| path_used | `text` | YES | - | - |
| strategy_used | `text` | YES | - | - |
| applied_by | `text` | YES | `'ai_auto'::text` | - |
| exercise_output | `jsonb` | YES | - | - |
| evaluation_score | `numeric` | YES | - | - |
| artifact_data | `jsonb` | YES | - | - |
| operator_rating | `integer(32)` | YES | - | - |
| duration_ms | `integer(32)` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `mental_model_applications_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `mental_model_applications_model_id_fkey`: model_id → mental_models(id)

### Unique Constraints
- `mental_model_applications_venture_id_model_id_stage_number__key`: UNIQUE (venture_id, model_id, stage_number, layer)

### Check Constraints
- `mental_model_applications_applied_by_check`: CHECK ((applied_by = ANY (ARRAY['ai_auto'::text, 'manual'::text])))
- `mental_model_applications_evaluation_score_check`: CHECK (((evaluation_score >= (0)::numeric) AND (evaluation_score <= (10)::numeric)))
- `mental_model_applications_layer_check`: CHECK ((layer = ANY (ARRAY['path_injection'::text, 'synthesis'::text, 'stage_hook'::text])))
- `mental_model_applications_operator_rating_check`: CHECK (((operator_rating >= 1) AND (operator_rating <= 5)))

## Indexes

- `idx_mma_layer`
  ```sql
  CREATE INDEX idx_mma_layer ON public.mental_model_applications USING btree (layer)
  ```
- `idx_mma_model_stage`
  ```sql
  CREATE INDEX idx_mma_model_stage ON public.mental_model_applications USING btree (model_id, stage_number)
  ```
- `idx_mma_venture`
  ```sql
  CREATE INDEX idx_mma_venture ON public.mental_model_applications USING btree (venture_id)
  ```
- `mental_model_applications_pkey`
  ```sql
  CREATE UNIQUE INDEX mental_model_applications_pkey ON public.mental_model_applications USING btree (id)
  ```
- `mental_model_applications_venture_id_model_id_stage_number__key`
  ```sql
  CREATE UNIQUE INDEX mental_model_applications_venture_id_model_id_stage_number__key ON public.mental_model_applications USING btree (venture_id, model_id, stage_number, layer)
  ```

## RLS Policies

### 1. mental_model_applications_anon_insert (INSERT)

- **Roles**: {anon}
- **With Check**: `true`

### 2. mental_model_applications_anon_select (SELECT)

- **Roles**: {anon}
- **Using**: `true`

### 3. mental_model_applications_anon_update (UPDATE)

- **Roles**: {anon}
- **Using**: `true`
- **With Check**: `true`

### 4. mental_model_applications_service_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
