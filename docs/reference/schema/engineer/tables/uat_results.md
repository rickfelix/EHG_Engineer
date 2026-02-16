# uat_results Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-16T20:17:30.369Z
**Rows**: 123
**RLS**: Enabled (5 policies)

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

### 1. Anon users can create uat_results (INSERT)

- **Roles**: {public}
- **With Check**: `true`

### 2. Anon users can view all uat_results (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 3. uat_results_auth_read (SELECT)

- **Roles**: {public}
- **Using**: `(auth.role() = 'authenticated'::text)`

### 4. uat_results_chairman_read (SELECT)

- **Roles**: {public}
- **Using**: `(((auth.jwt() ->> 'role'::text) = 'chairman'::text) OR ((auth.jwt() ->> 'email'::text) ~~ '%@chairman%'::text))`

### 5. uat_results_service_all (ALL)

- **Roles**: {public}
- **Using**: `(((auth.jwt() ->> 'role'::text) = 'service_role'::text) OR (CURRENT_USER = 'service_role'::name))`

---

[← Back to Schema Overview](../database-schema-overview.md)
