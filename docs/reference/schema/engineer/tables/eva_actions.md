# eva_actions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-14T03:53:19.552Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (26 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| action_id | `uuid` | **NO** | `gen_random_uuid()` | - |
| session_id | `uuid` | YES | - | - |
| venture_id | `uuid` | YES | - | - |
| company_id | `uuid` | YES | - | - |
| stage_id | `integer(32)` | YES | - | Workflow stage number (1-40) |
| event_type | `text` | **NO** | - | Type of orchestration event (stage_transition, agent_assignment, etc.) |
| action_name | `text` | YES | - | - |
| payload | `jsonb` | **NO** | `'{}'::jsonb` | - |
| status | `text` | YES | `'pending'::text` | - |
| priority_level | `integer(32)` | YES | `5` | 1=lowest, 10=highest |
| execution_context | `jsonb` | YES | `'{}'::jsonb` | Runtime environment data |
| rollback_data | `jsonb` | YES | - | JSONB snapshot needed to undo action (previous state, inverse operation params) |
| assigned_agent_id | `uuid` | YES | - | - |
| result | `jsonb` | YES | - | - |
| error_message | `text` | YES | - | - |
| retry_count | `integer(32)` | YES | `0` | - |
| max_retries | `integer(32)` | YES | `3` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| scheduled_for | `timestamp with time zone` | YES | - | - |
| executed_at | `timestamp with time zone` | YES | - | - |
| completed_at | `timestamp with time zone` | YES | - | - |
| failed_at | `timestamp with time zone` | YES | - | - |
| rolled_back_at | `timestamp with time zone` | YES | - | - |
| created_by | `uuid` | YES | - | - |
| chairman_approved | `boolean` | YES | - | NULL=not required, TRUE=approved, FALSE=rejected |
| is_reversible | `boolean` | YES | `false` | Whether this action can be rolled back. Determined at creation time based on action type. |

## Constraints

### Primary Key
- `eva_actions_pkey`: PRIMARY KEY (action_id)

### Foreign Keys
- `eva_actions_company_id_fkey`: company_id → companies(id)
- `eva_actions_session_id_fkey`: session_id → eva_orchestration_sessions(session_id)
- `eva_actions_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `eva_actions_priority_level_check`: CHECK (((priority_level >= 1) AND (priority_level <= 10)))
- `eva_actions_stage_id_check`: CHECK (((stage_id >= 1) AND (stage_id <= 40)))
- `eva_actions_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'completed'::text, 'failed'::text, 'cancelled'::text, 'rolled_back'::text])))

## Indexes

- `eva_actions_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_actions_pkey ON public.eva_actions USING btree (action_id)
  ```
- `idx_eva_actions_agent`
  ```sql
  CREATE INDEX idx_eva_actions_agent ON public.eva_actions USING btree (assigned_agent_id)
  ```
- `idx_eva_actions_company`
  ```sql
  CREATE INDEX idx_eva_actions_company ON public.eva_actions USING btree (company_id)
  ```
- `idx_eva_actions_reversible`
  ```sql
  CREATE INDEX idx_eva_actions_reversible ON public.eva_actions USING btree (is_reversible) WHERE ((is_reversible = true) AND (status = ANY (ARRAY['completed'::text, 'in_progress'::text])))
  ```
- `idx_eva_actions_scheduled`
  ```sql
  CREATE INDEX idx_eva_actions_scheduled ON public.eva_actions USING btree (scheduled_for) WHERE (status = 'pending'::text)
  ```
- `idx_eva_actions_session`
  ```sql
  CREATE INDEX idx_eva_actions_session ON public.eva_actions USING btree (session_id)
  ```
- `idx_eva_actions_stage`
  ```sql
  CREATE INDEX idx_eva_actions_stage ON public.eva_actions USING btree (stage_id)
  ```
- `idx_eva_actions_status`
  ```sql
  CREATE INDEX idx_eva_actions_status ON public.eva_actions USING btree (status)
  ```
- `idx_eva_actions_venture`
  ```sql
  CREATE INDEX idx_eva_actions_venture ON public.eva_actions USING btree (venture_id)
  ```

## RLS Policies

### 1. eva_actions_company_access (SELECT)

- **Roles**: {public}
- **Using**: `(company_id IN ( SELECT user_company_access.company_id
   FROM user_company_access
  WHERE ((user_company_access.user_id = auth.uid()) AND (user_company_access.is_active = true))))`

### 2. eva_actions_company_delete (DELETE)

- **Roles**: {public}
- **Using**: `(company_id IN ( SELECT user_company_access.company_id
   FROM user_company_access
  WHERE ((user_company_access.user_id = auth.uid()) AND (user_company_access.is_active = true) AND (user_company_access.role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text])))))`

### 3. eva_actions_company_insert (INSERT)

- **Roles**: {public}
- **With Check**: `(company_id IN ( SELECT user_company_access.company_id
   FROM user_company_access
  WHERE ((user_company_access.user_id = auth.uid()) AND (user_company_access.is_active = true) AND (user_company_access.role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text])))))`

### 4. eva_actions_company_update (UPDATE)

- **Roles**: {public}
- **Using**: `(company_id IN ( SELECT user_company_access.company_id
   FROM user_company_access
  WHERE ((user_company_access.user_id = auth.uid()) AND (user_company_access.is_active = true) AND (user_company_access.role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text])))))`

## Triggers

### trigger_set_action_reversibility

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION set_action_reversibility()`

---

[← Back to Schema Overview](../database-schema-overview.md)
