# eva_trace_log Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-20T19:27:37.470Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| trace_id | `uuid` | **NO** | - | - |
| parent_trace_id | `uuid` | YES | - | - |
| venture_id | `uuid` | YES | - | - |
| spans | `jsonb` | YES | `'[]'::jsonb` | - |
| events | `jsonb` | YES | `'[]'::jsonb` | - |
| total_duration_ms | `integer(32)` | YES | - | - |
| span_count | `integer(32)` | YES | `0` | - |
| event_count | `integer(32)` | YES | `0` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `eva_trace_log_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `eva_trace_log_venture_id_fkey`: venture_id → ventures(id)

## Indexes

- `eva_trace_log_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_trace_log_pkey ON public.eva_trace_log USING btree (id)
  ```
- `idx_eva_trace_log_created_at`
  ```sql
  CREATE INDEX idx_eva_trace_log_created_at ON public.eva_trace_log USING btree (created_at)
  ```
- `idx_eva_trace_log_parent_trace_id`
  ```sql
  CREATE INDEX idx_eva_trace_log_parent_trace_id ON public.eva_trace_log USING btree (parent_trace_id) WHERE (parent_trace_id IS NOT NULL)
  ```
- `idx_eva_trace_log_trace_id`
  ```sql
  CREATE INDEX idx_eva_trace_log_trace_id ON public.eva_trace_log USING btree (trace_id)
  ```
- `idx_eva_trace_log_venture_id`
  ```sql
  CREATE INDEX idx_eva_trace_log_venture_id ON public.eva_trace_log USING btree (venture_id)
  ```

## RLS Policies

### 1. service_role_all_eva_trace_log (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
