# financial_models Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-09T03:28:36.177Z
**Rows**: 5
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| company_id | `uuid` | **NO** | - | - |
| template_type | `character varying(50)` | **NO** | - | Template type: saas (MRR/ARR), marketplace (GMV), hardware (units), etc. |
| model_name | `character varying(255)` | **NO** | - | - |
| model_data | `jsonb` | **NO** | `'{}'::jsonb` | JSONB: revenue streams, cost structure, assumptions, etc. |
| created_by | `uuid` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `financial_models_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `financial_models_company_id_fkey`: company_id → companies(id)
- `financial_models_venture_id_fkey`: venture_id → ventures(id)
- `fk_company`: company_id → companies(id)
- `fk_venture`: venture_id → ventures(id)

### Check Constraints
- `valid_template`: CHECK (((template_type)::text = ANY ((ARRAY['saas'::character varying, 'marketplace'::character varying, 'hardware'::character varying, 'services'::character varying, 'ecommerce'::character varying, 'subscription'::character varying, 'custom'::character varying])::text[])))

## Indexes

- `financial_models_pkey`
  ```sql
  CREATE UNIQUE INDEX financial_models_pkey ON public.financial_models USING btree (id)
  ```
- `idx_financial_models_company`
  ```sql
  CREATE INDEX idx_financial_models_company ON public.financial_models USING btree (company_id)
  ```
- `idx_financial_models_template`
  ```sql
  CREATE INDEX idx_financial_models_template ON public.financial_models USING btree (template_type)
  ```
- `idx_financial_models_venture`
  ```sql
  CREATE INDEX idx_financial_models_venture ON public.financial_models USING btree (venture_id)
  ```

## RLS Policies

### 1. Allow delete for authenticated (DELETE)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. financial_models_company_insert (INSERT)

- **Roles**: {public}
- **With Check**: `(company_id IN ( SELECT user_company_access.company_id
   FROM user_company_access
  WHERE ((user_company_access.user_id = auth.uid()) AND (user_company_access.is_active = true) AND (user_company_access.role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text])))))`

### 3. financial_models_company_isolation (SELECT)

- **Roles**: {public}
- **Using**: `(company_id IN ( SELECT user_company_access.company_id
   FROM user_company_access
  WHERE ((user_company_access.user_id = auth.uid()) AND (user_company_access.is_active = true))))`

### 4. financial_models_company_update (UPDATE)

- **Roles**: {public}
- **Using**: `(company_id IN ( SELECT user_company_access.company_id
   FROM user_company_access
  WHERE ((user_company_access.user_id = auth.uid()) AND (user_company_access.is_active = true) AND (user_company_access.role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text])))))`

---

[← Back to Schema Overview](../database-schema-overview.md)
