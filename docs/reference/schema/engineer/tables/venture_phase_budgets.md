# venture_phase_budgets Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-09T03:03:13.715Z
**Rows**: 0
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| phase_name | `character varying(50)` | **NO** | - | Lifecycle phase name (e.g., Stage 10, Stage 13, EXEC, PLAN). Maps to lifecycle_stage_config.stage_name. |
| budget_allocated | `integer(32)` | **NO** | `20000` | Total tokens allocated to this phase |
| budget_remaining | `integer(32)` | **NO** | `20000` | Current remaining token balance for this phase. Decremented on agent execution within phase. |
| phase_started_at | `timestamp with time zone` | YES | `now()` | - |
| phase_completed_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `venture_phase_budgets_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_phase_budgets_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `venture_phase_budgets_venture_id_phase_name_key`: UNIQUE (venture_id, phase_name)

## Indexes

- `idx_venture_phase_budgets_active`
  ```sql
  CREATE INDEX idx_venture_phase_budgets_active ON public.venture_phase_budgets USING btree (venture_id, phase_name) WHERE (phase_completed_at IS NULL)
  ```
- `idx_venture_phase_budgets_phase_name`
  ```sql
  CREATE INDEX idx_venture_phase_budgets_phase_name ON public.venture_phase_budgets USING btree (phase_name)
  ```
- `idx_venture_phase_budgets_remaining`
  ```sql
  CREATE INDEX idx_venture_phase_budgets_remaining ON public.venture_phase_budgets USING btree (budget_remaining)
  ```
- `idx_venture_phase_budgets_venture_id`
  ```sql
  CREATE INDEX idx_venture_phase_budgets_venture_id ON public.venture_phase_budgets USING btree (venture_id)
  ```
- `venture_phase_budgets_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_phase_budgets_pkey ON public.venture_phase_budgets USING btree (id)
  ```
- `venture_phase_budgets_venture_id_phase_name_key`
  ```sql
  CREATE UNIQUE INDEX venture_phase_budgets_venture_id_phase_name_key ON public.venture_phase_budgets USING btree (venture_id, phase_name)
  ```

## RLS Policies

### 1. anon_read_venture_phase_budgets (SELECT)

- **Roles**: {anon}
- **Using**: `true`

### 2. authenticated_read_venture_phase_budgets (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 3. service_role_full_access_venture_phase_budgets (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trigger_validate_venture_phase_budget

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION validate_venture_phase_budget()`

### trigger_validate_venture_phase_budget

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION validate_venture_phase_budget()`

### trigger_venture_phase_budgets_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_venture_phase_budgets_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
