# venture_tool_quotas Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-13T02:06:16.124Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| tool_id | `uuid` | **NO** | - | - |
| daily_limit | `integer(32)` | YES | - | - |
| monthly_limit | `integer(32)` | YES | - | - |
| cost_limit_usd | `numeric(10,2)` | YES | - | - |
| usage_today | `integer(32)` | YES | `0` | - |
| usage_this_month | `integer(32)` | YES | `0` | - |
| cost_this_month_usd | `numeric(10,2)` | YES | `0` | - |
| last_daily_reset | `timestamp with time zone` | YES | `now()` | - |
| last_monthly_reset | `timestamp with time zone` | YES | `now()` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `venture_tool_quotas_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_tool_quotas_tool_id_fkey`: tool_id → tool_registry(id)
- `venture_tool_quotas_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `venture_tool_quotas_unique`: UNIQUE (venture_id, tool_id)

## Indexes

- `idx_venture_quotas_venture`
  ```sql
  CREATE INDEX idx_venture_quotas_venture ON public.venture_tool_quotas USING btree (venture_id)
  ```
- `venture_tool_quotas_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_tool_quotas_pkey ON public.venture_tool_quotas USING btree (id)
  ```
- `venture_tool_quotas_unique`
  ```sql
  CREATE UNIQUE INDEX venture_tool_quotas_unique ON public.venture_tool_quotas USING btree (venture_id, tool_id)
  ```

## RLS Policies

### 1. service_role_all_quotas (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_quotas_updated

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION fn_update_timestamp()`

### trg_reset_quotas_on_access

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION fn_check_quota_reset()`

---

[← Back to Schema Overview](../database-schema-overview.md)
