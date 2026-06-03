# cascade_watcher_heartbeats Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-06-03T20:43:46.054Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| run_id | `uuid` | **NO** | `gen_random_uuid()` | - |
| hostname | `text` | **NO** | `''::text` | - |
| pid | `integer(32)` | YES | - | - |
| started_at | `timestamp with time zone` | **NO** | `now()` | - |
| finished_at | `timestamp with time zone` | YES | - | - |
| exit_code | `integer(32)` | YES | - | - |
| refusal_count | `integer(32)` | **NO** | `0` | Cumulative refusals observed by this watcher run (writes to eva_cascade_errors). |
| success_count | `integer(32)` | **NO** | `0` | Cumulative successful cascade transitions in this run. |
| metadata | `jsonb` | **NO** | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `cascade_watcher_heartbeats_pkey`: PRIMARY KEY (run_id)

### Check Constraints
- `cascade_watcher_heartbeats_counts_chk`: CHECK (((refusal_count >= 0) AND (success_count >= 0)))
- `cascade_watcher_heartbeats_finished_pair_chk`: CHECK ((((finished_at IS NULL) AND (exit_code IS NULL)) OR ((finished_at IS NOT NULL) AND (exit_code IS NOT NULL))))

## Indexes

- `cascade_watcher_heartbeats_open_idx`
  ```sql
  CREATE INDEX cascade_watcher_heartbeats_open_idx ON public.cascade_watcher_heartbeats USING btree (started_at DESC) WHERE (finished_at IS NULL)
  ```
- `cascade_watcher_heartbeats_pkey`
  ```sql
  CREATE UNIQUE INDEX cascade_watcher_heartbeats_pkey ON public.cascade_watcher_heartbeats USING btree (run_id)
  ```
- `cascade_watcher_heartbeats_started_idx`
  ```sql
  CREATE INDEX cascade_watcher_heartbeats_started_idx ON public.cascade_watcher_heartbeats USING btree (started_at DESC)
  ```

## RLS Policies

### 1. cascade_watcher_heartbeats_authenticated_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. cascade_watcher_heartbeats_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_cascade_watcher_heartbeats_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
