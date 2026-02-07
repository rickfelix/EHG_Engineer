# financial_scenarios Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-07T11:05:08.363Z
**Rows**: 5
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| model_id | `uuid` | **NO** | - | - |
| scenario_type | `character varying(50)` | **NO** | - | - |
| scenario_config | `jsonb` | **NO** | `'{}'::jsonb` | JSONB: {iterations: 10000, variables: {...}, ranges: {...}} |
| results | `jsonb` | **NO** | `'{}'::jsonb` | JSONB: {percentiles, distributions, probabilities, etc.} |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| execution_time_ms | `integer(32)` | YES | - | - |

## Constraints

### Primary Key
- `financial_scenarios_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `financial_scenarios_model_id_fkey`: model_id → financial_models(id)
- `fk_scenario_model`: model_id → financial_models(id)

### Check Constraints
- `valid_scenario_type`: CHECK (((scenario_type)::text = ANY ((ARRAY['monte_carlo'::character varying, 'sensitivity'::character varying, 'best_case'::character varying, 'base_case'::character varying, 'worst_case'::character varying, 'custom'::character varying])::text[])))

## Indexes

- `financial_scenarios_pkey`
  ```sql
  CREATE UNIQUE INDEX financial_scenarios_pkey ON public.financial_scenarios USING btree (id)
  ```
- `idx_financial_scenarios_model`
  ```sql
  CREATE INDEX idx_financial_scenarios_model ON public.financial_scenarios USING btree (model_id)
  ```
- `idx_financial_scenarios_type`
  ```sql
  CREATE INDEX idx_financial_scenarios_type ON public.financial_scenarios USING btree (scenario_type)
  ```

## RLS Policies

### 1. financial_scenarios_via_model (SELECT)

- **Roles**: {public}
- **Using**: `(model_id IN ( SELECT financial_models.id
   FROM financial_models
  WHERE (financial_models.company_id IN ( SELECT user_company_access.company_id
           FROM user_company_access
          WHERE ((user_company_access.user_id = auth.uid()) AND (user_company_access.is_active = true))))))`

---

[← Back to Schema Overview](../database-schema-overview.md)
