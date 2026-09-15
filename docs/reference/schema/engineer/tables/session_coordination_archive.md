# session_coordination_archive Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-09-15T16:18:27.599Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (16 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | - | - |
| target_session | `text` | YES | - | - |
| target_sd | `text` | YES | - | - |
| message_type | `text` | YES | - | - |
| subject | `text` | YES | - | - |
| body | `text` | YES | - | - |
| payload | `jsonb` | YES | - | - |
| sender_session | `text` | YES | - | - |
| sender_type | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | - | - |
| expires_at | `timestamp with time zone` | YES | - | - |
| read_at | `timestamp with time zone` | YES | - | - |
| acknowledged_at | `timestamp with time zone` | YES | - | - |
| correlation_id | `text` | YES | - | - |
| delivered_at | `timestamp with time zone` | YES | - | - |
| archived_at | `timestamp with time zone` | **NO** | `now()` | When this row was moved out of the live table -- distinct from created_at (when the row was originally written). |

## Constraints

### Primary Key
- `session_coordination_archive_pkey`: PRIMARY KEY (id)

## Indexes

- `session_coordination_archive_message_type_idx`
  ```sql
  CREATE INDEX session_coordination_archive_message_type_idx ON public.session_coordination_archive USING btree (message_type, created_at DESC)
  ```
- `session_coordination_archive_pkey`
  ```sql
  CREATE UNIQUE INDEX session_coordination_archive_pkey ON public.session_coordination_archive USING btree (id)
  ```
- `session_coordination_archive_target_session_idx`
  ```sql
  CREATE INDEX session_coordination_archive_target_session_idx ON public.session_coordination_archive USING btree (target_session, created_at DESC)
  ```

## RLS Policies

### 1. session_coordination_archive_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
