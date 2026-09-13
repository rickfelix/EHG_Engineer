# michael_feeder_runs Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-09-13T06:31:02.341Z
**Rows**: 29
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (15 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| feeder | `text` | **NO** | - | - |
| et_date | `date` | **NO** | - | - |
| attempt | `integer(32)` | **NO** | `1` | - |
| venue | `text` | **NO** | - | - |
| status | `text` | **NO** | - | - |
| counts | `jsonb` | **NO** | `'{}'::jsonb` | - |
| log_md | `text` | YES | - | - |
| started_at | `timestamp with time zone` | YES | - | - |
| finished_at | `timestamp with time zone` | YES | - | - |
| model_used | `text` | YES | - | - |
| tokens_in | `integer(32)` | YES | - | - |
| tokens_out | `integer(32)` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `michael_feeder_runs_pkey`: PRIMARY KEY (id)

### Check Constraints
- `michael_feeder_runs_counts_check`: CHECK ((jsonb_typeof(counts) = 'object'::text))
- `michael_feeder_runs_status_check`: CHECK ((status = ANY (ARRAY['ok'::text, 'degraded'::text, 'failed'::text, 'skipped'::text, 'imported'::text])))
- `michael_feeder_runs_venue_check`: CHECK ((venue = ANY (ARRAY['task_scheduler'::text, 'gha'::text, 'seat'::text])))

## Indexes

- `michael_feeder_runs_date_feeder_attempt_uniq`
  ```sql
  CREATE UNIQUE INDEX michael_feeder_runs_date_feeder_attempt_uniq ON public.michael_feeder_runs USING btree (et_date, feeder, attempt)
  ```
- `michael_feeder_runs_pkey`
  ```sql
  CREATE UNIQUE INDEX michael_feeder_runs_pkey ON public.michael_feeder_runs USING btree (id)
  ```

## RLS Policies

### 1. michael_feeder_runs_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### michael_feeder_runs_set_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION michael_set_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
