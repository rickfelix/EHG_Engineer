# venture_token_ledger Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-26T04:26:11.529Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (20 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| lifecycle_stage | `integer(32)` | **NO** | - | - |
| phase | `text` | YES | - | - |
| agent_type | `text` | **NO** | - | - |
| model_id | `text` | YES | - | - |
| job_id | `uuid` | YES | - | - |
| crew_id | `text` | YES | - | - |
| tokens_input | `integer(32)` | **NO** | `0` | - |
| tokens_output | `integer(32)` | **NO** | `0` | - |
| tokens_total | `integer(32)` | YES | - | - |
| cost_usd | `numeric(10,6)` | YES | `0` | - |
| budget_profile | `text` | YES | `'standard'::text` | - |
| budget_allocation_pct | `numeric(5,2)` | YES | - | - |
| is_simulation | `boolean` | YES | `false` | - |
| simulation_run_id | `uuid` | YES | - | - |
| operation_type | `text` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_by | `text` | YES | - | - |

## Constraints

### Primary Key
- `venture_token_ledger_pkey`: PRIMARY KEY (id)

### Check Constraints
- `venture_token_ledger_budget_profile_check`: CHECK ((budget_profile = ANY (ARRAY['exploratory'::text, 'standard'::text, 'deep_due_diligence'::text, 'custom'::text])))
- `venture_token_ledger_phase_check`: CHECK ((phase = ANY (ARRAY['THE_TRUTH'::text, 'THE_ENGINE'::text, 'THE_IDENTITY'::text, 'THE_BLUEPRINT'::text, 'THE_BUILD_LOOP'::text, 'LAUNCH_LEARN'::text])))

## Indexes

- `idx_token_ledger_agent_type`
  ```sql
  CREATE INDEX idx_token_ledger_agent_type ON public.venture_token_ledger USING btree (agent_type)
  ```
- `idx_token_ledger_created_at`
  ```sql
  CREATE INDEX idx_token_ledger_created_at ON public.venture_token_ledger USING btree (created_at DESC)
  ```
- `idx_token_ledger_is_simulation`
  ```sql
  CREATE INDEX idx_token_ledger_is_simulation ON public.venture_token_ledger USING btree (is_simulation) WHERE (is_simulation = true)
  ```
- `idx_token_ledger_stage`
  ```sql
  CREATE INDEX idx_token_ledger_stage ON public.venture_token_ledger USING btree (lifecycle_stage)
  ```
- `idx_token_ledger_venture_id`
  ```sql
  CREATE INDEX idx_token_ledger_venture_id ON public.venture_token_ledger USING btree (venture_id)
  ```
- `idx_token_ledger_venture_stage`
  ```sql
  CREATE INDEX idx_token_ledger_venture_stage ON public.venture_token_ledger USING btree (venture_id, lifecycle_stage)
  ```
- `venture_token_ledger_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_token_ledger_pkey ON public.venture_token_ledger USING btree (id)
  ```

## RLS Policies

### 1. Allow update for authenticated (UPDATE)

- **Roles**: {authenticated}
- **Using**: `true`
- **With Check**: `true`

### 2. System can insert token records (INSERT)

- **Roles**: {public}
- **With Check**: `true`

### 3. Users can view token ledger for accessible ventures (SELECT)

- **Roles**: {public}
- **Using**: `(venture_id IN ( SELECT ventures.id
   FROM ventures
  WHERE (ventures.company_id IN ( SELECT ventures.company_id
           FROM profiles
          WHERE (profiles.id = auth.uid())))))`

### 4. venture_token_ledger_delete (DELETE)

- **Roles**: {service_role}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
