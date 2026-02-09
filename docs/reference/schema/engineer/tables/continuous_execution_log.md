# continuous_execution_log Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-09T02:29:22.689Z
**Rows**: 0
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| session_id | `text` | **NO** | - | - |
| parent_sd_id | `text` | YES | - | - |
| child_sd_id | `text` | YES | - | - |
| phase | `text` | **NO** | - | - |
| status | `text` | **NO** | - | - |
| error_message | `text` | YES | - | - |
| retry_attempted | `boolean` | YES | `false` | - |
| retry_succeeded | `boolean` | YES | - | - |
| duration_seconds | `integer(32)` | YES | - | - |
| explorer_agents_used | `integer(32)` | YES | `0` | - |
| root_cause_identified | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `continuous_execution_log_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `continuous_execution_log_child_sd_id_fkey`: child_sd_id → strategic_directives_v2(id)
- `continuous_execution_log_parent_sd_id_fkey`: parent_sd_id → strategic_directives_v2(id)

### Check Constraints
- `continuous_execution_log_phase_check`: CHECK ((phase = ANY (ARRAY['LEAD'::text, 'PLAN'::text, 'EXEC'::text, 'COMPLETE'::text])))
- `continuous_execution_log_status_check`: CHECK ((status = ANY (ARRAY['started'::text, 'completed'::text, 'failed'::text, 'skipped'::text, 'retrying'::text])))

## Indexes

- `continuous_execution_log_pkey`
  ```sql
  CREATE UNIQUE INDEX continuous_execution_log_pkey ON public.continuous_execution_log USING btree (id)
  ```
- `idx_continuous_execution_created`
  ```sql
  CREATE INDEX idx_continuous_execution_created ON public.continuous_execution_log USING btree (created_at DESC)
  ```
- `idx_continuous_execution_parent`
  ```sql
  CREATE INDEX idx_continuous_execution_parent ON public.continuous_execution_log USING btree (parent_sd_id)
  ```
- `idx_continuous_execution_session`
  ```sql
  CREATE INDEX idx_continuous_execution_session ON public.continuous_execution_log USING btree (session_id)
  ```
- `idx_continuous_execution_status`
  ```sql
  CREATE INDEX idx_continuous_execution_status ON public.continuous_execution_log USING btree (status)
  ```

## RLS Policies

### 1. Allow select for anon (SELECT)

- **Roles**: {anon}
- **Using**: `true`

### 2. authenticated_insert_continuous_execution_log (INSERT)

- **Roles**: {authenticated}
- **With Check**: `true`

### 3. authenticated_select_continuous_execution_log (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
