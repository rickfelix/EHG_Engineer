# worker_spawn_requests Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-27T02:34:49.236Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| requested_by_session_id | `text` | YES | - | - |
| requested_callsign | `text` | **NO** | - | - |
| status | `text` | **NO** | `'pending'::text` | - |
| requested_at | `timestamp with time zone` | **NO** | `now()` | - |
| fulfilled_by_session_id | `text` | YES | - | - |
| fulfilled_at | `timestamp with time zone` | YES | - | - |
| expires_at | `timestamp with time zone` | **NO** | `(now() + '01:00:00'::interval)` | - |
| payload | `jsonb` | YES | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `worker_spawn_requests_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `worker_spawn_requests_fulfilled_by_session_id_fkey`: fulfilled_by_session_id → claude_sessions(session_id)
- `worker_spawn_requests_requested_by_session_id_fkey`: requested_by_session_id → claude_sessions(session_id)

### Check Constraints
- `worker_spawn_requests_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'fulfilled'::text, 'expired'::text, 'cancelled'::text])))

## Indexes

- `idx_wsr_requested_by_session_id`
  ```sql
  CREATE INDEX idx_wsr_requested_by_session_id ON public.worker_spawn_requests USING btree (requested_by_session_id)
  ```
- `idx_wsr_status_requested_at`
  ```sql
  CREATE INDEX idx_wsr_status_requested_at ON public.worker_spawn_requests USING btree (status, requested_at DESC)
  ```
- `idx_wsr_unique_pending_callsign`
  ```sql
  CREATE UNIQUE INDEX idx_wsr_unique_pending_callsign ON public.worker_spawn_requests USING btree (requested_callsign) WHERE (status = 'pending'::text)
  ```
- `worker_spawn_requests_pkey`
  ```sql
  CREATE UNIQUE INDEX worker_spawn_requests_pkey ON public.worker_spawn_requests USING btree (id)
  ```

## RLS Policies

### 1. service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
