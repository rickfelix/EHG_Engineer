# eva_scheduler_queue Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-14T01:06:50.987Z
**Rows**: 1
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| last_blocking_decision_at | `timestamp with time zone` | YES | - | - |
| fifo_key | `timestamp with time zone` | **NO** | `now()` | - |
| status | `text` | **NO** | `'pending'::text` | - |
| max_stages_per_cycle | `integer(32)` | **NO** | `5` | - |
| last_dispatched_at | `timestamp with time zone` | YES | - | - |
| last_dispatch_outcome | `text` | YES | - | - |
| dispatch_count | `integer(32)` | **NO** | `0` | - |
| error_count | `integer(32)` | **NO** | `0` | - |
| last_error | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| blocking_decision_age_seconds | `numeric` | YES | `0` | - |

## Constraints

### Primary Key
- `eva_scheduler_queue_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `eva_scheduler_queue_venture_id_fkey`: venture_id → eva_ventures(id)

### Check Constraints
- `eva_scheduler_queue_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'dispatching'::text, 'blocked'::text, 'paused'::text, 'completed'::text])))

## Indexes

- `eva_scheduler_queue_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_scheduler_queue_pkey ON public.eva_scheduler_queue USING btree (id)
  ```
- `idx_esq_scheduling_order`
  ```sql
  CREATE INDEX idx_esq_scheduling_order ON public.eva_scheduler_queue USING btree (status, blocking_decision_age_seconds DESC NULLS LAST, fifo_key) WHERE (status = 'pending'::text)
  ```
- `idx_esq_status`
  ```sql
  CREATE INDEX idx_esq_status ON public.eva_scheduler_queue USING btree (status)
  ```
- `idx_esq_venture_id`
  ```sql
  CREATE UNIQUE INDEX idx_esq_venture_id ON public.eva_scheduler_queue USING btree (venture_id)
  ```

## RLS Policies

### 1. authenticated_read_esq (SELECT)

- **Roles**: {public}
- **Using**: `(auth.role() = 'authenticated'::text)`

### 2. service_role_esq (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`

## Triggers

### trg_esq_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION fn_esq_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
