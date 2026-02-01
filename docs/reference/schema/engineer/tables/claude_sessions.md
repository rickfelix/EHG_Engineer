# claude_sessions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-01T00:42:01.916Z
**Rows**: 6,121
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (17 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| session_id | `text` | **NO** | - | - |
| sd_id | `text` | YES | - | - |
| track | `text` | YES | - | - |
| tty | `text` | YES | - | - |
| pid | `integer(32)` | YES | - | - |
| hostname | `text` | YES | - | - |
| codebase | `text` | YES | - | - |
| claimed_at | `timestamp with time zone` | YES | - | - |
| heartbeat_at | `timestamp with time zone` | YES | `now()` | - |
| status | `text` | YES | `'active'::text` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| is_continuous_mode | `boolean` | YES | `false` | - |
| continuous_started_at | `timestamp with time zone` | YES | - | - |
| continuous_sds_completed | `integer(32)` | YES | `0` | - |

## Constraints

### Primary Key
- `claude_sessions_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `claude_sessions_session_id_key`: UNIQUE (session_id)

### Check Constraints
- `claude_sessions_status_check`: CHECK ((status = ANY (ARRAY['active'::text, 'idle'::text, 'stale'::text, 'released'::text])))
- `claude_sessions_track_check`: CHECK ((track = ANY (ARRAY['A'::text, 'B'::text, 'C'::text, 'STANDALONE'::text])))

## Indexes

- `claude_sessions_pkey`
  ```sql
  CREATE UNIQUE INDEX claude_sessions_pkey ON public.claude_sessions USING btree (id)
  ```
- `claude_sessions_session_id_key`
  ```sql
  CREATE UNIQUE INDEX claude_sessions_session_id_key ON public.claude_sessions USING btree (session_id)
  ```
- `idx_claude_sessions_heartbeat`
  ```sql
  CREATE INDEX idx_claude_sessions_heartbeat ON public.claude_sessions USING btree (heartbeat_at DESC)
  ```
- `idx_claude_sessions_sd`
  ```sql
  CREATE INDEX idx_claude_sessions_sd ON public.claude_sessions USING btree (sd_id) WHERE (sd_id IS NOT NULL)
  ```
- `idx_claude_sessions_status`
  ```sql
  CREATE INDEX idx_claude_sessions_status ON public.claude_sessions USING btree (status)
  ```
- `idx_claude_sessions_track`
  ```sql
  CREATE INDEX idx_claude_sessions_track ON public.claude_sessions USING btree (track) WHERE (track IS NOT NULL)
  ```
- `idx_claude_sessions_tty_pid`
  ```sql
  CREATE INDEX idx_claude_sessions_tty_pid ON public.claude_sessions USING btree (tty, pid)
  ```
- `idx_claude_sessions_unique_active_claim`
  ```sql
  CREATE UNIQUE INDEX idx_claude_sessions_unique_active_claim ON public.claude_sessions USING btree (sd_id) WHERE ((sd_id IS NOT NULL) AND (status = 'active'::text))
  ```

## RLS Policies

### 1. Allow all for anon (ALL)

- **Roles**: {anon}
- **Using**: `true`
- **With Check**: `true`

### 2. authenticated_insert_claude_sessions (INSERT)

- **Roles**: {authenticated}
- **With Check**: `true`

### 3. authenticated_select_claude_sessions (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 4. service_role_all_claude_sessions (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### sync_is_working_on_trigger

- **Timing**: AFTER UPDATE
- **Action**: `EXECUTE FUNCTION sync_is_working_on_with_session()`

---

[← Back to Schema Overview](../database-schema-overview.md)
