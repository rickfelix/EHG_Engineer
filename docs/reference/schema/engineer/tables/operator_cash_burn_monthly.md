# operator_cash_burn_monthly Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 2
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| period_month | `date` | **NO** | - | - |
| cash_usd | `numeric(14,2)` | YES | - | - |
| cash_last_synced_at | `timestamp with time zone` | YES | - | - |
| ai_burn_usd | `numeric(14,2)` | YES | - | - |
| ai_burn_last_synced_at | `timestamp with time zone` | YES | - | - |
| ai_burn_is_lower_bound | `boolean` | **NO** | `true` | - |
| other_burn_usd | `numeric(14,2)` | YES | - | - |
| other_burn_last_synced_at | `timestamp with time zone` | YES | - | - |
| revenue_usd | `numeric(14,2)` | YES | - | - |
| revenue_last_synced_at | `timestamp with time zone` | YES | - | - |
| revenue_livemode | `boolean` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `operator_cash_burn_monthly_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `operator_cash_burn_period_unique`: UNIQUE (period_month)

### Check Constraints
- `operator_cash_burn_first_of_month`: CHECK ((date_trunc('month'::text, (period_month)::timestamp with time zone) = period_month))

## Indexes

- `idx_operator_cash_burn_period`
  ```sql
  CREATE INDEX idx_operator_cash_burn_period ON public.operator_cash_burn_monthly USING btree (period_month DESC)
  ```
- `operator_cash_burn_monthly_pkey`
  ```sql
  CREATE UNIQUE INDEX operator_cash_burn_monthly_pkey ON public.operator_cash_burn_monthly USING btree (id)
  ```
- `operator_cash_burn_period_unique`
  ```sql
  CREATE UNIQUE INDEX operator_cash_burn_period_unique ON public.operator_cash_burn_monthly USING btree (period_month)
  ```

## RLS Policies

### 1. operator_cash_burn_auth_read (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. operator_cash_burn_service (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
