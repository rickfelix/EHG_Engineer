# market_signal_scanner_budget Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 1
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (5 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| month_key | `text` | **NO** | - | - |
| spent_usd | `numeric` | **NO** | `0` | - |
| cap_usd | `numeric` | **NO** | `25` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `market_signal_scanner_budget_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `market_signal_scanner_budget_month_key_unique`: UNIQUE (month_key)

## Indexes

- `idx_market_signal_scanner_budget_month_key`
  ```sql
  CREATE INDEX idx_market_signal_scanner_budget_month_key ON public.market_signal_scanner_budget USING btree (month_key)
  ```
- `market_signal_scanner_budget_month_key_unique`
  ```sql
  CREATE UNIQUE INDEX market_signal_scanner_budget_month_key_unique ON public.market_signal_scanner_budget USING btree (month_key)
  ```
- `market_signal_scanner_budget_pkey`
  ```sql
  CREATE UNIQUE INDEX market_signal_scanner_budget_pkey ON public.market_signal_scanner_budget USING btree (id)
  ```

## RLS Policies

### 1. market_signal_scanner_budget_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
