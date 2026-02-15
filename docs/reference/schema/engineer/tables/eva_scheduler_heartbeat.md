# eva_scheduler_heartbeat Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-15T13:25:26.330Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `integer(32)` | **NO** | `1` | - |
| instance_id | `text` | **NO** | - | - |
| started_at | `timestamp with time zone` | **NO** | `now()` | - |
| last_poll_at | `timestamp with time zone` | YES | - | - |
| next_poll_at | `timestamp with time zone` | YES | - | - |
| poll_count | `integer(32)` | **NO** | `0` | - |
| dispatch_count | `integer(32)` | **NO** | `0` | - |
| error_count | `integer(32)` | **NO** | `0` | - |
| circuit_breaker_state | `text` | YES | `'CLOSED'::text` | - |
| paused_reason | `text` | YES | - | - |
| status | `text` | **NO** | `'running'::text` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `eva_scheduler_heartbeat_pkey`: PRIMARY KEY (id)

### Check Constraints
- `eva_scheduler_heartbeat_id_check`: CHECK ((id = 1))
- `eva_scheduler_heartbeat_status_check`: CHECK ((status = ANY (ARRAY['running'::text, 'stopping'::text, 'stopped'::text])))

## Indexes

- `eva_scheduler_heartbeat_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_scheduler_heartbeat_pkey ON public.eva_scheduler_heartbeat USING btree (id)
  ```

## RLS Policies

### 1. eva_scheduler_heartbeat_authenticated_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. eva_scheduler_heartbeat_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
