# venture_token_budgets Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-13T21:05:35.429Z
**Rows**: 5
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| budget_allocated | `integer(32)` | **NO** | `100000` | Total tokens allocated to this venture (refreshed on budget reset) |
| budget_remaining | `integer(32)` | **NO** | `100000` | Current remaining token balance. Decremented on each agent execution. |
| budget_reset_at | `timestamp with time zone` | YES | - | - |
| budget_reset_reason | `text` | YES | - | - |
| warning_threshold_pct | `integer(32)` | YES | `20` | Percentage remaining that triggers budget warning (default 20%) |
| critical_threshold_pct | `integer(32)` | YES | `10` | Percentage remaining that triggers critical alert (default 10%) |
| last_warning_sent_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `venture_token_budgets_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_token_budgets_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `venture_token_budgets_venture_id_key`: UNIQUE (venture_id)

### Check Constraints
- `venture_token_budgets_critical_threshold_pct_check`: CHECK (((critical_threshold_pct >= 1) AND (critical_threshold_pct <= 100)))
- `venture_token_budgets_warning_threshold_pct_check`: CHECK (((warning_threshold_pct >= 1) AND (warning_threshold_pct <= 100)))

## Indexes

- `idx_venture_token_budgets_remaining`
  ```sql
  CREATE INDEX idx_venture_token_budgets_remaining ON public.venture_token_budgets USING btree (budget_remaining)
  ```
- `idx_venture_token_budgets_venture_id`
  ```sql
  CREATE INDEX idx_venture_token_budgets_venture_id ON public.venture_token_budgets USING btree (venture_id)
  ```
- `venture_token_budgets_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_token_budgets_pkey ON public.venture_token_budgets USING btree (id)
  ```
- `venture_token_budgets_venture_id_key`
  ```sql
  CREATE UNIQUE INDEX venture_token_budgets_venture_id_key ON public.venture_token_budgets USING btree (venture_id)
  ```

## RLS Policies

### 1. anon_read_venture_token_budgets (SELECT)

- **Roles**: {anon}
- **Using**: `true`

### 2. authenticated_read_venture_token_budgets (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 3. service_role_full_access_venture_token_budgets (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trigger_validate_venture_token_budget

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION validate_venture_token_budget()`

### trigger_validate_venture_token_budget

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION validate_venture_token_budget()`

### trigger_venture_token_budgets_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_venture_token_budgets_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
