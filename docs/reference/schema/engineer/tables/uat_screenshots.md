# uat_screenshots Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-20T19:27:37.470Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (19 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| test_result_id | `uuid` | YES | - | - |
| run_id | `uuid` | YES | - | - |
| screenshot_type | `character varying(50)` | YES | - | - |
| file_path | `text` | YES | - | - |
| storage_url | `text` | YES | - | - |
| file_size_kb | `integer(32)` | YES | - | - |
| width | `integer(32)` | YES | - | - |
| height | `integer(32)` | YES | - | - |
| format | `character varying(20)` | YES | - | - |
| captured_at | `timestamp with time zone` | YES | - | - |
| page_url | `text` | YES | - | - |
| element_selector | `text` | YES | - | - |
| is_full_page | `boolean` | YES | `false` | - |
| has_annotations | `boolean` | YES | `false` | - |
| annotations | `jsonb` | YES | - | - |
| visual_regression_data | `jsonb` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `uat_screenshots_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `uat_screenshots_run_id_fkey`: run_id → uat_test_runs(id)
- `uat_screenshots_test_result_id_fkey`: test_result_id → uat_test_results(id)

## Indexes

- `idx_uat_screenshots_run_id`
  ```sql
  CREATE INDEX idx_uat_screenshots_run_id ON public.uat_screenshots USING btree (run_id)
  ```
- `idx_uat_screenshots_test_result_id`
  ```sql
  CREATE INDEX idx_uat_screenshots_test_result_id ON public.uat_screenshots USING btree (test_result_id)
  ```
- `uat_screenshots_pkey`
  ```sql
  CREATE UNIQUE INDEX uat_screenshots_pkey ON public.uat_screenshots USING btree (id)
  ```

## RLS Policies

### 1. service_role_all_uat_screenshots (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
