# eva_saga_log Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-02T00:03:49.900Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| saga_id | `uuid` | **NO** | - | - |
| trace_id | `uuid` | YES | - | - |
| venture_id | `uuid` | YES | - | - |
| status | `text` | **NO** | `'pending'::text` | - |
| steps_registered | `ARRAY` | YES | `'{}'::text[]` | - |
| steps_completed | `ARRAY` | YES | `'{}'::text[]` | - |
| failed_step | `text` | YES | - | - |
| error_message | `text` | YES | - | - |
| compensation_errors | `jsonb` | YES | `'[]'::jsonb` | - |
| duration_ms | `integer(32)` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `eva_saga_log_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `eva_saga_log_venture_id_fkey`: venture_id → ventures(id)

## Indexes

- `eva_saga_log_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_saga_log_pkey ON public.eva_saga_log USING btree (id)
  ```
- `idx_eva_saga_log_saga_id`
  ```sql
  CREATE INDEX idx_eva_saga_log_saga_id ON public.eva_saga_log USING btree (saga_id)
  ```
- `idx_eva_saga_log_status`
  ```sql
  CREATE INDEX idx_eva_saga_log_status ON public.eva_saga_log USING btree (status)
  ```
- `idx_eva_saga_log_trace_id`
  ```sql
  CREATE INDEX idx_eva_saga_log_trace_id ON public.eva_saga_log USING btree (trace_id) WHERE (trace_id IS NOT NULL)
  ```
- `idx_eva_saga_log_venture_id`
  ```sql
  CREATE INDEX idx_eva_saga_log_venture_id ON public.eva_saga_log USING btree (venture_id)
  ```

## RLS Policies

### 1. service_role_all_eva_saga_log (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
