# test_results Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-30T10:05:06.556Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| test_run_id | `uuid` | **NO** | - | - |
| test_file_path | `character varying(500)` | **NO** | - | - |
| test_name | `character varying(1000)` | **NO** | - | - |
| test_full_title | `character varying(2000)` | YES | - | - |
| status | `character varying(20)` | **NO** | - | - |
| duration_ms | `integer(32)` | YES | - | - |
| error_message | `text` | YES | - | - |
| error_stack | `text` | YES | - | - |
| failure_screenshot_path | `character varying(500)` | YES | - | - |
| retry_count | `integer(32)` | YES | `0` | - |
| annotations | `jsonb` | YES | `'[]'::jsonb` | - |
| attachments | `jsonb` | YES | `'[]'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `test_results_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `test_results_test_run_id_fkey`: test_run_id → test_runs(id)

### Check Constraints
- `test_results_status_check`: CHECK (((status)::text = ANY ((ARRAY['passed'::character varying, 'failed'::character varying, 'skipped'::character varying, 'timedOut'::character varying, 'interrupted'::character varying])::text[])))

## Indexes

- `idx_test_results_run_id`
  ```sql
  CREATE INDEX idx_test_results_run_id ON public.test_results USING btree (test_run_id)
  ```
- `idx_test_results_status`
  ```sql
  CREATE INDEX idx_test_results_status ON public.test_results USING btree (status)
  ```
- `test_results_pkey`
  ```sql
  CREATE UNIQUE INDEX test_results_pkey ON public.test_results USING btree (id)
  ```

## RLS Policies

### 1. Allow inserts to test_results (INSERT)

- **Roles**: {public}
- **With Check**: `true`

### 2. Anyone can read test_results (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 3. No deletes from test_results (DELETE)

- **Roles**: {public}
- **Using**: `false`

### 4. No updates to test_results (UPDATE)

- **Roles**: {public}
- **Using**: `false`

---

[← Back to Schema Overview](../database-schema-overview.md)
