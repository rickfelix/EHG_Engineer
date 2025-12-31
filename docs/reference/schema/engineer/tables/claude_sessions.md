# claude_sessions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2025-12-31T13:16:07.412Z
**Rows**: 2,215
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (14 total)

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

## RLS Policies

### 1. Allow all for anon (ALL)

- **Roles**: {anon}
- **Using**: `true`
- **With Check**: `true`

### 2. Allow all for authenticated (ALL)

- **Roles**: {authenticated}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
