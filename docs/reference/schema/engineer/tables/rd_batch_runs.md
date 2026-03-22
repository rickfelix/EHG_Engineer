# rd_batch_runs Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-22T07:47:56.894Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| batch_type | `text` | **NO** | `'monday_proposals'::text` | - |
| signals_collected | `integer(32)` | YES | `0` | - |
| proposals_generated | `integer(32)` | YES | `0` | - |
| dry_run | `boolean` | YES | `false` | - |
| duration_ms | `integer(32)` | YES | - | - |
| error_log | `jsonb` | YES | `'[]'::jsonb` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `rd_batch_runs_pkey`: PRIMARY KEY (id)

## Indexes

- `idx_rd_batch_runs_created_at`
  ```sql
  CREATE INDEX idx_rd_batch_runs_created_at ON public.rd_batch_runs USING btree (created_at DESC)
  ```
- `rd_batch_runs_pkey`
  ```sql
  CREATE UNIQUE INDEX rd_batch_runs_pkey ON public.rd_batch_runs USING btree (id)
  ```

## RLS Policies

### 1. rd_batch_runs_authenticated_read (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. rd_batch_runs_service_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
