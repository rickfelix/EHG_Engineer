# venture_financial_contract Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-17T18:58:02.392Z
**Rows**: 2
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| capital_required | `numeric` | YES | - | - |
| cac_estimate | `numeric` | YES | - | - |
| ltv_estimate | `numeric` | YES | - | - |
| unit_economics | `jsonb` | YES | - | - |
| pricing_model | `text` | YES | - | - |
| price_points | `jsonb` | YES | - | - |
| revenue_projection | `jsonb` | YES | - | - |
| set_by_stage | `integer(32)` | **NO** | - | - |
| last_refined_by_stage | `integer(32)` | YES | - | - |
| refinement_history | `jsonb` | YES | `'[]'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `venture_financial_contract_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_financial_contract_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `venture_financial_contract_venture_id_key`: UNIQUE (venture_id)

## Indexes

- `idx_vfc_venture_id`
  ```sql
  CREATE INDEX idx_vfc_venture_id ON public.venture_financial_contract USING btree (venture_id)
  ```
- `venture_financial_contract_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_financial_contract_pkey ON public.venture_financial_contract USING btree (id)
  ```
- `venture_financial_contract_venture_id_key`
  ```sql
  CREATE UNIQUE INDEX venture_financial_contract_venture_id_key ON public.venture_financial_contract USING btree (venture_id)
  ```

## RLS Policies

### 1. authenticated_read (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_full_access (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
