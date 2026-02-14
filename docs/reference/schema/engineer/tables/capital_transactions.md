# capital_transactions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-14T02:43:03.595Z
**Rows**: 30
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| stage_work_id | `uuid` | YES | - | - |
| amount | `numeric` | **NO** | - | - |
| transaction_type | `USER-DEFINED` | **NO** | - | - |
| correlation_id | `text` | YES | - | - |
| description | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `capital_transactions_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `capital_transactions_stage_work_id_fkey`: stage_work_id → venture_stage_work(id)
- `capital_transactions_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `capital_transactions_amount_check`: CHECK ((amount <> (0)::numeric))
- `positive_allocations`: CHECK ((((transaction_type = 'token_allocation'::capital_transaction_type) AND (amount > (0)::numeric)) OR (transaction_type <> 'token_allocation'::capital_transaction_type)))

## Indexes

- `capital_transactions_pkey`
  ```sql
  CREATE UNIQUE INDEX capital_transactions_pkey ON public.capital_transactions USING btree (id)
  ```
- `idx_capital_transactions_correlation`
  ```sql
  CREATE INDEX idx_capital_transactions_correlation ON public.capital_transactions USING btree (correlation_id) WHERE (correlation_id IS NOT NULL)
  ```
- `idx_capital_transactions_created`
  ```sql
  CREATE INDEX idx_capital_transactions_created ON public.capital_transactions USING btree (created_at DESC)
  ```
- `idx_capital_transactions_stage_work`
  ```sql
  CREATE INDEX idx_capital_transactions_stage_work ON public.capital_transactions USING btree (stage_work_id) WHERE (stage_work_id IS NOT NULL)
  ```
- `idx_capital_transactions_venture`
  ```sql
  CREATE INDEX idx_capital_transactions_venture ON public.capital_transactions USING btree (venture_id)
  ```

## RLS Policies

### 1. capital_transactions_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. capital_transactions_service (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
