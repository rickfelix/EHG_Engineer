# income_capture_monthly Table

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
| recurring_revenue | `numeric(12,2)` | **NO** | `0` | - |
| business_expenses | `numeric(12,2)` | **NO** | `0` | - |
| ppo | `numeric(12,2)` | YES | - | - |
| retirement_solo_401k | `numeric(12,2)` | YES | - | - |
| se_tax | `numeric(12,2)` | YES | - | - |
| revenue_source | `text` | **NO** | `'ops_payment_events_aggregate'::text` | - |
| revenue_event_count | `integer(32)` | **NO** | `0` | - |
| livemode | `boolean` | **NO** | `true` | - |
| deduction_attestation_ref | `uuid` | YES | - | - |
| computed_at | `timestamp with time zone` | YES | `now()` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `income_capture_monthly_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `income_capture_monthly_deduction_attestation_ref_fkey`: deduction_attestation_ref → chairman_decisions(id)

### Unique Constraints
- `income_capture_period_livemode_unique`: UNIQUE (period_month, livemode)

### Check Constraints
- `income_capture_first_of_month`: CHECK ((date_trunc('month'::text, (period_month)::timestamp with time zone) = period_month))

## Indexes

- `idx_income_capture_period`
  ```sql
  CREATE INDEX idx_income_capture_period ON public.income_capture_monthly USING btree (period_month DESC)
  ```
- `income_capture_monthly_pkey`
  ```sql
  CREATE UNIQUE INDEX income_capture_monthly_pkey ON public.income_capture_monthly USING btree (id)
  ```
- `income_capture_period_livemode_unique`
  ```sql
  CREATE UNIQUE INDEX income_capture_period_livemode_unique ON public.income_capture_monthly USING btree (period_month, livemode)
  ```

## RLS Policies

### 1. income_capture_auth_read (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. income_capture_service (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
