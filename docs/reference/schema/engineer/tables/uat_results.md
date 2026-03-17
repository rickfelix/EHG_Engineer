# uat_results Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-17T22:39:49.934Z
**Rows**: 123
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| run_id | `uuid` | YES | - | - |
| case_id | `text` | YES | - | - |
| status | `character varying(20)` | **NO** | - | - |
| evidence_url | `text` | YES | - | - |
| evidence_heading | `text` | YES | - | - |
| evidence_toast | `text` | YES | - | - |
| notes | `text` | YES | - | - |
| recorded_at | `timestamp with time zone` | YES | `now()` | - |
| started_at | `timestamp without time zone` | YES | - | - |
| duration_seconds | `integer(32)` | YES | - | - |

## Constraints

### Primary Key
- `uat_results_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `uat_results_case_id_fkey`: case_id → uat_cases(id)
- `uat_results_run_id_fkey`: run_id → uat_runs(id)

### Unique Constraints
- `uat_results_run_id_case_id_key`: UNIQUE (run_id, case_id)

### Check Constraints
- `uat_results_status_check`: CHECK (((status)::text = ANY ((ARRAY['PASS'::character varying, 'FAIL'::character varying, 'BLOCKED'::character varying, 'NA'::character varying])::text[])))

## Indexes

- `idx_uat_results_run_case`
  ```sql
  CREATE INDEX idx_uat_results_run_case ON public.uat_results USING btree (run_id, case_id)
  ```
- `idx_uat_results_status`
  ```sql
  CREATE INDEX idx_uat_results_status ON public.uat_results USING btree (status)
  ```
- `uat_results_pkey`
  ```sql
  CREATE UNIQUE INDEX uat_results_pkey ON public.uat_results USING btree (id)
  ```
- `uat_results_run_id_case_id_key`
  ```sql
  CREATE UNIQUE INDEX uat_results_run_id_case_id_key ON public.uat_results USING btree (run_id, case_id)
  ```

## RLS Policies

### 1. authenticated_select_uat_results (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_uat_results (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
