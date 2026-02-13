# uat_runs Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-13T21:05:35.429Z
**Rows**: 4
**RLS**: Enabled (6 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| app | `character varying(50)` | YES | `'EHG'::character varying` | - |
| env_url | `text` | **NO** | - | - |
| app_version | `character varying(50)` | YES | - | - |
| browser | `character varying(50)` | YES | - | - |
| role | `character varying(50)` | YES | - | - |
| started_at | `timestamp with time zone` | YES | `now()` | - |
| ended_at | `timestamp with time zone` | YES | - | - |
| created_by | `character varying(100)` | YES | `'UAT_LEAD'::character varying` | - |
| notes | `text` | YES | - | - |
| active_case_id | `text` | YES | - | - |
| active_case_started_at | `timestamp without time zone` | YES | - | - |
| last_activity | `timestamp without time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `uat_runs_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `uat_runs_active_case_id_fkey`: active_case_id → uat_cases(id)

## Indexes

- `idx_uat_runs_active_case`
  ```sql
  CREATE INDEX idx_uat_runs_active_case ON public.uat_runs USING btree (active_case_id) WHERE (active_case_id IS NOT NULL)
  ```
- `uat_runs_pkey`
  ```sql
  CREATE UNIQUE INDEX uat_runs_pkey ON public.uat_runs USING btree (id)
  ```

## RLS Policies

### 1. Anon users can create uat_runs (INSERT)

- **Roles**: {public}
- **With Check**: `true`

### 2. Anon users can update uat_runs (UPDATE)

- **Roles**: {public}
- **Using**: `true`
- **With Check**: `true`

### 3. Anon users can view all uat_runs (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 4. uat_runs_auth_read (SELECT)

- **Roles**: {public}
- **Using**: `(auth.role() = 'authenticated'::text)`

### 5. uat_runs_chairman_read (SELECT)

- **Roles**: {public}
- **Using**: `(((auth.jwt() ->> 'role'::text) = 'chairman'::text) OR ((auth.jwt() ->> 'email'::text) ~~ '%@chairman%'::text))`

### 6. uat_runs_service_all (ALL)

- **Roles**: {public}
- **Using**: `(((auth.jwt() ->> 'role'::text) = 'service_role'::text) OR (CURRENT_USER = 'service_role'::name))`

---

[← Back to Schema Overview](../database-schema-overview.md)
