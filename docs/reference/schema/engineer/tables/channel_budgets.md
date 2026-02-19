# channel_budgets Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-19T23:26:50.288Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| platform | `text` | **NO** | - | - |
| monthly_budget_cents | `integer(32)` | **NO** | `5000` | - |
| daily_limit_cents | `integer(32)` | YES | - | - |
| daily_stop_loss_multiplier | `numeric(4,2)` | **NO** | `2.0` | - |
| current_month_spend_cents | `integer(32)` | **NO** | `0` | - |
| current_day_spend_cents | `integer(32)` | **NO** | `0` | - |
| budget_month | `text` | YES | - | - |
| status | `text` | **NO** | `'active'::text` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `channel_budgets_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `channel_budgets_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `channel_budgets_venture_id_platform_key`: UNIQUE (venture_id, platform)

## Indexes

- `channel_budgets_pkey`
  ```sql
  CREATE UNIQUE INDEX channel_budgets_pkey ON public.channel_budgets USING btree (id)
  ```
- `channel_budgets_venture_id_platform_key`
  ```sql
  CREATE UNIQUE INDEX channel_budgets_venture_id_platform_key ON public.channel_budgets USING btree (venture_id, platform)
  ```
- `idx_channel_budgets_venture`
  ```sql
  CREATE INDEX idx_channel_budgets_venture ON public.channel_budgets USING btree (venture_id)
  ```

## RLS Policies

### 1. service_role_all_channel_budgets (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. venture_read_channel_budgets (SELECT)

- **Roles**: {authenticated}
- **Using**: `(venture_id IN ( SELECT ventures.id
   FROM ventures
  WHERE ((auth.uid())::text = (ventures.created_by)::text)))`

## Triggers

### trg_channel_budgets_updated

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_marketing_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
