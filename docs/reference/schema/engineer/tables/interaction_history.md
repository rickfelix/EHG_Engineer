# interaction_history Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-11T00:33:39.932Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (29 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| user_id | `character varying(100)` | YES | - | - |
| session_id | `character varying(100)` | YES | - | - |
| interaction_timestamp | `timestamp with time zone` | **NO** | `now()` | - |
| prompt_text | `text` | YES | - | - |
| prompt_hash | `character varying(64)` | **NO** | - | - |
| prompt_length | `integer(32)` | **NO** | `0` | - |
| prompt_complexity | `numeric(3,2)` | **NO** | `0.0` | - |
| file_context | `jsonb` | YES | - | - |
| git_context | `jsonb` | YES | - | - |
| error_context | `jsonb` | YES | - | - |
| project_context | `jsonb` | YES | - | - |
| analysis_method | `character varying(50)` | **NO** | - | - |
| selected_agents | `jsonb` | **NO** | `'[]'::jsonb` | - |
| total_agents_considered | `integer(32)` | **NO** | `0` | - |
| selection_confidence | `numeric(3,2)` | YES | - | - |
| selection_reasoning | `text` | YES | - | - |
| agents_executed | `integer(32)` | **NO** | `0` | - |
| execution_time_ms | `integer(32)` | YES | - | - |
| success_count | `integer(32)` | **NO** | `0` | - |
| error_count | `integer(32)` | **NO** | `0` | - |
| enhancement_applied | `boolean` | **NO** | `false` | - |
| enhancement_style | `character varying(50)` | YES | - | - |
| enhancement_length | `integer(32)` | YES | - | - |
| pattern_matched | `character varying(64)` | YES | - | - |
| threshold_adjustments | `jsonb` | YES | - | - |
| new_pattern_created | `boolean` | **NO** | `false` | - |
| total_processing_time | `integer(32)` | YES | - | - |
| cache_hit | `boolean` | **NO** | `false` | - |

## Constraints

### Primary Key
- `interaction_history_pkey`: PRIMARY KEY (id)

## Indexes

- `idx_interaction_success_patterns`
  ```sql
  CREATE INDEX idx_interaction_success_patterns ON public.interaction_history USING btree (success_count, pattern_matched, interaction_timestamp)
  ```
- `idx_interaction_timestamp`
  ```sql
  CREATE INDEX idx_interaction_timestamp ON public.interaction_history USING btree (interaction_timestamp DESC)
  ```
- `idx_pattern_interactions`
  ```sql
  CREATE INDEX idx_pattern_interactions ON public.interaction_history USING btree (pattern_matched, interaction_timestamp DESC)
  ```
- `idx_success_analysis`
  ```sql
  CREATE INDEX idx_success_analysis ON public.interaction_history USING btree (success_count, analysis_method, interaction_timestamp DESC)
  ```
- `idx_user_interactions`
  ```sql
  CREATE INDEX idx_user_interactions ON public.interaction_history USING btree (user_id, interaction_timestamp DESC)
  ```
- `interaction_history_pkey`
  ```sql
  CREATE UNIQUE INDEX interaction_history_pkey ON public.interaction_history USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_interaction_history (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_interaction_history (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
