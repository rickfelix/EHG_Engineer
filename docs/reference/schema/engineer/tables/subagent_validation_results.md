# subagent_validation_results Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-11T17:09:45.342Z
**Rows**: 6,520
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (19 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| execution_id | `uuid` | YES | - | - |
| sd_id | `text` | **NO** | - | - |
| sub_agent_code | `text` | **NO** | - | - |
| validation_passed | `boolean` | **NO** | - | - |
| validation_score | `integer(32)` | YES | - | - |
| levels_checked | `ARRAY` | YES | - | - |
| file_references | `jsonb` | YES | `'{}'::jsonb` | - |
| symbol_references | `jsonb` | YES | `'{}'::jsonb` | - |
| table_references | `jsonb` | YES | `'{}'::jsonb` | - |
| code_snippets | `jsonb` | YES | `'{}'::jsonb` | - |
| issues | `jsonb` | YES | `'[]'::jsonb` | - |
| warnings | `jsonb` | YES | `'[]'::jsonb` | - |
| retry_count | `integer(32)` | YES | `0` | - |
| retry_reason | `text` | YES | - | - |
| previous_validation_id | `uuid` | YES | - | - |
| validation_duration_ms | `integer(32)` | YES | - | - |
| tables_loaded_count | `integer(32)` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `subagent_validation_results_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `subagent_validation_results_execution_id_fkey`: execution_id → sub_agent_execution_results(id)

### Check Constraints
- `subagent_validation_results_validation_score_check`: CHECK (((validation_score >= 0) AND (validation_score <= 100)))

## Indexes

- `idx_validation_created_at`
  ```sql
  CREATE INDEX idx_validation_created_at ON public.subagent_validation_results USING btree (created_at DESC)
  ```
- `idx_validation_execution_id`
  ```sql
  CREATE INDEX idx_validation_execution_id ON public.subagent_validation_results USING btree (execution_id)
  ```
- `idx_validation_passed`
  ```sql
  CREATE INDEX idx_validation_passed ON public.subagent_validation_results USING btree (validation_passed)
  ```
- `idx_validation_sd_id`
  ```sql
  CREATE INDEX idx_validation_sd_id ON public.subagent_validation_results USING btree (sd_id)
  ```
- `idx_validation_sub_agent_code`
  ```sql
  CREATE INDEX idx_validation_sub_agent_code ON public.subagent_validation_results USING btree (sub_agent_code)
  ```
- `subagent_validation_results_pkey`
  ```sql
  CREATE UNIQUE INDEX subagent_validation_results_pkey ON public.subagent_validation_results USING btree (id)
  ```

## RLS Policies

### 1. subagent_validation_anon_read (SELECT)

- **Roles**: {anon}
- **Using**: `true`

### 2. subagent_validation_authenticated_read (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 3. subagent_validation_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
