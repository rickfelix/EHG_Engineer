# uat_test_cases Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-20T19:27:37.470Z
**Rows**: 2,082
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (22 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| suite_id | `uuid` | YES | - | - |
| test_name | `character varying(255)` | **NO** | - | - |
| description | `text` | YES | - | - |
| user_story_id | `character varying(50)` | YES | - | - |
| test_steps | `jsonb` | YES | - | - |
| expected_results | `jsonb` | YES | - | - |
| test_data | `jsonb` | YES | - | - |
| preconditions | `text` | YES | - | - |
| postconditions | `text` | YES | - | - |
| test_type | `character varying(50)` | YES | - | - |
| priority | `character varying(20)` | YES | - | - |
| automation_status | `character varying(50)` | YES | `'pending'::character varying` | - |
| playwright_script | `text` | YES | - | - |
| selector_strategy | `jsonb` | YES | - | - |
| retry_count | `integer(32)` | YES | `3` | - |
| timeout_ms | `integer(32)` | YES | `30000` | - |
| is_flaky | `boolean` | YES | `false` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| created_by | `character varying(100)` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `uat_test_cases_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `uat_test_cases_suite_id_fkey`: suite_id → uat_test_suites(id)

## Indexes

- `idx_uat_test_cases_automation_status`
  ```sql
  CREATE INDEX idx_uat_test_cases_automation_status ON public.uat_test_cases USING btree (automation_status)
  ```
- `idx_uat_test_cases_suite_id`
  ```sql
  CREATE INDEX idx_uat_test_cases_suite_id ON public.uat_test_cases USING btree (suite_id)
  ```
- `idx_uat_test_cases_user_story`
  ```sql
  CREATE INDEX idx_uat_test_cases_user_story ON public.uat_test_cases USING btree (user_story_id)
  ```
- `uat_test_cases_pkey`
  ```sql
  CREATE UNIQUE INDEX uat_test_cases_pkey ON public.uat_test_cases USING btree (id)
  ```

## RLS Policies

### 1. service_role_all_uat_test_cases (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### update_uat_test_cases_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
