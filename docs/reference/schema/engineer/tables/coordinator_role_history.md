# coordinator_role_history Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-08-01T20:27:50.592Z
**Rows**: 5
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| session_id | `text` | **NO** | - | - |
| started_at | `timestamp with time zone` | **NO** | `now()` | - |
| ended_at | `timestamp with time zone` | YES | - | - |
| end_cause | `text` | YES | - | - |
| ended_by_session | `text` | YES | - | - |
| notes | `text` | YES | - | - |

## Constraints

### Primary Key
- `coordinator_role_history_pkey`: PRIMARY KEY (id)

### Check Constraints
- `coordinator_role_history_closed_consistency`: CHECK (((ended_at IS NULL) = (end_cause IS NULL)))
- `coordinator_role_history_end_cause_check`: CHECK (((end_cause IS NULL) OR (end_cause = ANY (ARRAY['graceful'::text, 'stale_cleanup'::text, 'takeover'::text]))))

## Indexes

- `coordinator_role_history_pkey`
  ```sql
  CREATE UNIQUE INDEX coordinator_role_history_pkey ON public.coordinator_role_history USING btree (id)
  ```
- `idx_coord_role_history_open`
  ```sql
  CREATE INDEX idx_coord_role_history_open ON public.coordinator_role_history USING btree (started_at) WHERE (ended_at IS NULL)
  ```
- `idx_coord_role_history_session_ended`
  ```sql
  CREATE INDEX idx_coord_role_history_session_ended ON public.coordinator_role_history USING btree (session_id, ended_at)
  ```

## RLS Policies

### 1. coordinator_role_history_service_write (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
