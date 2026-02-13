# uat_test_suites Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-13T01:26:00.621Z
**Rows**: 100
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (17 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| suite_name | `character varying(255)` | **NO** | - | - |
| description | `text` | YES | - | - |
| module | `character varying(100)` | YES | - | - |
| test_type | `character varying(50)` | YES | - | - |
| priority | `character varying(20)` | YES | - | - |
| status | `character varying(50)` | YES | `'active'::character varying` | - |
| total_tests | `integer(32)` | YES | `0` | - |
| passing_tests | `integer(32)` | YES | `0` | - |
| failing_tests | `integer(32)` | YES | `0` | - |
| skipped_tests | `integer(32)` | YES | `0` | - |
| last_run_at | `timestamp with time zone` | YES | - | - |
| average_duration_ms | `integer(32)` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| created_by | `character varying(100)` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `uat_test_suites_pkey`: PRIMARY KEY (id)

## Indexes

- `uat_test_suites_pkey`
  ```sql
  CREATE UNIQUE INDEX uat_test_suites_pkey ON public.uat_test_suites USING btree (id)
  ```

## RLS Policies

### 1. service_role_all_uat_test_suites (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### update_uat_test_suites_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
