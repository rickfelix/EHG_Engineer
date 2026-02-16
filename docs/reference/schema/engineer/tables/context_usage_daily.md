# context_usage_daily Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-16T20:17:30.369Z
**Rows**: 0
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (18 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| date | `date` | **NO** | - | - |
| total_sessions | `integer(32)` | YES | `0` | - |
| total_entries | `integer(32)` | YES | `0` | - |
| avg_usage_percent | `numeric(5,2)` | YES | - | - |
| max_usage_percent | `smallint(16)` | YES | - | - |
| min_usage_percent | `smallint(16)` | YES | - | - |
| total_input_tokens | `bigint(64)` | YES | `0` | - |
| total_output_tokens | `bigint(64)` | YES | `0` | - |
| total_cache_read_tokens | `bigint(64)` | YES | `0` | - |
| total_cache_creation_tokens | `bigint(64)` | YES | `0` | - |
| compaction_count | `integer(32)` | YES | `0` | - |
| warning_count | `integer(32)` | YES | `0` | - |
| critical_count | `integer(32)` | YES | `0` | - |
| emergency_count | `integer(32)` | YES | `0` | - |
| cache_hit_ratio | `numeric(5,2)` | YES | - | - |
| avg_session_duration_minutes | `integer(32)` | YES | - | - |
| aggregated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `context_usage_daily_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `context_usage_daily_date_key`: UNIQUE (date)

## Indexes

- `context_usage_daily_date_key`
  ```sql
  CREATE UNIQUE INDEX context_usage_daily_date_key ON public.context_usage_daily USING btree (date)
  ```
- `context_usage_daily_pkey`
  ```sql
  CREATE UNIQUE INDEX context_usage_daily_pkey ON public.context_usage_daily USING btree (id)
  ```

## RLS Policies

### 1. Allow select for anon (SELECT)

- **Roles**: {anon}
- **Using**: `true`

### 2. authenticated_insert_context_usage_daily (INSERT)

- **Roles**: {authenticated}
- **With Check**: `true`

### 3. authenticated_select_context_usage_daily (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
