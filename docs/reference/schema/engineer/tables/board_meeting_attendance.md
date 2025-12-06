# board_meeting_attendance Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2025-12-04T23:01:42.129Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| meeting_id | `uuid` | YES | - | - |
| board_member_id | `uuid` | YES | - | - |
| attended | `boolean` | YES | `false` | - |
| vote | `character varying(20)` | YES | - | - |
| notes | `text` | YES | - | - |
| voting_weight_used | `numeric(3,2)` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `board_meeting_attendance_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `board_meeting_attendance_board_member_id_fkey`: board_member_id → board_members(id)
- `board_meeting_attendance_meeting_id_fkey`: meeting_id → board_meetings(id)

### Check Constraints
- `board_meeting_attendance_vote_check`: CHECK (((vote)::text = ANY ((ARRAY['approve'::character varying, 'reject'::character varying, 'abstain'::character varying, NULL::character varying])::text[])))

## Indexes

- `board_meeting_attendance_pkey`
  ```sql
  CREATE UNIQUE INDEX board_meeting_attendance_pkey ON public.board_meeting_attendance USING btree (id)
  ```
- `idx_attendance_meeting_id`
  ```sql
  CREATE INDEX idx_attendance_meeting_id ON public.board_meeting_attendance USING btree (meeting_id)
  ```
- `idx_attendance_member_id`
  ```sql
  CREATE INDEX idx_attendance_member_id ON public.board_meeting_attendance USING btree (board_member_id)
  ```

## RLS Policies

### 1. attendance_read_policy (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 2. attendance_write_policy (ALL)

- **Roles**: {public}
- **Using**: `(CURRENT_USER = 'service_role'::name)`

---

[← Back to Schema Overview](../database-schema-overview.md)
