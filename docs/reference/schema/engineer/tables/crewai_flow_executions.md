# crewai_flow_executions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2025-10-28T12:24:22.172Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (18 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| flow_id | `uuid` | **NO** | - | - |
| execution_key | `character varying(100)` | **NO** | - | Unique identifier for tracking (format: FLOW-KEY-TIMESTAMP) |
| input_state | `jsonb` | YES | - | - |
| output_state | `jsonb` | YES | - | - |
| status | `character varying(20)` | YES | `'pending'::character varying` | - |
| error_message | `text` | YES | - | - |
| error_stack | `text` | YES | - | - |
| error_type | `character varying(100)` | YES | - | - |
| started_at | `timestamp with time zone` | YES | `now()` | - |
| completed_at | `timestamp with time zone` | YES | - | - |
| duration_ms | `integer(32)` | YES | - | - |
| token_count | `integer(32)` | YES | - | - |
| cost_usd | `numeric(10,4)` | YES | - | - |
| board_meeting_id | `uuid` | YES | - | Links workflow execution to board meeting (when applicable) |
| executed_by | `uuid` | YES | - | - |
| execution_mode | `character varying(20)` | YES | `'manual'::character varying` | - |
| metadata | `jsonb` | YES | - | - |

## Constraints

### Primary Key
- `crewai_flow_executions_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `crewai_flow_executions_flow_id_fkey`: flow_id → crewai_flows(id)

### Unique Constraints
- `crewai_flow_executions_execution_key_key`: UNIQUE (execution_key)

### Check Constraints
- `crewai_flow_executions_execution_mode_check`: CHECK (((execution_mode)::text = ANY ((ARRAY['manual'::character varying, 'scheduled'::character varying, 'triggered'::character varying])::text[])))
- `crewai_flow_executions_status_check`: CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'running'::character varying, 'completed'::character varying, 'failed'::character varying, 'cancelled'::character varying, 'timeout'::character varying])::text[])))

## Indexes

- `crewai_flow_executions_execution_key_key`
  ```sql
  CREATE UNIQUE INDEX crewai_flow_executions_execution_key_key ON public.crewai_flow_executions USING btree (execution_key)
  ```
- `crewai_flow_executions_pkey`
  ```sql
  CREATE UNIQUE INDEX crewai_flow_executions_pkey ON public.crewai_flow_executions USING btree (id)
  ```
- `idx_flow_exec_board_meeting_id`
  ```sql
  CREATE INDEX idx_flow_exec_board_meeting_id ON public.crewai_flow_executions USING btree (board_meeting_id)
  ```
- `idx_flow_exec_executed_by`
  ```sql
  CREATE INDEX idx_flow_exec_executed_by ON public.crewai_flow_executions USING btree (executed_by)
  ```
- `idx_flow_exec_flow_id`
  ```sql
  CREATE INDEX idx_flow_exec_flow_id ON public.crewai_flow_executions USING btree (flow_id)
  ```
- `idx_flow_exec_recent`
  ```sql
  CREATE INDEX idx_flow_exec_recent ON public.crewai_flow_executions USING btree (flow_id, started_at DESC)
  ```
- `idx_flow_exec_started_at`
  ```sql
  CREATE INDEX idx_flow_exec_started_at ON public.crewai_flow_executions USING btree (started_at DESC)
  ```
- `idx_flow_exec_status`
  ```sql
  CREATE INDEX idx_flow_exec_status ON public.crewai_flow_executions USING btree (status)
  ```

## RLS Policies

### 1. executions_create (INSERT)

- **Roles**: {public}
- **With Check**: `(auth.uid() = executed_by)`

### 2. executions_read_own (SELECT)

- **Roles**: {public}
- **Using**: `(auth.uid() = executed_by)`

## Triggers

### execution_duration_calculator

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION calculate_execution_duration()`

### flow_execution_counter

- **Timing**: AFTER INSERT
- **Action**: `EXECUTE FUNCTION update_flow_execution_count()`

---

[← Back to Schema Overview](../database-schema-overview.md)
