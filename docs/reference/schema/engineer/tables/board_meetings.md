# board_meetings Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-23T15:34:01.578Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| meeting_key | `character varying(50)` | **NO** | - | - |
| meeting_type | `character varying(50)` | **NO** | - | - |
| agenda | `text` | YES | - | - |
| scheduled_at | `timestamp with time zone` | YES | - | - |
| completed_at | `timestamp with time zone` | YES | - | - |
| outcome | `jsonb` | YES | - | - |
| status | `character varying(20)` | YES | `'scheduled'::character varying` | - |
| workflow_id | `uuid` | YES | - | - |
| metadata | `jsonb` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `board_meetings_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `board_meetings_meeting_key_key`: UNIQUE (meeting_key)

### Check Constraints
- `board_meetings_status_check`: CHECK (((status)::text = ANY ((ARRAY['scheduled'::character varying, 'in_progress'::character varying, 'completed'::character varying, 'cancelled'::character varying])::text[])))

## Indexes

- `board_meetings_meeting_key_key`
  ```sql
  CREATE UNIQUE INDEX board_meetings_meeting_key_key ON public.board_meetings USING btree (meeting_key)
  ```
- `board_meetings_pkey`
  ```sql
  CREATE UNIQUE INDEX board_meetings_pkey ON public.board_meetings USING btree (id)
  ```
- `idx_board_meetings_meeting_type`
  ```sql
  CREATE INDEX idx_board_meetings_meeting_type ON public.board_meetings USING btree (meeting_type)
  ```
- `idx_board_meetings_scheduled_at`
  ```sql
  CREATE INDEX idx_board_meetings_scheduled_at ON public.board_meetings USING btree (scheduled_at DESC)
  ```
- `idx_board_meetings_status`
  ```sql
  CREATE INDEX idx_board_meetings_status ON public.board_meetings USING btree (status)
  ```

## RLS Policies

### 1. board_meetings_service_role_access (ALL)

- **Roles**: {authenticated}
- **Using**: `fn_is_service_role()`
- **With Check**: `fn_is_service_role()`

---

[← Back to Schema Overview](../database-schema-overview.md)
