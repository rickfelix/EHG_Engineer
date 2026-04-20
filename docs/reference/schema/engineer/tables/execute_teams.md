# execute_teams Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-20T18:55:57.300Z
**Rows**: 5
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (16 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| team_id | `uuid` | **NO** | `gen_random_uuid()` | - |
| spawned_by_session | `text` | YES | - | - |
| supervisor_pid | `integer(32)` | **NO** | - | - |
| supervisor_hostname | `text` | **NO** | `''::text` | - |
| worker_count | `integer(32)` | **NO** | - | - |
| worker_session_ids | `ARRAY` | **NO** | `'{}'::text[]` | Array of claude_sessions(session_id) text identifiers for each worker slot. Indexed by slot position. |
| status | `text` | **NO** | - | - |
| started_at | `timestamp with time zone` | **NO** | `now()` | - |
| stopped_at | `timestamp with time zone` | YES | - | - |
| stop_reason | `text` | YES | - | - |
| sds_completed | `integer(32)` | **NO** | `0` | - |
| sds_failed | `integer(32)` | **NO** | `0` | - |
| track_filter | `text` | YES | - | - |
| metadata | `jsonb` | **NO** | `'{}'::jsonb` | JSONB containing: slots[] (slot identity persistence), preflight (health check results), circuit_breaker (rolling failure window). |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `execute_teams_pkey`: PRIMARY KEY (team_id)

### Foreign Keys
- `execute_teams_spawned_by_session_fkey`: spawned_by_session → claude_sessions(session_id)

### Check Constraints
- `execute_teams_status_check`: CHECK ((status = ANY (ARRAY['pending_spawn'::text, 'active'::text, 'stopping'::text, 'stopped'::text, 'crashed'::text, 'completed'::text])))
- `execute_teams_track_filter_check`: CHECK ((track_filter = ANY (ARRAY['A'::text, 'B'::text, 'C'::text, 'STANDALONE'::text])))
- `execute_teams_worker_count_check`: CHECK (((worker_count >= 1) AND (worker_count <= 8)))

## Indexes

- `execute_teams_pkey`
  ```sql
  CREATE UNIQUE INDEX execute_teams_pkey ON public.execute_teams USING btree (team_id)
  ```
- `idx_execute_teams_active`
  ```sql
  CREATE INDEX idx_execute_teams_active ON public.execute_teams USING btree (status) WHERE (status = ANY (ARRAY['active'::text, 'stopping'::text]))
  ```
- `idx_execute_teams_started`
  ```sql
  CREATE INDEX idx_execute_teams_started ON public.execute_teams USING btree (started_at DESC)
  ```

## RLS Policies

### 1. execute_teams_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. execute_teams_service_writes (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_execute_teams_touch_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION execute_teams_touch_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
