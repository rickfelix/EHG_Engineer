# context_usage_log Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-02T15:39:22.640Z
**Rows**: 12
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (15 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| session_id | `text` | **NO** | - | - |
| timestamp | `timestamp with time zone` | **NO** | - | - |
| model_id | `text` | YES | - | - |
| context_used | `integer(32)` | **NO** | - | Total tokens in context window (input + cache_creation + cache_read) - the accurate metric |
| context_size | `integer(32)` | YES | `200000` | - |
| usage_percent | `smallint(16)` | **NO** | - | - |
| input_tokens | `integer(32)` | YES | `0` | - |
| output_tokens | `integer(32)` | YES | `0` | - |
| cache_creation_tokens | `integer(32)` | YES | `0` | - |
| cache_read_tokens | `integer(32)` | YES | `0` | - |
| status | `text` | YES | - | - |
| compaction_detected | `boolean` | YES | `false` | TRUE when context dropped from previous measurement, indicating compaction occurred |
| working_directory | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `context_usage_log_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `unique_session_timestamp`: UNIQUE (session_id, "timestamp")

### Check Constraints
- `context_usage_log_status_check`: CHECK ((status = ANY (ARRAY['HEALTHY'::text, 'WARNING'::text, 'CRITICAL'::text, 'EMERGENCY'::text])))

## Indexes

- `context_usage_log_pkey`
  ```sql
  CREATE UNIQUE INDEX context_usage_log_pkey ON public.context_usage_log USING btree (id)
  ```
- `idx_context_usage_compaction`
  ```sql
  CREATE INDEX idx_context_usage_compaction ON public.context_usage_log USING btree (compaction_detected) WHERE (compaction_detected = true)
  ```
- `idx_context_usage_session`
  ```sql
  CREATE INDEX idx_context_usage_session ON public.context_usage_log USING btree (session_id)
  ```
- `idx_context_usage_status`
  ```sql
  CREATE INDEX idx_context_usage_status ON public.context_usage_log USING btree (status) WHERE (status <> 'HEALTHY'::text)
  ```
- `idx_context_usage_timestamp`
  ```sql
  CREATE INDEX idx_context_usage_timestamp ON public.context_usage_log USING btree ("timestamp")
  ```
- `unique_session_timestamp`
  ```sql
  CREATE UNIQUE INDEX unique_session_timestamp ON public.context_usage_log USING btree (session_id, "timestamp")
  ```

## RLS Policies

### 1. Allow select for anon (SELECT)

- **Roles**: {anon}
- **Using**: `true`

### 2. authenticated_insert_context_usage_log (INSERT)

- **Roles**: {authenticated}
- **With Check**: `true`

### 3. authenticated_select_context_usage_log (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
