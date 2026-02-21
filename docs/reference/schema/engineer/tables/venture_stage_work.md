# venture_stage_work Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-21T07:05:42.917Z
**Rows**: 33
**RLS**: Enabled (5 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| lifecycle_stage | `integer(32)` | **NO** | - | - |
| sd_id | `character varying(50)` | YES | - | - |
| stage_status | `character varying(20)` | YES | `'not_started'::character varying` | - |
| work_type | `character varying(30)` | **NO** | - | - |
| started_at | `timestamp with time zone` | YES | - | - |
| completed_at | `timestamp with time zone` | YES | - | - |
| health_score | `character varying(10)` | YES | - | - |
| advisory_data | `jsonb` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `venture_stage_work_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_stage_work_sd_id_fkey`: sd_id → strategic_directives_v2(id)
- `venture_stage_work_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `venture_stage_work_venture_id_lifecycle_stage_key`: UNIQUE (venture_id, lifecycle_stage)

### Check Constraints
- `venture_stage_work_health_score_check`: CHECK (((health_score)::text = ANY ((ARRAY['green'::character varying, 'yellow'::character varying, 'red'::character varying])::text[])))
- `venture_stage_work_stage_status_check`: CHECK (((stage_status)::text = ANY ((ARRAY['not_started'::character varying, 'in_progress'::character varying, 'blocked'::character varying, 'completed'::character varying, 'skipped'::character varying])::text[])))
- `venture_stage_work_work_type_check`: CHECK (((work_type)::text = ANY ((ARRAY['artifact_only'::character varying, 'automated_check'::character varying, 'decision_gate'::character varying, 'sd_required'::character varying])::text[])))

## Indexes

- `idx_venture_stage_work_sd`
  ```sql
  CREATE INDEX idx_venture_stage_work_sd ON public.venture_stage_work USING btree (sd_id)
  ```
- `idx_venture_stage_work_status`
  ```sql
  CREATE INDEX idx_venture_stage_work_status ON public.venture_stage_work USING btree (stage_status)
  ```
- `idx_venture_stage_work_venture`
  ```sql
  CREATE INDEX idx_venture_stage_work_venture ON public.venture_stage_work USING btree (venture_id)
  ```
- `idx_venture_stage_work_venture_stage`
  ```sql
  CREATE INDEX idx_venture_stage_work_venture_stage ON public.venture_stage_work USING btree (venture_id, lifecycle_stage)
  ```
- `venture_stage_work_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_stage_work_pkey ON public.venture_stage_work USING btree (id)
  ```
- `venture_stage_work_venture_id_lifecycle_stage_key`
  ```sql
  CREATE UNIQUE INDEX venture_stage_work_venture_id_lifecycle_stage_key ON public.venture_stage_work USING btree (venture_id, lifecycle_stage)
  ```

## RLS Policies

### 1. venture_stage_work_delete_policy (DELETE)

- **Roles**: {authenticated}
- **Using**: `fn_is_chairman()`

### 2. venture_stage_work_insert_policy (INSERT)

- **Roles**: {authenticated}
- **With Check**: `fn_user_has_venture_access(venture_id)`

### 3. venture_stage_work_modify (ALL)

- **Roles**: {public}
- **Using**: `true`

### 4. venture_stage_work_select_policy (SELECT)

- **Roles**: {authenticated}
- **Using**: `fn_user_has_venture_access(venture_id)`

### 5. venture_stage_work_update_policy (UPDATE)

- **Roles**: {authenticated}
- **Using**: `fn_user_has_venture_access(venture_id)`
- **With Check**: `fn_user_has_venture_access(venture_id)`

## Triggers

### trg_venture_stage_work_updated

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_venture_stage_work_timestamp()`

---

[← Back to Schema Overview](../database-schema-overview.md)
