# uat_coverage_metrics Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-09T02:01:10.216Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (23 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| run_id | `uuid` | YES | - | - |
| metric_date | `date` | YES | `CURRENT_DATE` | - |
| total_components | `integer(32)` | YES | - | - |
| tested_components | `integer(32)` | YES | - | - |
| component_coverage_pct | `numeric(5,2)` | YES | - | - |
| total_user_stories | `integer(32)` | YES | - | - |
| tested_user_stories | `integer(32)` | YES | - | - |
| story_coverage_pct | `numeric(5,2)` | YES | - | - |
| total_pages | `integer(32)` | YES | - | - |
| tested_pages | `integer(32)` | YES | - | - |
| page_coverage_pct | `numeric(5,2)` | YES | - | - |
| total_api_endpoints | `integer(32)` | YES | - | - |
| tested_api_endpoints | `integer(32)` | YES | - | - |
| api_coverage_pct | `numeric(5,2)` | YES | - | - |
| code_coverage_pct | `numeric(5,2)` | YES | - | - |
| branch_coverage_pct | `numeric(5,2)` | YES | - | - |
| function_coverage_pct | `numeric(5,2)` | YES | - | - |
| line_coverage_pct | `numeric(5,2)` | YES | - | - |
| untested_critical_paths | `ARRAY` | YES | - | - |
| coverage_gaps | `jsonb` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `uat_coverage_metrics_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `uat_coverage_metrics_run_id_fkey`: run_id → uat_test_runs(id)

## Indexes

- `idx_uat_coverage_metrics_date`
  ```sql
  CREATE INDEX idx_uat_coverage_metrics_date ON public.uat_coverage_metrics USING btree (metric_date DESC)
  ```
- `idx_uat_coverage_metrics_run_id`
  ```sql
  CREATE INDEX idx_uat_coverage_metrics_run_id ON public.uat_coverage_metrics USING btree (run_id)
  ```
- `uat_coverage_metrics_pkey`
  ```sql
  CREATE UNIQUE INDEX uat_coverage_metrics_pkey ON public.uat_coverage_metrics USING btree (id)
  ```

## RLS Policies

### 1. service_role_all_uat_coverage_metrics (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
