# build_completion_forecast_log Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 543
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (20 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| build_pct | `numeric` | YES | - | - |
| buildable_remaining | `integer(32)` | YES | - | - |
| velocity_per_day | `numeric` | YES | - | - |
| sourcing_per_day | `numeric` | YES | - | - |
| queue_depth | `integer(32)` | YES | - | - |
| caps_per_completion | `numeric` | YES | - | - |
| assumptions | `jsonb` | **NO** | `'{}'::jsonb` | - |
| plateau | `boolean` | **NO** | `false` | - |
| binding_constraint | `text` | YES | - | - |
| eta_days | `numeric` | YES | - | - |
| eta_date | `timestamp with time zone` | YES | - | - |
| confidence | `text` | YES | - | - |
| note | `text` | YES | - | - |
| prior_forecast_id | `uuid` | YES | - | - |
| signed_error_days | `numeric` | YES | - | - |
| abs_error_days | `numeric` | YES | - | - |
| forecast_run_id | `text` | YES | - | - |
| recorded_by | `text` | YES | - | - |
| measured_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `build_completion_forecast_log_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `build_completion_forecast_log_prior_forecast_id_fkey`: prior_forecast_id → build_completion_forecast_log(id)

## Indexes

- `build_completion_forecast_log_pkey`
  ```sql
  CREATE UNIQUE INDEX build_completion_forecast_log_pkey ON public.build_completion_forecast_log USING btree (id)
  ```
- `idx_bcf_log_measured_at`
  ```sql
  CREATE INDEX idx_bcf_log_measured_at ON public.build_completion_forecast_log USING btree (measured_at DESC)
  ```
- `idx_bcf_log_run_id`
  ```sql
  CREATE INDEX idx_bcf_log_run_id ON public.build_completion_forecast_log USING btree (forecast_run_id)
  ```

## RLS Policies

### 1. bcf_log_read (SELECT)

- **Roles**: {public}
- **Using**: `((auth.role() = 'authenticated'::text) OR (auth.role() = 'service_role'::text))`

### 2. bcf_log_service_write (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`
- **With Check**: `(auth.role() = 'service_role'::text)`

---

[← Back to Schema Overview](../database-schema-overview.md)
