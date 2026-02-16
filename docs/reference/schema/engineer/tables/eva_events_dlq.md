# eva_events_dlq Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-15T16:12:10.483Z
**Rows**: 1
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| event_id | `uuid` | YES | - | - |
| event_type | `text` | **NO** | - | - |
| payload | `jsonb` | **NO** | `'{}'::jsonb` | - |
| error_message | `text` | **NO** | - | - |
| error_stack | `text` | YES | - | - |
| attempt_count | `integer(32)` | **NO** | `1` | - |
| failure_reason | `text` | **NO** | - | - |
| first_seen_at | `timestamp with time zone` | **NO** | `now()` | - |
| last_attempt_at | `timestamp with time zone` | **NO** | `now()` | - |
| status | `text` | **NO** | `'dead'::text` | - |
| replayed_at | `timestamp with time zone` | YES | - | - |
| replayed_by | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `eva_events_dlq_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `eva_events_dlq_event_id_fkey`: event_id → eva_events(id)

### Check Constraints
- `eva_events_dlq_failure_reason_check`: CHECK ((failure_reason = ANY (ARRAY['validation_error'::text, 'max_retries_exhausted'::text, 'not_found'::text, 'handler_error'::text, 'unknown'::text])))
- `eva_events_dlq_status_check`: CHECK ((status = ANY (ARRAY['dead'::text, 'replayed'::text, 'discarded'::text])))

## Indexes

- `eva_events_dlq_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_events_dlq_pkey ON public.eva_events_dlq USING btree (id)
  ```
- `idx_eva_events_dlq_event_id`
  ```sql
  CREATE INDEX idx_eva_events_dlq_event_id ON public.eva_events_dlq USING btree (event_id)
  ```
- `idx_eva_events_dlq_event_type`
  ```sql
  CREATE INDEX idx_eva_events_dlq_event_type ON public.eva_events_dlq USING btree (event_type)
  ```
- `idx_eva_events_dlq_status`
  ```sql
  CREATE INDEX idx_eva_events_dlq_status ON public.eva_events_dlq USING btree (status)
  ```

## RLS Policies

### 1. eva_events_dlq_authenticated_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. eva_events_dlq_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
