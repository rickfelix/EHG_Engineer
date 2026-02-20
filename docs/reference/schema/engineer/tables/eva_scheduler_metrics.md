# eva_scheduler_metrics Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-20T19:58:57.591Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (18 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| event_type | `text` | **NO** | - | - |
| occurred_at | `timestamp with time zone` | **NO** | `now()` | - |
| scheduler_instance_id | `text` | YES | - | - |
| venture_id | `uuid` | YES | - | - |
| stage_name | `text` | YES | - | - |
| outcome | `text` | YES | - | - |
| failure_reason | `text` | YES | - | - |
| duration_ms | `integer(32)` | YES | - | - |
| queue_depth | `integer(32)` | YES | - | - |
| dispatched_count | `integer(32)` | YES | - | - |
| paused | `boolean` | YES | `false` | - |
| pause_reason | `text` | YES | - | - |
| stages_dispatched | `integer(32)` | YES | - | - |
| stages_remaining | `integer(32)` | YES | - | - |
| max_stages_per_cycle | `integer(32)` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `eva_scheduler_metrics_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `eva_scheduler_metrics_venture_id_fkey`: venture_id → eva_ventures(id)

### Check Constraints
- `eva_scheduler_metrics_event_type_check`: CHECK ((event_type = ANY (ARRAY['scheduler_poll'::text, 'scheduler_dispatch'::text, 'scheduler_cadence_limited'::text, 'scheduler_circuit_breaker_pause'::text, 'scheduler_error'::text])))
- `eva_scheduler_metrics_outcome_check`: CHECK ((outcome = ANY (ARRAY['success'::text, 'failure'::text, 'skipped'::text, NULL::text])))

## Indexes

- `eva_scheduler_metrics_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_scheduler_metrics_pkey ON public.eva_scheduler_metrics USING btree (id)
  ```
- `idx_esm_event_type_time`
  ```sql
  CREATE INDEX idx_esm_event_type_time ON public.eva_scheduler_metrics USING btree (event_type, occurred_at DESC)
  ```
- `idx_esm_venture_time`
  ```sql
  CREATE INDEX idx_esm_venture_time ON public.eva_scheduler_metrics USING btree (venture_id, occurred_at DESC) WHERE (venture_id IS NOT NULL)
  ```

## RLS Policies

### 1. eva_scheduler_metrics_authenticated_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. eva_scheduler_metrics_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
