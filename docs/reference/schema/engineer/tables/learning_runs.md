# learning_runs Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-24T02:57:22.920Z
**Rows**: 0
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `uuid` | **NO** | - | FK to strategic_directives_v2.id (no FK constraint — soft reference so SD deletions do not cascade-drop learning history). |
| run_type | `text` | **NO** | - | process (process phase), auto_approve (AUTO-PROCEED path), insights (effectiveness report), apply (final SD creation). |
| status | `text` | **NO** | `'started'::text` | started on invocation, completed on success, failed on exception. Gate queries status IN (completed, success). |
| started_at | `timestamp with time zone` | **NO** | `now()` | - |
| completed_at | `timestamp with time zone` | YES | - | - |
| error_message | `text` | YES | - | - |
| items_approved | `integer(32)` | YES | `0` | - |
| items_deferred | `integer(32)` | YES | `0` | - |
| resulting_sd_keys | `ARRAY` | YES | `ARRAY[]::text[]` | SD keys created by the /learn run, if any. Used by analytics and follow-up tracking. |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `learning_runs_pkey`: PRIMARY KEY (id)

### Check Constraints
- `learning_runs_run_type_check`: CHECK ((run_type = ANY (ARRAY['process'::text, 'auto_approve'::text, 'insights'::text, 'apply'::text])))
- `learning_runs_status_check`: CHECK ((status = ANY (ARRAY['started'::text, 'in_progress'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])))

## Indexes

- `idx_learning_runs_completed`
  ```sql
  CREATE INDEX idx_learning_runs_completed ON public.learning_runs USING btree (completed_at) WHERE (completed_at IS NOT NULL)
  ```
- `idx_learning_runs_sd_id`
  ```sql
  CREATE INDEX idx_learning_runs_sd_id ON public.learning_runs USING btree (sd_id)
  ```
- `idx_learning_runs_status`
  ```sql
  CREATE INDEX idx_learning_runs_status ON public.learning_runs USING btree (status)
  ```
- `learning_runs_pkey`
  ```sql
  CREATE UNIQUE INDEX learning_runs_pkey ON public.learning_runs USING btree (id)
  ```

## Triggers

### learning_runs_touch_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION trg_learning_runs_touch_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
