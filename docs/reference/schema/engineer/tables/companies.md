# companies Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-21T13:23:45.333Z
**Rows**: 93
**RLS**: Enabled (6 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| name | `character varying(255)` | **NO** | - | - |
| description | `text` | YES | - | - |
| logo_url | `text` | YES | - | - |
| website | `text` | YES | - | - |
| industry | `character varying(100)` | YES | - | - |
| settings | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| is_demo | `boolean` | YES | `false` | - |
| mission | `text` | YES | - | - |
| vision | `text` | YES | - | - |
| portfolio_id | `uuid` | YES | - | - |

## Constraints

### Primary Key
- `companies_pkey`: PRIMARY KEY (id)

## Indexes

- `companies_pkey`
  ```sql
  CREATE UNIQUE INDEX companies_pkey ON public.companies USING btree (id)
  ```

## RLS Policies

### 1. Allow service_role to delete companies (DELETE)

- **Roles**: {service_role}
- **Using**: `true`

### 2. Allow service_role to insert companies (INSERT)

- **Roles**: {service_role}
- **With Check**: `true`

### 3. Allow service_role to update companies (UPDATE)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 4. Company access companies (ALL)

- **Roles**: {authenticated}
- **Using**: `(id IN ( SELECT user_company_access.company_id
   FROM user_company_access
  WHERE (user_company_access.user_id = auth.uid())))`

### 5. anon_select_companies (SELECT)

- **Roles**: {anon}
- **Using**: `true`

### 6. authenticated_select_companies (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
