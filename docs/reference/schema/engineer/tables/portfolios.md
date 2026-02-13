# portfolios Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-13T00:58:19.770Z
**Rows**: 8
**RLS**: Enabled (7 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| name | `character varying(255)` | **NO** | - | - |
| description | `text` | YES | - | - |
| company_id | `uuid` | YES | - | - |
| total_value | `numeric(15,2)` | YES | - | - |
| total_ventures | `integer(32)` | YES | `0` | - |
| active_ventures | `integer(32)` | YES | `0` | - |
| target_roi | `numeric(5,2)` | YES | - | - |
| actual_roi | `numeric(5,2)` | YES | - | - |
| risk_level | `character varying(20)` | YES | - | - |
| investment_thesis | `text` | YES | - | - |
| focus_industries | `ARRAY` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| is_demo | `boolean` | YES | - | - |

## Constraints

### Primary Key
- `portfolios_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `portfolios_company_id_fkey`: company_id → companies(id)

### Check Constraints
- `portfolios_risk_level_check`: CHECK (((risk_level)::text = ANY ((ARRAY['very_low'::character varying, 'low'::character varying, 'medium'::character varying, 'high'::character varying, 'critical'::character varying])::text[])))

## Indexes

- `idx_portfolios_company`
  ```sql
  CREATE INDEX idx_portfolios_company ON public.portfolios USING btree (company_id)
  ```
- `portfolios_pkey`
  ```sql
  CREATE UNIQUE INDEX portfolios_pkey ON public.portfolios USING btree (id)
  ```

## RLS Policies

### 1. Allow authenticated users to delete portfolios (DELETE)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. Allow authenticated users to insert portfolios (INSERT)

- **Roles**: {authenticated}
- **With Check**: `true`

### 3. Allow authenticated users to update portfolios (UPDATE)

- **Roles**: {authenticated}
- **Using**: `true`
- **With Check**: `true`

### 4. Allow service_role to manage portfolios (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 5. Company access portfolios (ALL)

- **Roles**: {authenticated}
- **Using**: `(company_id IN ( SELECT user_company_access.company_id
   FROM user_company_access
  WHERE (user_company_access.user_id = auth.uid())))`

### 6. anon_select_portfolios (SELECT)

- **Roles**: {anon}
- **Using**: `true`

### 7. authenticated_select_portfolios (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
