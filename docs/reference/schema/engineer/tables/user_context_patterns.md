# user_context_patterns Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-10T01:18:40.647Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (21 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| pattern_hash | `character varying(64)` | **NO** | - | - |
| user_id | `character varying(100)` | YES | - | - |
| prompt_keywords | `jsonb` | **NO** | `'[]'::jsonb` | - |
| file_patterns | `jsonb` | **NO** | `'[]'::jsonb` | - |
| git_patterns | `jsonb` | **NO** | `'[]'::jsonb` | - |
| project_patterns | `jsonb` | **NO** | `'[]'::jsonb` | - |
| selected_agents | `jsonb` | **NO** | `'[]'::jsonb` | - |
| coordination_strategy | `character varying(50)` | YES | - | - |
| frequency_count | `integer(32)` | **NO** | `1` | - |
| success_rate | `numeric(3,2)` | **NO** | `1.0` | - |
| avg_confidence | `numeric(3,2)` | **NO** | `0.0` | - |
| avg_execution_time | `integer(32)` | **NO** | `0` | - |
| user_feedback_score | `integer(32)` | YES | - | - |
| implicit_satisfaction | `numeric(3,2)` | YES | - | - |
| rejection_count | `integer(32)` | **NO** | `0` | - |
| first_seen | `timestamp with time zone` | **NO** | `now()` | - |
| last_seen | `timestamp with time zone` | **NO** | `now()` | - |
| last_successful | `timestamp with time zone` | YES | - | - |
| confidence_threshold | `numeric(3,2)` | YES | - | - |
| priority_weights | `jsonb` | YES | - | - |

## Constraints

### Primary Key
- `user_context_patterns_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `user_context_patterns_pattern_hash_key`: UNIQUE (pattern_hash)

## Indexes

- `idx_pattern_frequency`
  ```sql
  CREATE INDEX idx_pattern_frequency ON public.user_context_patterns USING btree (frequency_count DESC, success_rate DESC)
  ```
- `idx_pattern_hash`
  ```sql
  CREATE INDEX idx_pattern_hash ON public.user_context_patterns USING btree (pattern_hash)
  ```
- `idx_pattern_last_seen`
  ```sql
  CREATE INDEX idx_pattern_last_seen ON public.user_context_patterns USING btree (last_seen DESC)
  ```
- `idx_pattern_success_rate`
  ```sql
  CREATE INDEX idx_pattern_success_rate ON public.user_context_patterns USING btree (success_rate DESC, frequency_count DESC)
  ```
- `idx_user_patterns`
  ```sql
  CREATE INDEX idx_user_patterns ON public.user_context_patterns USING btree (user_id, success_rate DESC)
  ```
- `user_context_patterns_pattern_hash_key`
  ```sql
  CREATE UNIQUE INDEX user_context_patterns_pattern_hash_key ON public.user_context_patterns USING btree (pattern_hash)
  ```
- `user_context_patterns_pkey`
  ```sql
  CREATE UNIQUE INDEX user_context_patterns_pkey ON public.user_context_patterns USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_user_context_patterns (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_user_context_patterns (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
