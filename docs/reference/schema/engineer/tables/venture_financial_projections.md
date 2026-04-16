# venture_financial_projections Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-16T01:07:03.421Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| projection_type | `text` | **NO** | - | - |
| time_horizon_months | `integer(32)` | YES | - | - |
| revenue_projection | `numeric` | YES | - | - |
| cost_projection | `numeric` | YES | - | - |
| assumptions | `jsonb` | YES | `'{}'::jsonb` | - |
| model_version | `text` | YES | `'1.0'::text` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `venture_financial_projections_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_financial_projections_venture_id_fkey`: venture_id → ventures(id)

## Indexes

- `idx_venture_financial_projections_venture_id`
  ```sql
  CREATE INDEX idx_venture_financial_projections_venture_id ON public.venture_financial_projections USING btree (venture_id)
  ```
- `venture_financial_projections_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_financial_projections_pkey ON public.venture_financial_projections USING btree (id)
  ```

## RLS Policies

### 1. service_role_all_venture_financial_projections (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
