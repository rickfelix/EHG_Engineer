# session_lifecycle_events Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-09T14:43:56.070Z
**Rows**: 1,367
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| event_type | `text` | **NO** | - | - |
| session_id | `text` | **NO** | - | - |
| machine_id | `text` | YES | - | - |
| terminal_id | `text` | YES | - | - |
| pid | `integer(32)` | YES | - | - |
| reason | `text` | YES | - | - |
| latency_ms | `integer(32)` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `session_lifecycle_events_pkey`: PRIMARY KEY (id)

## Indexes

- `idx_session_lifecycle_events_session`
  ```sql
  CREATE INDEX idx_session_lifecycle_events_session ON public.session_lifecycle_events USING btree (session_id, created_at DESC)
  ```
- `idx_session_lifecycle_events_type_time`
  ```sql
  CREATE INDEX idx_session_lifecycle_events_type_time ON public.session_lifecycle_events USING btree (event_type, created_at DESC)
  ```
- `session_lifecycle_events_pkey`
  ```sql
  CREATE UNIQUE INDEX session_lifecycle_events_pkey ON public.session_lifecycle_events USING btree (id)
  ```

## RLS Policies

### 1. session_lifecycle_events_authenticated_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. session_lifecycle_events_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
