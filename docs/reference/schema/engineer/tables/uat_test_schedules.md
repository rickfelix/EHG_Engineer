# uat_test_schedules Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-31T17:23:48.219Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (17 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| schedule_name | `character varying(255)` | **NO** | - | - |
| description | `text` | YES | - | - |
| suite_id | `uuid` | YES | - | - |
| cron_expression | `character varying(100)` | YES | - | - |
| timezone | `character varying(50)` | YES | `'UTC'::character varying` | - |
| is_active | `boolean` | YES | `true` | - |
| environment | `character varying(50)` | YES | - | - |
| browsers | `ARRAY` | YES | - | - |
| devices | `ARRAY` | YES | - | - |
| notification_channels | `jsonb` | YES | - | - |
| last_run_at | `timestamp with time zone` | YES | - | - |
| next_run_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| created_by | `character varying(100)` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `uat_test_schedules_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `uat_test_schedules_suite_id_fkey`: suite_id → uat_test_suites(id)

## Indexes

- `uat_test_schedules_pkey`
  ```sql
  CREATE UNIQUE INDEX uat_test_schedules_pkey ON public.uat_test_schedules USING btree (id)
  ```

## RLS Policies

### 1. service_role_all_uat_test_schedules (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### update_uat_test_schedules_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
