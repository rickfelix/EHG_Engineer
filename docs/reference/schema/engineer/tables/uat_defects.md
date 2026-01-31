# uat_defects Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-31T21:38:14.951Z
**Rows**: 0
**RLS**: Enabled (5 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| run_id | `uuid` | YES | - | - |
| case_id | `text` | YES | - | - |
| severity | `character varying(20)` | YES | - | - |
| summary | `text` | **NO** | - | - |
| steps | `text` | YES | - | - |
| expected | `text` | YES | - | - |
| actual | `text` | YES | - | - |
| suspected_files | `jsonb` | YES | - | - |
| status | `character varying(20)` | YES | `'open'::character varying` | - |
| assignee | `character varying(100)` | YES | - | - |
| found_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `uat_defects_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `uat_defects_case_id_fkey`: case_id → uat_cases(id)
- `uat_defects_run_id_fkey`: run_id → uat_runs(id)

### Check Constraints
- `uat_defects_severity_check`: CHECK (((severity)::text = ANY ((ARRAY['critical'::character varying, 'major'::character varying, 'minor'::character varying, 'trivial'::character varying])::text[])))
- `uat_defects_status_check`: CHECK (((status)::text = ANY ((ARRAY['open'::character varying, 'in_progress'::character varying, 'resolved'::character varying, 'closed'::character varying, 'wont_fix'::character varying])::text[])))

## Indexes

- `idx_uat_defects_run_id`
  ```sql
  CREATE INDEX idx_uat_defects_run_id ON public.uat_defects USING btree (run_id)
  ```
- `idx_uat_defects_severity`
  ```sql
  CREATE INDEX idx_uat_defects_severity ON public.uat_defects USING btree (severity)
  ```
- `idx_uat_defects_status`
  ```sql
  CREATE INDEX idx_uat_defects_status ON public.uat_defects USING btree (status)
  ```
- `uat_defects_pkey`
  ```sql
  CREATE UNIQUE INDEX uat_defects_pkey ON public.uat_defects USING btree (id)
  ```

## RLS Policies

### 1. Anon users can create uat_defects (INSERT)

- **Roles**: {public}
- **With Check**: `true`

### 2. Anon users can view all uat_defects (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 3. uat_defects_auth_read (SELECT)

- **Roles**: {public}
- **Using**: `(auth.role() = 'authenticated'::text)`

### 4. uat_defects_chairman_read (SELECT)

- **Roles**: {public}
- **Using**: `(((auth.jwt() ->> 'role'::text) = 'chairman'::text) OR ((auth.jwt() ->> 'email'::text) ~~ '%@chairman%'::text))`

### 5. uat_defects_service_all (ALL)

- **Roles**: {public}
- **Using**: `(((auth.jwt() ->> 'role'::text) = 'service_role'::text) OR (CURRENT_USER = 'service_role'::name))`

---

[← Back to Schema Overview](../database-schema-overview.md)
