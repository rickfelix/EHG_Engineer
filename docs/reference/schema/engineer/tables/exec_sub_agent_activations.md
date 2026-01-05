# exec_sub_agent_activations Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-05T11:19:21.578Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| session_id | `uuid` | **NO** | - | - |
| sd_id | `text` | **NO** | - | - |
| sub_agent_type | `text` | **NO** | - | - |
| activation_reason | `text` | **NO** | - | - |
| execution_status | `text` | **NO** | - | - |
| severity | `text` | **NO** | - | - |
| summary | `text` | **NO** | - | - |
| details | `jsonb` | YES | `'{}'::jsonb` | - |
| recommendations | `ARRAY` | YES | - | - |
| quality_score | `integer(32)` | YES | `0` | - |
| execution_time_ms | `integer(32)` | YES | `0` | - |
| activated_at | `timestamp with time zone` | YES | `now()` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `exec_sub_agent_activations_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `exec_sub_agent_activations_sd_id_fkey`: sd_id → strategic_directives_v2(id)
- `exec_sub_agent_activations_session_id_fkey`: session_id → exec_implementation_sessions(id)

### Check Constraints
- `exec_sub_agent_activations_execution_status_check`: CHECK ((execution_status = ANY (ARRAY['PASS'::text, 'FAIL'::text, 'WARNING'::text, 'REVIEW_REQUIRED'::text, 'ERROR'::text])))
- `exec_sub_agent_activations_quality_score_check`: CHECK (((quality_score >= 0) AND (quality_score <= 100)))
- `exec_sub_agent_activations_severity_check`: CHECK ((severity = ANY (ARRAY['CRITICAL'::text, 'HIGH'::text, 'MEDIUM'::text, 'LOW'::text])))
- `exec_sub_agent_activations_sub_agent_type_check`: CHECK ((sub_agent_type = ANY (ARRAY['SECURITY'::text, 'DATABASE'::text, 'VALIDATION'::text, 'TESTING'::text, 'PERFORMANCE'::text, 'DESIGN'::text, 'DEBUGGING'::text])))

## Indexes

- `exec_sub_agent_activations_pkey`
  ```sql
  CREATE UNIQUE INDEX exec_sub_agent_activations_pkey ON public.exec_sub_agent_activations USING btree (id)
  ```
- `idx_exec_subagent_activations_session_id`
  ```sql
  CREATE INDEX idx_exec_subagent_activations_session_id ON public.exec_sub_agent_activations USING btree (session_id)
  ```
- `idx_exec_subagent_activations_severity`
  ```sql
  CREATE INDEX idx_exec_subagent_activations_severity ON public.exec_sub_agent_activations USING btree (severity)
  ```
- `idx_exec_subagent_activations_type`
  ```sql
  CREATE INDEX idx_exec_subagent_activations_type ON public.exec_sub_agent_activations USING btree (sub_agent_type)
  ```

## RLS Policies

### 1. exec_subagent_activations_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`

### 2. exec_subagent_activations_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
