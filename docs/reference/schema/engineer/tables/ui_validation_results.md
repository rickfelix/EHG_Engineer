# ui_validation_results Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-05T11:19:21.578Z
**Rows**: 2
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (20 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| prd_id | `character varying(255)` | **NO** | - | - |
| sd_id | `character varying(255)` | YES | - | - |
| test_run_id | `character varying(255)` | **NO** | - | - |
| test_type | `character varying(50)` | **NO** | - | - |
| total_tests | `integer(32)` | YES | `0` | - |
| passed_tests | `integer(32)` | YES | `0` | - |
| failed_tests | `integer(32)` | YES | `0` | - |
| warnings | `integer(32)` | YES | `0` | - |
| success_rate | `numeric(5,2)` | YES | `0` | - |
| validation_status | `character varying(50)` | **NO** | - | - |
| ui_complete | `boolean` | YES | `false` | - |
| gaps_detected | `jsonb` | YES | `'[]'::jsonb` | - |
| screenshots | `jsonb` | YES | `'[]'::jsonb` | - |
| test_report | `jsonb` | YES | - | - |
| error_logs | `text` | YES | - | - |
| tested_by | `character varying(100)` | YES | `'Testing Sub-Agent'::character varying` | - |
| test_duration_ms | `integer(32)` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `CURRENT_TIMESTAMP` | - |
| updated_at | `timestamp with time zone` | YES | `CURRENT_TIMESTAMP` | - |

## Constraints

### Primary Key
- `ui_validation_results_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `ui_validation_results_test_run_id_key`: UNIQUE (test_run_id)

## Indexes

- `idx_ui_validation_prd`
  ```sql
  CREATE INDEX idx_ui_validation_prd ON public.ui_validation_results USING btree (prd_id)
  ```
- `idx_ui_validation_status`
  ```sql
  CREATE INDEX idx_ui_validation_status ON public.ui_validation_results USING btree (validation_status)
  ```
- `ui_validation_results_pkey`
  ```sql
  CREATE UNIQUE INDEX ui_validation_results_pkey ON public.ui_validation_results USING btree (id)
  ```
- `ui_validation_results_test_run_id_key`
  ```sql
  CREATE UNIQUE INDEX ui_validation_results_test_run_id_key ON public.ui_validation_results USING btree (test_run_id)
  ```

## RLS Policies

### 1. authenticated_read_ui_validation_results (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_ui_validation_results (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
