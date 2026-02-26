# uat_test_results Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-26T02:22:21.495Z
**Rows**: 10
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (21 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| run_id | `uuid` | YES | - | - |
| test_case_id | `uuid` | YES | - | - |
| status | `character varying(50)` | YES | - | - |
| duration_ms | `integer(32)` | YES | - | - |
| started_at | `timestamp with time zone` | YES | - | - |
| completed_at | `timestamp with time zone` | YES | - | - |
| error_message | `text` | YES | - | - |
| error_stack | `text` | YES | - | - |
| actual_results | `jsonb` | YES | - | - |
| screenshots | `jsonb` | YES | - | - |
| video_url | `text` | YES | - | - |
| console_logs | `text` | YES | - | - |
| network_logs | `jsonb` | YES | - | - |
| performance_metrics | `jsonb` | YES | - | - |
| accessibility_violations | `jsonb` | YES | - | - |
| retry_attempts | `integer(32)` | YES | `0` | - |
| is_flaky_failure | `boolean` | YES | `false` | - |
| failure_category | `character varying(100)` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `uat_test_results_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `uat_test_results_run_id_fkey`: run_id → uat_test_runs(id)
- `uat_test_results_test_case_id_fkey`: test_case_id → uat_test_cases(id)

## Indexes

- `idx_uat_test_results_failure_category`
  ```sql
  CREATE INDEX idx_uat_test_results_failure_category ON public.uat_test_results USING btree (failure_category)
  ```
- `idx_uat_test_results_run_id`
  ```sql
  CREATE INDEX idx_uat_test_results_run_id ON public.uat_test_results USING btree (run_id)
  ```
- `idx_uat_test_results_status`
  ```sql
  CREATE INDEX idx_uat_test_results_status ON public.uat_test_results USING btree (status)
  ```
- `idx_uat_test_results_test_case_id`
  ```sql
  CREATE INDEX idx_uat_test_results_test_case_id ON public.uat_test_results USING btree (test_case_id)
  ```
- `uat_test_results_pkey`
  ```sql
  CREATE UNIQUE INDEX uat_test_results_pkey ON public.uat_test_results USING btree (id)
  ```

## RLS Policies

### 1. service_role_all_uat_test_results (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
