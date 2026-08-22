# drive_reports Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-08-22T17:33:48.904Z
**Rows**: 15
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| generated_at | `timestamp with time zone` | **NO** | `now()` | - |
| run_id | `text` | YES | - | - |
| cadence | `text` | **NO** | `'scheduled'::text` | - |
| sections | `jsonb` | **NO** | `'{}'::jsonb` | - |
| drive_score | `jsonb` | **NO** | `'{}'::jsonb` | - |
| schema_version | `integer(32)` | **NO** | `1` | - |
| metadata | `jsonb` | **NO** | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `drive_reports_pkey`: PRIMARY KEY (id)

### Check Constraints
- `drive_reports_cadence_check`: CHECK ((cadence = ANY (ARRAY['scheduled'::text, 'on_demand'::text])))

## Indexes

- `drive_reports_generated_at_idx`
  ```sql
  CREATE INDEX drive_reports_generated_at_idx ON public.drive_reports USING btree (generated_at DESC)
  ```
- `drive_reports_pkey`
  ```sql
  CREATE UNIQUE INDEX drive_reports_pkey ON public.drive_reports USING btree (id)
  ```
- `drive_reports_run_id_uniq`
  ```sql
  CREATE UNIQUE INDEX drive_reports_run_id_uniq ON public.drive_reports USING btree (run_id) WHERE (run_id IS NOT NULL)
  ```

## RLS Policies

### 1. drive_reports_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### drive_reports_freeze_observations_trg

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION drive_reports_freeze_observations()`

### drive_reports_guard_delete_trg

- **Timing**: BEFORE DELETE
- **Action**: `EXECUTE FUNCTION drive_reports_guard_delete()`

---

[← Back to Schema Overview](../database-schema-overview.md)
