# role_seat_checkpoints Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-09-13T06:31:02.341Z
**Rows**: 1,084
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| seat_name | `text` | **NO** | - | Fixed 4-value enum, never derived from claude_sessions liveness -- the same denominator the read-side staleness check uses. |
| session_id | `text` | YES | - | Provenance only, nullable -- reserved for a live claude_sessions.session_id if a future write path resolves one. Always NULL in the current mirror-write (it deliberately has no claude_sessions dependency). Never used in the freshness query. |
| file_suffix | `text` | YES | - | - |
| content | `text` | **NO** | - | - |
| content_hash | `text` | **NO** | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| last_verified_at | `timestamp with time zone` | **NO** | `now()` | Updated on EVERY mirror tick regardless of whether content_hash changed. This is the ONLY column the daily staleness check reads. |

## Constraints

### Primary Key
- `role_seat_checkpoints_pkey`: PRIMARY KEY (id)

### Check Constraints
- `role_seat_checkpoints_seat_name_check`: CHECK ((seat_name = ANY (ARRAY['adam'::text, 'solomon'::text, 'coordinator'::text, 'michael'::text])))

## Indexes

- `role_seat_checkpoints_pkey`
  ```sql
  CREATE UNIQUE INDEX role_seat_checkpoints_pkey ON public.role_seat_checkpoints USING btree (id)
  ```
- `role_seat_checkpoints_seat_name_created_at_idx`
  ```sql
  CREATE INDEX role_seat_checkpoints_seat_name_created_at_idx ON public.role_seat_checkpoints USING btree (seat_name, created_at DESC)
  ```

## RLS Policies

### 1. role_seat_checkpoints_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
