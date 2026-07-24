# agent_budgets Table

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

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| agent_id | `uuid` | **NO** | - | - |
| daily_limit | `numeric` | **NO** | `0` | - |
| daily_consumed | `numeric` | **NO** | `0` | - |
| monthly_limit | `numeric` | **NO** | `0` | - |
| monthly_consumed | `numeric` | **NO** | `0` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `agent_budgets_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `agent_budgets_agent_id_fkey`: agent_id → agent_registry(id)

### Unique Constraints
- `agent_budgets_agent_id_key`: UNIQUE (agent_id)

## Indexes

- `agent_budgets_agent_id_key`
  ```sql
  CREATE UNIQUE INDEX agent_budgets_agent_id_key ON public.agent_budgets USING btree (agent_id)
  ```
- `agent_budgets_pkey`
  ```sql
  CREATE UNIQUE INDEX agent_budgets_pkey ON public.agent_budgets USING btree (id)
  ```

## RLS Policies

### 1. service_role_all_agent_budgets (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
