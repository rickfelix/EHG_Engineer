# uat_test_runs Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-28T03:30:25.261Z
**Rows**: 1
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (25 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| run_id | `character varying(100)` | **NO** | - | - |
| suite_id | `uuid` | YES | - | - |
| sd_id | `character varying(50)` | YES | - | - |
| prd_id | `character varying(50)` | YES | - | - |
| environment | `character varying(50)` | YES | - | - |
| browser | `character varying(50)` | YES | - | - |
| device_type | `character varying(50)` | YES | - | - |
| viewport_width | `integer(32)` | YES | - | - |
| viewport_height | `integer(32)` | YES | - | - |
| status | `character varying(50)` | YES | - | - |
| total_tests | `integer(32)` | YES | `0` | - |
| passed_tests | `integer(32)` | YES | `0` | - |
| failed_tests | `integer(32)` | YES | `0` | - |
| skipped_tests | `integer(32)` | YES | `0` | - |
| pass_rate | `numeric(5,2)` | YES | - | - |
| started_at | `timestamp with time zone` | YES | - | - |
| completed_at | `timestamp with time zone` | YES | - | - |
| duration_ms | `integer(32)` | YES | - | - |
| triggered_by | `character varying(100)` | YES | - | - |
| trigger_source | `character varying(255)` | YES | - | - |
| machine_info | `jsonb` | YES | - | - |
| test_config | `jsonb` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `uat_test_runs_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `uat_test_runs_suite_id_fkey`: suite_id → uat_test_suites(id)

### Unique Constraints
- `uat_test_runs_run_id_key`: UNIQUE (run_id)

## Indexes

- `idx_uat_test_runs_sd_id`
  ```sql
  CREATE INDEX idx_uat_test_runs_sd_id ON public.uat_test_runs USING btree (sd_id)
  ```
- `idx_uat_test_runs_started_at`
  ```sql
  CREATE INDEX idx_uat_test_runs_started_at ON public.uat_test_runs USING btree (started_at DESC)
  ```
- `idx_uat_test_runs_status`
  ```sql
  CREATE INDEX idx_uat_test_runs_status ON public.uat_test_runs USING btree (status)
  ```
- `idx_uat_test_runs_suite_id`
  ```sql
  CREATE INDEX idx_uat_test_runs_suite_id ON public.uat_test_runs USING btree (suite_id)
  ```
- `uat_test_runs_pkey`
  ```sql
  CREATE UNIQUE INDEX uat_test_runs_pkey ON public.uat_test_runs USING btree (id)
  ```
- `uat_test_runs_run_id_key`
  ```sql
  CREATE UNIQUE INDEX uat_test_runs_run_id_key ON public.uat_test_runs USING btree (run_id)
  ```

## RLS Policies

### 1. service_role_all_uat_test_runs (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
