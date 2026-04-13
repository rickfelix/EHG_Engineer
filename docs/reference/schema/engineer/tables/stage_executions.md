# stage_executions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-13T15:18:40.578Z
**Rows**: 18
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| lifecycle_stage | `integer(32)` | **NO** | - | - |
| worker_id | `text` | **NO** | - | Identifies which worker instance processed this execution. |
| status | `text` | **NO** | `'running'::text` | - |
| started_at | `timestamp with time zone` | **NO** | `now()` | - |
| completed_at | `timestamp with time zone` | YES | - | - |
| heartbeat_at | `timestamp with time zone` | **NO** | `now()` | Refreshed periodically during processing. Stale heartbeat = crashed worker. |
| error_message | `text` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `stage_executions_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `stage_executions_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `stage_executions_status_check`: CHECK ((status = ANY (ARRAY['running'::text, 'succeeded'::text, 'failed'::text, 'timed_out'::text])))

## Indexes

- `idx_stage_executions_stale_detection`
  ```sql
  CREATE INDEX idx_stage_executions_stale_detection ON public.stage_executions USING btree (status, heartbeat_at) WHERE (status = 'running'::text)
  ```
- `idx_stage_executions_venture_stage`
  ```sql
  CREATE INDEX idx_stage_executions_venture_stage ON public.stage_executions USING btree (venture_id, lifecycle_stage)
  ```
- `idx_stage_executions_worker`
  ```sql
  CREATE INDEX idx_stage_executions_worker ON public.stage_executions USING btree (worker_id, started_at DESC)
  ```
- `stage_executions_pkey`
  ```sql
  CREATE UNIQUE INDEX stage_executions_pkey ON public.stage_executions USING btree (id)
  ```

## RLS Policies

### 1. Service role full access on stage_executions (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`
- **With Check**: `(auth.role() = 'service_role'::text)`

## Triggers

### trg_stage_executions_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_stage_executions_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
