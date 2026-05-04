# privacypatrol_scan_runs Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-05-04T13:49:53.536Z
**Rows**: 0
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| user_id | `uuid` | **NO** | - | FK to auth.users (CASCADE on user delete) |
| venture_id | `uuid` | **NO** | - | Soft-FK to ventures (no constraint to preserve audit row after venture deletion) |
| website_url | `text` | **NO** | - | - |
| status | `text` | **NO** | `'pending'::text` | Lifecycle state: pending (B3 inserted) -> running (B4 dispatcher claimed) -> completed | failed |
| requested_at | `timestamp with time zone` | **NO** | `now()` | - |
| completed_at | `timestamp with time zone` | YES | - | - |
| result_summary | `jsonb` | YES | - | - |
| error_message | `text` | YES | - | Bounded to 4000 chars to keep row size predictable |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `privacypatrol_scan_runs_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `privacypatrol_scan_runs_user_id_fkey`: user_id → users(id)

### Check Constraints
- `privacypatrol_scan_runs_error_message_check`: CHECK (((error_message IS NULL) OR (length(error_message) <= 4000)))
- `privacypatrol_scan_runs_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text])))

## Indexes

- `idx_scan_runs_pending`
  ```sql
  CREATE INDEX idx_scan_runs_pending ON public.privacypatrol_scan_runs USING btree (requested_at) WHERE (status = 'pending'::text)
  ```
- `idx_scan_runs_user_requested`
  ```sql
  CREATE INDEX idx_scan_runs_user_requested ON public.privacypatrol_scan_runs USING btree (user_id, requested_at DESC)
  ```
- `privacypatrol_scan_runs_pkey`
  ```sql
  CREATE UNIQUE INDEX privacypatrol_scan_runs_pkey ON public.privacypatrol_scan_runs USING btree (id)
  ```

## RLS Policies

### 1. scan_runs_insert_own (INSERT)

- **Roles**: {public}
- **With Check**: `(auth.uid() = user_id)`

### 2. scan_runs_select_own (SELECT)

- **Roles**: {public}
- **Using**: `(auth.uid() = user_id)`

### 3. scan_runs_update_own (UPDATE)

- **Roles**: {public}
- **Using**: `(auth.uid() = user_id)`
- **With Check**: `(auth.uid() = user_id)`

## Triggers

### privacypatrol_scan_runs_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_privacypatrol_scan_runs_timestamp()`

---

[← Back to Schema Overview](../database-schema-overview.md)
