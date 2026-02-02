# sd_session_activity Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-02T05:32:45.383Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| session_id | `text` | **NO** | - | - |
| sd_id | `text` | **NO** | - | - |
| activity_type | `text` | YES | - | - |
| started_at | `timestamp with time zone` | YES | `now()` | - |
| ended_at | `timestamp with time zone` | YES | - | - |
| duration_minutes | `integer(32)` | YES | - | - |
| commits_made | `integer(32)` | YES | `0` | - |
| files_modified | `integer(32)` | YES | `0` | - |
| notes | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `sd_session_activity_pkey`: PRIMARY KEY (id)

### Check Constraints
- `sd_session_activity_activity_type_check`: CHECK ((activity_type = ANY (ARRAY['started'::text, 'continued'::text, 'completed'::text, 'blocked'::text, 'switched'::text])))

## Indexes

- `idx_session_activity_sd`
  ```sql
  CREATE INDEX idx_session_activity_sd ON public.sd_session_activity USING btree (sd_id)
  ```
- `idx_session_activity_session`
  ```sql
  CREATE INDEX idx_session_activity_session ON public.sd_session_activity USING btree (session_id)
  ```
- `idx_session_activity_started`
  ```sql
  CREATE INDEX idx_session_activity_started ON public.sd_session_activity USING btree (started_at DESC)
  ```
- `sd_session_activity_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_session_activity_pkey ON public.sd_session_activity USING btree (id)
  ```

## RLS Policies

### 1. Allow all for anon (ALL)

- **Roles**: {anon}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
