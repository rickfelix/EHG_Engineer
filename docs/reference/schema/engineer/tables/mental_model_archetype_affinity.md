# mental_model_archetype_affinity Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-12T21:52:33.070Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| model_id | `uuid` | **NO** | - | - |
| archetype | `text` | **NO** | - | - |
| path | `text` | YES | - | - |
| affinity_score | `numeric` | YES | `0.5` | - |
| sample_size | `integer(32)` | YES | `0` | - |
| confidence_level | `text` | YES | `'low'::text` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `mental_model_archetype_affinity_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `mental_model_archetype_affinity_model_id_fkey`: model_id → mental_models(id)

### Check Constraints
- `mental_model_archetype_affinity_affinity_score_check`: CHECK (((affinity_score >= (0)::numeric) AND (affinity_score <= (1)::numeric)))
- `mental_model_archetype_affinity_confidence_level_check`: CHECK ((confidence_level = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])))

## Indexes

- `idx_mmaa_archetype`
  ```sql
  CREATE INDEX idx_mmaa_archetype ON public.mental_model_archetype_affinity USING btree (archetype)
  ```
- `idx_mmaa_model`
  ```sql
  CREATE INDEX idx_mmaa_model ON public.mental_model_archetype_affinity USING btree (model_id)
  ```
- `mental_model_archetype_affinity_pkey`
  ```sql
  CREATE UNIQUE INDEX mental_model_archetype_affinity_pkey ON public.mental_model_archetype_affinity USING btree (id)
  ```
- `uq_mmaa_model_arch_path`
  ```sql
  CREATE UNIQUE INDEX uq_mmaa_model_arch_path ON public.mental_model_archetype_affinity USING btree (model_id, archetype, COALESCE(path, ''::text))
  ```

## RLS Policies

### 1. mental_model_archetype_affinity_anon_select (SELECT)

- **Roles**: {anon}
- **Using**: `true`

### 2. mental_model_archetype_affinity_service_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### update_mmaa_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
