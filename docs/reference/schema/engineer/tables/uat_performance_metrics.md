# uat_performance_metrics Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-14T22:06:06.603Z
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
| test_result_id | `uuid` | YES | - | - |
| metric_type | `character varying(50)` | YES | - | - |
| page_url | `text` | YES | - | - |
| first_contentful_paint_ms | `integer(32)` | YES | - | - |
| largest_contentful_paint_ms | `integer(32)` | YES | - | - |
| time_to_interactive_ms | `integer(32)` | YES | - | - |
| total_blocking_time_ms | `integer(32)` | YES | - | - |
| cumulative_layout_shift | `numeric(10,4)` | YES | - | - |
| speed_index | `integer(32)` | YES | - | - |
| dom_content_loaded_ms | `integer(32)` | YES | - | - |
| page_load_time_ms | `integer(32)` | YES | - | - |
| memory_usage_mb | `numeric(10,2)` | YES | - | - |
| cpu_usage_pct | `numeric(5,2)` | YES | - | - |
| network_requests_count | `integer(32)` | YES | - | - |
| total_transfer_size_kb | `numeric(10,2)` | YES | - | - |
| cache_hit_ratio | `numeric(5,2)` | YES | - | - |
| javascript_errors_count | `integer(32)` | YES | - | - |
| performance_score | `numeric(5,2)` | YES | - | - |
| recommendations | `jsonb` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `uat_performance_metrics_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `uat_performance_metrics_run_id_fkey`: run_id → uat_test_runs(id)
- `uat_performance_metrics_test_result_id_fkey`: test_result_id → uat_test_results(id)

## Indexes

- `idx_uat_performance_metrics_run_id`
  ```sql
  CREATE INDEX idx_uat_performance_metrics_run_id ON public.uat_performance_metrics USING btree (run_id)
  ```
- `idx_uat_performance_metrics_type`
  ```sql
  CREATE INDEX idx_uat_performance_metrics_type ON public.uat_performance_metrics USING btree (metric_type)
  ```
- `uat_performance_metrics_pkey`
  ```sql
  CREATE UNIQUE INDEX uat_performance_metrics_pkey ON public.uat_performance_metrics USING btree (id)
  ```

## RLS Policies

### 1. service_role_all_uat_performance_metrics (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
