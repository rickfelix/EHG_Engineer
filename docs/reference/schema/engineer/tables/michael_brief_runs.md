# michael_brief_runs Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-09-13T06:31:02.341Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| et_date | `date` | **NO** | - | - |
| data_json | `jsonb` | YES | - | - |
| rendered_html | `text` | YES | - | - |
| brief_md | `text` | YES | - | - |
| assembled_at | `timestamp with time zone` | YES | - | - |
| rendered_at | `timestamp with time zone` | YES | - | - |
| verified | `boolean` | **NO** | `false` | - |
| verify_notes | `text` | YES | - | - |
| enriched_at | `timestamp with time zone` | YES | - | - |
| surfaced_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `michael_brief_runs_pkey`: PRIMARY KEY (id)

## Indexes

- `michael_brief_runs_et_date_uniq`
  ```sql
  CREATE UNIQUE INDEX michael_brief_runs_et_date_uniq ON public.michael_brief_runs USING btree (et_date)
  ```
- `michael_brief_runs_pkey`
  ```sql
  CREATE UNIQUE INDEX michael_brief_runs_pkey ON public.michael_brief_runs USING btree (id)
  ```

## RLS Policies

### 1. michael_brief_runs_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### michael_brief_runs_set_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION michael_set_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
