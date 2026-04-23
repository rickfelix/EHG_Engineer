# leo_lint_run_history Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-23T20:30:05.760Z
**Rows**: 10
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| run_id | `uuid` | **NO** | `gen_random_uuid()` | - |
| trigger | `text` | **NO** | - | - |
| total_violations | `integer(32)` | **NO** | `0` | - |
| critical_count | `integer(32)` | **NO** | `0` | - |
| passed | `boolean` | **NO** | - | - |
| bypass_reason | `text` | YES | - | - |
| started_at | `timestamp with time zone` | **NO** | `now()` | - |
| ended_at | `timestamp with time zone` | YES | - | - |
| duration_ms | `integer(32)` | YES | - | - |
| initiator | `text` | YES | - | - |
| metadata | `jsonb` | **NO** | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `leo_lint_run_history_pkey`: PRIMARY KEY (run_id)

### Check Constraints
- `leo_lint_run_history_trigger_check`: CHECK ((trigger = ANY (ARRAY['regen'::text, 'audit'::text, 'bypass'::text, 'precommit'::text])))

## Indexes

- `idx_leo_lint_run_history_started`
  ```sql
  CREATE INDEX idx_leo_lint_run_history_started ON public.leo_lint_run_history USING btree (started_at DESC)
  ```
- `idx_leo_lint_run_history_trigger_started`
  ```sql
  CREATE INDEX idx_leo_lint_run_history_trigger_started ON public.leo_lint_run_history USING btree (trigger, started_at DESC)
  ```
- `leo_lint_run_history_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_lint_run_history_pkey ON public.leo_lint_run_history USING btree (run_id)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
