# plan_sub_agent_executions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-01T13:43:51.883Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| validation_id | `uuid` | **NO** | - | - |
| sd_id | `text` | **NO** | - | - |
| sub_agent_type | `text` | **NO** | - | - |
| execution_status | `text` | **NO** | - | - |
| severity | `text` | **NO** | - | - |
| summary | `text` | **NO** | - | - |
| details | `jsonb` | YES | `'{}'::jsonb` | - |
| recommendations | `ARRAY` | YES | - | - |
| execution_time_ms | `integer(32)` | YES | `0` | - |
| executed_at | `timestamp with time zone` | YES | `now()` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `plan_sub_agent_executions_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `plan_sub_agent_executions_sd_id_fkey`: sd_id → strategic_directives_v2(id)
- `plan_sub_agent_executions_validation_id_fkey`: validation_id → plan_technical_validations(id)

### Check Constraints
- `plan_sub_agent_executions_execution_status_check`: CHECK ((execution_status = ANY (ARRAY['PASS'::text, 'FAIL'::text, 'WARNING'::text, 'REVIEW_REQUIRED'::text, 'ERROR'::text])))
- `plan_sub_agent_executions_severity_check`: CHECK ((severity = ANY (ARRAY['CRITICAL'::text, 'HIGH'::text, 'MEDIUM'::text, 'LOW'::text])))
- `plan_sub_agent_executions_sub_agent_type_check`: CHECK ((sub_agent_type = ANY (ARRAY['SECURITY'::text, 'DATABASE'::text, 'VALIDATION'::text, 'TESTING'::text, 'PERFORMANCE'::text, 'DESIGN'::text, 'DEBUGGING'::text])))

## Indexes

- `idx_plan_subagent_executions_severity`
  ```sql
  CREATE INDEX idx_plan_subagent_executions_severity ON public.plan_sub_agent_executions USING btree (severity)
  ```
- `idx_plan_subagent_executions_type`
  ```sql
  CREATE INDEX idx_plan_subagent_executions_type ON public.plan_sub_agent_executions USING btree (sub_agent_type)
  ```
- `idx_plan_subagent_executions_validation_id`
  ```sql
  CREATE INDEX idx_plan_subagent_executions_validation_id ON public.plan_sub_agent_executions USING btree (validation_id)
  ```
- `plan_sub_agent_executions_pkey`
  ```sql
  CREATE UNIQUE INDEX plan_sub_agent_executions_pkey ON public.plan_sub_agent_executions USING btree (id)
  ```

## RLS Policies

### 1. plan_subagent_executions_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`

### 2. plan_subagent_executions_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
