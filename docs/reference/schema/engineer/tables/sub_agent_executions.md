# sub_agent_executions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-07T11:05:08.363Z
**Rows**: 99
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (19 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| prd_id | `text` | **NO** | - | - |
| sub_agent_id | `character varying(50)` | **NO** | - | - |
| status | `text` | **NO** | - | - |
| results | `jsonb` | YES | `'{}'::jsonb` | - |
| started_at | `timestamp with time zone` | YES | `now()` | - |
| completed_at | `timestamp with time zone` | YES | - | - |
| error_message | `text` | YES | - | - |
| execution_time_ms | `integer(32)` | YES | - | - |
| context_id | `text` | YES | - | - |
| context_type | `text` | YES | `'prd'::text` | - |
| sub_agent_code | `text` | YES | - | - |
| execution_trigger | `text` | YES | - | - |
| validation_result | `text` | YES | - | - |
| confidence_score | `integer(32)` | YES | - | - |
| findings | `jsonb` | YES | `'[]'::jsonb` | - |
| recommendations | `jsonb` | YES | `'[]'::jsonb` | - |
| issues_found | `jsonb` | YES | `'[]'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `sub_agent_executions_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `sub_agent_executions_sub_agent_id_fkey`: sub_agent_id → leo_sub_agents(id)

### Check Constraints
- `sub_agent_executions_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'pass'::text, 'fail'::text, 'error'::text, 'timeout'::text])))

## Indexes

- `idx_sub_agent_executions_code`
  ```sql
  CREATE INDEX idx_sub_agent_executions_code ON public.sub_agent_executions USING btree (sub_agent_code)
  ```
- `idx_sub_agent_executions_context_new`
  ```sql
  CREATE INDEX idx_sub_agent_executions_context_new ON public.sub_agent_executions USING btree (context_id, context_type)
  ```
- `idx_sub_agent_executions_sub_agent_id`
  ```sql
  CREATE INDEX idx_sub_agent_executions_sub_agent_id ON public.sub_agent_executions USING btree (sub_agent_id)
  ```
- `sub_agent_executions_pkey`
  ```sql
  CREATE UNIQUE INDEX sub_agent_executions_pkey ON public.sub_agent_executions USING btree (id)
  ```
- `ux_subagent_prd`
  ```sql
  CREATE UNIQUE INDEX ux_subagent_prd ON public.sub_agent_executions USING btree (prd_id, sub_agent_id)
  ```

## RLS Policies

### 1. authenticated_read_sub_agent_executions (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_sub_agent_executions (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### enforce_gates_before_exec

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION check_gates_before_exec()`

### enforce_gates_before_exec

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION check_gates_before_exec()`

---

[← Back to Schema Overview](../database-schema-overview.md)
