# tool_usage_ledger Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-13T23:53:41.400Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| agent_id | `uuid` | **NO** | - | - |
| venture_id | `uuid` | YES | - | - |
| tool_id | `uuid` | **NO** | - | - |
| tokens_consumed | `integer(32)` | YES | `0` | - |
| cost_usd | `numeric(10,6)` | YES | `0` | - |
| execution_ms | `integer(32)` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `tool_usage_ledger_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `tool_usage_ledger_agent_id_fkey`: agent_id → agent_registry(id)
- `tool_usage_ledger_tool_id_fkey`: tool_id → tool_registry(id)
- `tool_usage_ledger_venture_id_fkey`: venture_id → ventures(id)

## Indexes

- `idx_ledger_agent`
  ```sql
  CREATE INDEX idx_ledger_agent ON public.tool_usage_ledger USING btree (agent_id, created_at DESC)
  ```
- `idx_ledger_venture_cost`
  ```sql
  CREATE INDEX idx_ledger_venture_cost ON public.tool_usage_ledger USING btree (venture_id, created_at DESC, cost_usd)
  ```
- `tool_usage_ledger_pkey`
  ```sql
  CREATE UNIQUE INDEX tool_usage_ledger_pkey ON public.tool_usage_ledger USING btree (id)
  ```

## RLS Policies

### 1. chairman_read_ledger (SELECT)

- **Roles**: {authenticated}
- **Using**: `fn_is_chairman()`

### 2. ledger_no_delete (DELETE)

- **Roles**: {authenticated}
- **Using**: `false`

### 3. ledger_no_update (UPDATE)

- **Roles**: {authenticated}
- **Using**: `false`

### 4. service_role_all_ledger (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
