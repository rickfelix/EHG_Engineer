# model_usage_log Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-18T15:21:29.186Z
**Rows**: 1,250
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| session_id | `text` | YES | - | - |
| sd_id | `text` | YES | - | - |
| phase | `text` | YES | - | - |
| subagent_type | `text` | YES | - | - |
| subagent_configured_model | `text` | YES | - | - |
| reported_model_name | `text` | **NO** | - | - |
| reported_model_id | `text` | **NO** | - | - |
| config_matches_reported | `boolean` | YES | - | - |
| captured_at | `timestamp with time zone` | YES | `now()` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| provider_source | `character varying(20)` | YES | - | - |

## Constraints

### Primary Key
- `model_usage_log_pkey`: PRIMARY KEY (id)

### Check Constraints
- `model_usage_log_phase_check`: CHECK ((phase = ANY (ARRAY['LEAD'::text, 'PLAN'::text, 'EXEC'::text, 'UNKNOWN'::text])))
- `model_usage_log_provider_source_check`: CHECK (((provider_source)::text = ANY ((ARRAY['local'::character varying, 'cloud'::character varying, 'fallback'::character varying])::text[])))

## Indexes

- `idx_model_usage_sd`
  ```sql
  CREATE INDEX idx_model_usage_sd ON public.model_usage_log USING btree (sd_id)
  ```
- `idx_model_usage_subagent`
  ```sql
  CREATE INDEX idx_model_usage_subagent ON public.model_usage_log USING btree (subagent_type)
  ```
- `idx_model_usage_time`
  ```sql
  CREATE INDEX idx_model_usage_time ON public.model_usage_log USING btree (captured_at DESC)
  ```
- `model_usage_log_pkey`
  ```sql
  CREATE UNIQUE INDEX model_usage_log_pkey ON public.model_usage_log USING btree (id)
  ```

## RLS Policies

### 1. Allow all for anon (ALL)

- **Roles**: {anon}
- **Using**: `true`
- **With Check**: `true`

### 2. authenticated_insert_model_usage_log (INSERT)

- **Roles**: {authenticated}
- **With Check**: `true`

### 3. authenticated_select_model_usage_log (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
