# chairman_decisions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-01T00:41:31.291Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (21 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| lifecycle_stage | `integer(32)` | **NO** | - | - |
| health_score | `character varying(10)` | YES | - | - |
| recommendation | `character varying(20)` | YES | - | - |
| decision | `character varying(20)` | **NO** | - | - |
| override_reason | `text` | YES | - | - |
| risks_acknowledged | `jsonb` | YES | - | - |
| quick_fixes_applied | `jsonb` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| preference_key | `text` | YES | - | - |
| preference_ref_id | `uuid` | YES | - | - |
| preference_snapshot | `jsonb` | YES | - | - |
| status | `text` | **NO** | `'pending'::text` | - |
| rationale | `text` | YES | - | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| summary | `text` | YES | - | - |
| brief_data | `jsonb` | YES | - | - |
| dfe_context | `jsonb` | YES | - | DFE engine output: { auto_proceed: bool, triggers: [{type, severity, message, details}], recommendation: string, evaluated_at: timestamp } |
| mitigation_actions | `jsonb` | YES | `'[]'::jsonb` | Chairman actions on mitigations: [{ mitigation_id, action: accept|reject, reason, acted_at, idempotency_key }] |
| decided_by | `text` | YES | - | - |

## Constraints

### Primary Key
- `chairman_decisions_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `chairman_decisions_preference_ref_id_fkey`: preference_ref_id → chairman_preferences(id)
- `chairman_decisions_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `chairman_decisions_decision_check`: CHECK (((decision)::text = ANY ((ARRAY['pass'::character varying, 'revise'::character varying, 'kill'::character varying, 'conditional_pass'::character varying, 'go'::character varying, 'conditional_go'::character varying, 'no_go'::character varying, 'complete'::character varying, 'continue'::character varying, 'blocked'::character varying, 'fail'::character varying, 'approve'::character varying, 'conditional'::character varying, 'reject'::character varying, 'release'::character varying, 'hold'::character varying, 'cancel'::character varying, 'no-go'::character varying, 'pivot'::character varying, 'expand'::character varying, 'sunset'::character varying, 'exit'::character varying, 'proceed'::character varying, 'fix'::character varying, 'pause'::character varying, 'override'::character varying, 'pending'::character varying, 'terminate'::character varying])::text[])))
- `chairman_decisions_health_score_check`: CHECK (((health_score)::text = ANY ((ARRAY['green'::character varying, 'yellow'::character varying, 'red'::character varying])::text[])))
- `chairman_decisions_recommendation_check`: CHECK (((recommendation)::text = ANY ((ARRAY['proceed'::character varying, 'pivot'::character varying, 'fix'::character varying, 'kill'::character varying, 'pause'::character varying])::text[])))
- `chairman_decisions_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text])))

## Indexes

- `chairman_decisions_pkey`
  ```sql
  CREATE UNIQUE INDEX chairman_decisions_pkey ON public.chairman_decisions USING btree (id)
  ```
- `idx_chairman_decisions_created`
  ```sql
  CREATE INDEX idx_chairman_decisions_created ON public.chairman_decisions USING btree (created_at DESC)
  ```
- `idx_chairman_decisions_decided_by`
  ```sql
  CREATE INDEX idx_chairman_decisions_decided_by ON public.chairman_decisions USING btree (decided_by) WHERE (decided_by IS NOT NULL)
  ```
- `idx_chairman_decisions_dfe_context_gin`
  ```sql
  CREATE INDEX idx_chairman_decisions_dfe_context_gin ON public.chairman_decisions USING gin (dfe_context jsonb_path_ops) WHERE (dfe_context IS NOT NULL)
  ```
- `idx_chairman_decisions_has_dfe`
  ```sql
  CREATE INDEX idx_chairman_decisions_has_dfe ON public.chairman_decisions USING btree (((dfe_context IS NOT NULL))) WHERE (dfe_context IS NOT NULL)
  ```
- `idx_chairman_decisions_stage`
  ```sql
  CREATE INDEX idx_chairman_decisions_stage ON public.chairman_decisions USING btree (lifecycle_stage)
  ```
- `idx_chairman_decisions_status`
  ```sql
  CREATE INDEX idx_chairman_decisions_status ON public.chairman_decisions USING btree (status)
  ```
- `idx_chairman_decisions_unique_pending`
  ```sql
  CREATE UNIQUE INDEX idx_chairman_decisions_unique_pending ON public.chairman_decisions USING btree (venture_id, lifecycle_stage) WHERE (status = 'pending'::text)
  ```
- `idx_chairman_decisions_updated`
  ```sql
  CREATE INDEX idx_chairman_decisions_updated ON public.chairman_decisions USING btree (updated_at DESC)
  ```
- `idx_chairman_decisions_venture`
  ```sql
  CREATE INDEX idx_chairman_decisions_venture ON public.chairman_decisions USING btree (venture_id)
  ```

## RLS Policies

### 1. chairman_decisions_delete_policy (DELETE)

- **Roles**: {authenticated}
- **Using**: `fn_is_chairman()`

### 2. chairman_decisions_insert_policy (INSERT)

- **Roles**: {authenticated}
- **With Check**: `fn_is_chairman()`

### 3. chairman_decisions_select_policy (SELECT)

- **Roles**: {authenticated}
- **Using**: `fn_is_chairman()`

### 4. chairman_decisions_update_policy (UPDATE)

- **Roles**: {authenticated}
- **Using**: `fn_is_chairman()`
- **With Check**: `fn_is_chairman()`

## Triggers

### trg_chairman_decision_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_chairman_decision_updated_at()`

### trg_doctrine_constraint_chairman

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION enforce_doctrine_of_constraint()`

### trg_doctrine_constraint_chairman

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION enforce_doctrine_of_constraint()`

---

[← Back to Schema Overview](../database-schema-overview.md)
