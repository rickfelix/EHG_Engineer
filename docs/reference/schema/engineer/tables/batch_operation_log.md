# batch_operation_log Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-09T19:20:23.701Z
**Rows**: 0
**RLS**: Enabled (0 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| operation | `text` | **NO** | - | - |
| dry_run | `boolean` | **NO** | `true` | - |
| operator | `text` | YES | - | - |
| total_items | `integer(32)` | **NO** | `0` | - |
| processed | `integer(32)` | **NO** | `0` | - |
| skipped | `integer(32)` | **NO** | `0` | - |
| failed | `integer(32)` | **NO** | `0` | - |
| details | `jsonb` | YES | `'[]'::jsonb` | - |
| started_at | `timestamp with time zone` | **NO** | `now()` | - |
| completed_at | `timestamp with time zone` | YES | - | - |
| duration_ms | `integer(32)` | YES | - | - |
| error_message | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `batch_operation_log_pkey`: PRIMARY KEY (id)

## Indexes

- `batch_operation_log_pkey`
  ```sql
  CREATE UNIQUE INDEX batch_operation_log_pkey ON public.batch_operation_log USING btree (id)
  ```
- `idx_batch_operation_log_created`
  ```sql
  CREATE INDEX idx_batch_operation_log_created ON public.batch_operation_log USING btree (created_at DESC)
  ```
- `idx_batch_operation_log_operation`
  ```sql
  CREATE INDEX idx_batch_operation_log_operation ON public.batch_operation_log USING btree (operation)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
