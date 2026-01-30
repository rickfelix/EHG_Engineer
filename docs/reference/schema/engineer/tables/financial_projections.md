# financial_projections Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-30T00:55:02.600Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| model_id | `uuid` | **NO** | - | - |
| period_type | `character varying(20)` | **NO** | - | - |
| period_start | `date` | **NO** | - | - |
| period_end | `date` | **NO** | - | - |
| projections | `jsonb` | **NO** | `'{}'::jsonb` | JSONB: {revenue, expenses, cash_flow, runway, burn_rate, etc.} |
| assumptions | `jsonb` | **NO** | `'{}'::jsonb` | JSONB: {growth_rate, churn_rate, cac, ltv, etc.} |
| scenario_name | `character varying(100)` | YES | - | Scenario identifier for scenario analysis |
| scenario_probability | `numeric(5,2)` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `financial_projections_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `financial_projections_model_id_fkey`: model_id → financial_models(id)
- `fk_model`: model_id → financial_models(id)

### Check Constraints
- `valid_dates`: CHECK ((period_end > period_start))
- `valid_period`: CHECK (((period_type)::text = ANY ((ARRAY['monthly'::character varying, 'quarterly'::character varying, 'yearly'::character varying])::text[])))
- `valid_probability`: CHECK (((scenario_probability IS NULL) OR ((scenario_probability >= (0)::numeric) AND (scenario_probability <= (100)::numeric))))

## Indexes

- `financial_projections_pkey`
  ```sql
  CREATE UNIQUE INDEX financial_projections_pkey ON public.financial_projections USING btree (id)
  ```
- `idx_financial_projections_model`
  ```sql
  CREATE INDEX idx_financial_projections_model ON public.financial_projections USING btree (model_id)
  ```
- `idx_financial_projections_period`
  ```sql
  CREATE INDEX idx_financial_projections_period ON public.financial_projections USING btree (period_start, period_end)
  ```
- `idx_financial_projections_scenario`
  ```sql
  CREATE INDEX idx_financial_projections_scenario ON public.financial_projections USING btree (scenario_name)
  ```

## RLS Policies

### 1. financial_projections_via_model (SELECT)

- **Roles**: {public}
- **Using**: `(model_id IN ( SELECT financial_models.id
   FROM financial_models
  WHERE (financial_models.company_id IN ( SELECT user_company_access.company_id
           FROM user_company_access
          WHERE ((user_company_access.user_id = auth.uid()) AND (user_company_access.is_active = true))))))`

---

[← Back to Schema Overview](../database-schema-overview.md)
