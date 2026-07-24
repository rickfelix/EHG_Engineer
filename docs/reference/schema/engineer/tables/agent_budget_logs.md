# agent_budget_logs Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| agent_id | `uuid` | **NO** | - | - |
| venture_id | `uuid` | YES | - | - |
| operation_type | `text` | **NO** | - | - |
| decision | `text` | **NO** | - | - |
| details | `jsonb` | **NO** | `'{}'::jsonb` | - |
| timestamp | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `agent_budget_logs_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `agent_budget_logs_agent_id_fkey`: agent_id → agent_registry(id)
- `agent_budget_logs_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `agent_budget_logs_decision_check`: CHECK ((decision = ANY (ARRAY['ALLOWED'::text, 'BLOCKED'::text])))

## Indexes

- `agent_budget_logs_pkey`
  ```sql
  CREATE UNIQUE INDEX agent_budget_logs_pkey ON public.agent_budget_logs USING btree (id)
  ```
- `idx_agent_budget_logs_agent_id`
  ```sql
  CREATE INDEX idx_agent_budget_logs_agent_id ON public.agent_budget_logs USING btree (agent_id)
  ```

## RLS Policies

### 1. service_role_all_agent_budget_logs (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
