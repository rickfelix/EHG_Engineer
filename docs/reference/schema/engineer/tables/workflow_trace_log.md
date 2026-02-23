# workflow_trace_log Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-23T22:18:41.779Z
**Rows**: 85,271
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (17 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| trace_id | `uuid` | **NO** | - | - |
| span_id | `uuid` | **NO** | - | - |
| parent_span_id | `uuid` | YES | - | - |
| workflow_execution_id | `text` | **NO** | - | - |
| sd_id | `text` | YES | - | - |
| phase | `text` | YES | - | - |
| gate_name | `text` | YES | - | - |
| subagent_name | `text` | YES | - | - |
| span_name | `text` | **NO** | - | - |
| span_type | `text` | **NO** | - | - |
| start_time_ms | `bigint(64)` | **NO** | - | - |
| end_time_ms | `bigint(64)` | YES | - | - |
| duration_ms | `bigint(64)` | YES | - | - |
| queue_wait_ms | `bigint(64)` | YES | - | - |
| attributes | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `workflow_trace_log_pkey`: PRIMARY KEY (id)

## Indexes

- `idx_workflow_trace_log_created_at`
  ```sql
  CREATE INDEX idx_workflow_trace_log_created_at ON public.workflow_trace_log USING btree (created_at DESC)
  ```
- `idx_workflow_trace_log_execution_time`
  ```sql
  CREATE INDEX idx_workflow_trace_log_execution_time ON public.workflow_trace_log USING btree (workflow_execution_id, start_time_ms DESC)
  ```
- `idx_workflow_trace_log_span_type_name`
  ```sql
  CREATE INDEX idx_workflow_trace_log_span_type_name ON public.workflow_trace_log USING btree (span_type, span_name)
  ```
- `idx_workflow_trace_log_trace_id`
  ```sql
  CREATE INDEX idx_workflow_trace_log_trace_id ON public.workflow_trace_log USING btree (trace_id)
  ```
- `workflow_trace_log_pkey`
  ```sql
  CREATE UNIQUE INDEX workflow_trace_log_pkey ON public.workflow_trace_log USING btree (id)
  ```

## RLS Policies

### 1. service_role_all_workflow_trace_log (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
