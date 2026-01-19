# uat_issues Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-19T00:41:19.984Z
**Rows**: 0
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (28 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| issue_key | `character varying(50)` | **NO** | - | - |
| test_result_id | `uuid` | YES | - | - |
| test_case_id | `uuid` | YES | - | - |
| run_id | `uuid` | YES | - | - |
| title | `character varying(255)` | **NO** | - | - |
| description | `text` | YES | - | - |
| severity | `character varying(20)` | YES | - | - |
| priority | `character varying(20)` | YES | - | - |
| status | `character varying(50)` | YES | `'open'::character varying` | - |
| issue_type | `character varying(50)` | YES | - | - |
| affected_module | `character varying(100)` | YES | - | - |
| affected_url | `text` | YES | - | - |
| steps_to_reproduce | `text` | YES | - | - |
| expected_behavior | `text` | YES | - | - |
| actual_behavior | `text` | YES | - | - |
| screenshots | `jsonb` | YES | - | - |
| browser_info | `character varying(255)` | YES | - | - |
| assignee | `character varying(100)` | YES | - | - |
| fix_sd_id | `character varying(50)` | YES | - | - |
| resolution | `text` | YES | - | - |
| resolved_at | `timestamp with time zone` | YES | - | - |
| resolved_by | `character varying(100)` | YES | - | - |
| verified_in_run_id | `uuid` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| created_by | `character varying(100)` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `uat_issues_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `uat_issues_run_id_fkey`: run_id → uat_test_runs(id)
- `uat_issues_test_case_id_fkey`: test_case_id → uat_test_cases(id)
- `uat_issues_test_result_id_fkey`: test_result_id → uat_test_results(id)

### Unique Constraints
- `uat_issues_issue_key_key`: UNIQUE (issue_key)

## Indexes

- `idx_uat_issues_fix_sd_id`
  ```sql
  CREATE INDEX idx_uat_issues_fix_sd_id ON public.uat_issues USING btree (fix_sd_id)
  ```
- `idx_uat_issues_severity`
  ```sql
  CREATE INDEX idx_uat_issues_severity ON public.uat_issues USING btree (severity)
  ```
- `idx_uat_issues_status`
  ```sql
  CREATE INDEX idx_uat_issues_status ON public.uat_issues USING btree (status)
  ```
- `idx_uat_issues_test_result_id`
  ```sql
  CREATE INDEX idx_uat_issues_test_result_id ON public.uat_issues USING btree (test_result_id)
  ```
- `uat_issues_issue_key_key`
  ```sql
  CREATE UNIQUE INDEX uat_issues_issue_key_key ON public.uat_issues USING btree (issue_key)
  ```
- `uat_issues_pkey`
  ```sql
  CREATE UNIQUE INDEX uat_issues_pkey ON public.uat_issues USING btree (id)
  ```

## Triggers

### update_uat_issues_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
