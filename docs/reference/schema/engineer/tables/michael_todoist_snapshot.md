# michael_todoist_snapshot Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-09-13T06:31:02.341Z
**Rows**: 38
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| et_date | `date` | **NO** | - | - |
| task_id | `text` | **NO** | - | - |
| effort_grade | `text` | YES | - | - |
| est_minutes | `integer(32)` | YES | - | - |
| role_tag | `text` | YES | - | - |
| proposed_date | `date` | YES | - | - |
| proposed_action | `text` | YES | - | - |
| chosen_action | `text` | YES | - | - |
| rule_key | `text` | YES | - | - |
| mutations_applied | `jsonb` | **NO** | `'[]'::jsonb` | - |
| moved_back_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `michael_todoist_snapshot_pkey`: PRIMARY KEY (id)

### Check Constraints
- `michael_todoist_snapshot_mutations_applied_check`: CHECK ((jsonb_typeof(mutations_applied) = 'array'::text))

## Indexes

- `michael_todoist_snapshot_date_task_uniq`
  ```sql
  CREATE UNIQUE INDEX michael_todoist_snapshot_date_task_uniq ON public.michael_todoist_snapshot USING btree (et_date, task_id)
  ```
- `michael_todoist_snapshot_pkey`
  ```sql
  CREATE UNIQUE INDEX michael_todoist_snapshot_pkey ON public.michael_todoist_snapshot USING btree (id)
  ```
- `michael_todoist_snapshot_rule_moved_back_idx`
  ```sql
  CREATE INDEX michael_todoist_snapshot_rule_moved_back_idx ON public.michael_todoist_snapshot USING btree (rule_key) WHERE (moved_back_at IS NOT NULL)
  ```

## RLS Policies

### 1. michael_todoist_snapshot_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### michael_todoist_snapshot_set_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION michael_set_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
