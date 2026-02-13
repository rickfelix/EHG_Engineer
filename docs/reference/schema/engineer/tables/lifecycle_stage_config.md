# lifecycle_stage_config Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-13T02:26:09.277Z
**Rows**: 25
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| stage_number | `integer(32)` | **NO** | - | - |
| stage_name | `character varying(100)` | **NO** | - | - |
| description | `text` | YES | - | - |
| phase_number | `integer(32)` | **NO** | - | - |
| phase_name | `character varying(50)` | **NO** | - | - |
| work_type | `character varying(30)` | **NO** | - | artifact_only = non-code artifacts, automated_check = AI validation, decision_gate = Chairman decision, sd_required = Leo Protocol SD needed |
| sd_required | `boolean` | YES | `false` | - |
| sd_suffix | `character varying(20)` | YES | - | - |
| advisory_enabled | `boolean` | YES | `false` | TRUE at stages 3, 5, 16 for Chairman Advisory checkpoints |
| depends_on | `ARRAY` | YES | `'{}'::integer[]` | - |
| required_artifacts | `ARRAY` | YES | `'{}'::text[]` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `lifecycle_stage_config_pkey`: PRIMARY KEY (stage_number)

### Check Constraints
- `lifecycle_stage_config_work_type_check`: CHECK (((work_type)::text = ANY ((ARRAY['artifact_only'::character varying, 'automated_check'::character varying, 'decision_gate'::character varying, 'sd_required'::character varying])::text[])))

## Indexes

- `idx_lifecycle_stage_phase`
  ```sql
  CREATE INDEX idx_lifecycle_stage_phase ON public.lifecycle_stage_config USING btree (phase_number)
  ```
- `idx_lifecycle_stage_sd_required`
  ```sql
  CREATE INDEX idx_lifecycle_stage_sd_required ON public.lifecycle_stage_config USING btree (sd_required) WHERE (sd_required = true)
  ```
- `idx_lifecycle_stage_work_type`
  ```sql
  CREATE INDEX idx_lifecycle_stage_work_type ON public.lifecycle_stage_config USING btree (work_type)
  ```
- `lifecycle_stage_config_pkey`
  ```sql
  CREATE UNIQUE INDEX lifecycle_stage_config_pkey ON public.lifecycle_stage_config USING btree (stage_number)
  ```

## RLS Policies

### 1. lifecycle_stage_config_delete (DELETE)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. lifecycle_stage_config_insert (INSERT)

- **Roles**: {authenticated}
- **With Check**: `true`

### 3. lifecycle_stage_config_select (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 4. lifecycle_stage_config_update (UPDATE)

- **Roles**: {authenticated}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
