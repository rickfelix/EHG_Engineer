# board_meetings Table

**Generated**: 2025-10-28T12:15:30.153Z
**Database**: EHG_Engineer (dedlbzhpgkmetvhbkyzq)
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

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

### 1. board_meetings_read_policy (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 2. board_meetings_write_policy (ALL)

- **Roles**: {public}
- **Using**: `(CURRENT_USER = 'service_role'::name)`

---

[← Back to Schema Overview](../database-schema-overview.md)
