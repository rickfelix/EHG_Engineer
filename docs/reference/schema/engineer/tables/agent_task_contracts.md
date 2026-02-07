# agent_task_contracts Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-07T12:18:33.844Z
**Rows**: 6,308
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (28 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| session_id | `uuid` | YES | - | - |
| sd_id | `character varying(50)` | YES | - | - |
| parent_agent | `character varying(50)` | **NO** | - | - |
| target_agent | `character varying(50)` | **NO** | - | - |
| objective | `text` | **NO** | - | - |
| constraints | `jsonb` | YES | `'{}'::jsonb` | - |
| input_artifacts | `ARRAY` | YES | `ARRAY[]::uuid[]` | - |
| input_summary | `text` | YES | - | - |
| expected_output_type | `character varying(50)` | **NO** | `'artifact'::character varying` | - |
| output_schema | `jsonb` | YES | - | - |
| priority | `integer(32)` | **NO** | `50` | - |
| max_tokens | `integer(32)` | YES | `4000` | - |
| timeout_minutes | `integer(32)` | YES | `30` | - |
| status | `character varying(20)` | **NO** | `'pending'::character varying` | - |
| started_at | `timestamp with time zone` | YES | - | - |
| completed_at | `timestamp with time zone` | YES | - | - |
| output_artifact_id | `uuid` | YES | - | - |
| result_summary | `text` | YES | - | - |
| execution_tokens | `integer(32)` | YES | - | - |
| error_message | `text` | YES | - | - |
| retry_count | `integer(32)` | YES | `0` | - |
| max_retries | `integer(32)` | YES | `2` | - |
| created_by | `character varying(100)` | YES | `'system'::character varying` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| completion_idempotency_key | `uuid` | YES | - | - |
| completed_by_agent_id | `uuid` | YES | - | - |

## Constraints

### Primary Key
- `agent_task_contracts_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `agent_task_contracts_output_artifact_id_fkey`: output_artifact_id → agent_artifacts(id)
- `agent_task_contracts_sd_id_fkey`: sd_id → strategic_directives_v2(id)

### Check Constraints
- `agent_task_contracts_status_check`: CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'in_progress'::character varying, 'completed'::character varying, 'failed'::character varying, 'cancelled'::character varying])::text[])))

## Indexes

- `agent_task_contracts_pkey`
  ```sql
  CREATE UNIQUE INDEX agent_task_contracts_pkey ON public.agent_task_contracts USING btree (id)
  ```
- `idx_task_contracts_idempotency`
  ```sql
  CREATE UNIQUE INDEX idx_task_contracts_idempotency ON public.agent_task_contracts USING btree (id, completion_idempotency_key) WHERE (completion_idempotency_key IS NOT NULL)
  ```
- `idx_task_contracts_pending`
  ```sql
  CREATE INDEX idx_task_contracts_pending ON public.agent_task_contracts USING btree (target_agent, priority DESC) WHERE ((status)::text = 'pending'::text)
  ```
- `idx_task_contracts_sd`
  ```sql
  CREATE INDEX idx_task_contracts_sd ON public.agent_task_contracts USING btree (sd_id)
  ```
- `idx_task_contracts_session`
  ```sql
  CREATE INDEX idx_task_contracts_session ON public.agent_task_contracts USING btree (session_id)
  ```
- `idx_task_contracts_status`
  ```sql
  CREATE INDEX idx_task_contracts_status ON public.agent_task_contracts USING btree (status)
  ```
- `idx_task_contracts_target`
  ```sql
  CREATE INDEX idx_task_contracts_target ON public.agent_task_contracts USING btree (target_agent, status)
  ```

## RLS Policies

### 1. Anon can create task contracts (INSERT)

- **Roles**: {anon}
- **With Check**: `true`

### 2. Anon can update task contracts (UPDATE)

- **Roles**: {anon}
- **Using**: `true`
- **With Check**: `true`

### 3. Authenticated users can read task contracts (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 4. Service role full access on task contracts (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_task_contracts_updated

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_task_contracts_timestamp()`

---

[← Back to Schema Overview](../database-schema-overview.md)
