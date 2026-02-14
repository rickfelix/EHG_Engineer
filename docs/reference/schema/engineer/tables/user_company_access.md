# user_company_access Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-14T22:06:06.603Z
**Rows**: 9
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| user_id | `uuid` | **NO** | - | - |
| company_id | `uuid` | **NO** | - | - |
| access_level | `character varying(50)` | YES | `'viewer'::character varying` | - |
| granted_at | `timestamp with time zone` | YES | `now()` | - |
| granted_by | `uuid` | YES | - | - |
| role | `text` | YES | - | - |
| is_active | `boolean` | YES | - | - |
| updated_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `user_company_access_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `user_company_access_company_id_fkey`: company_id → companies(id)
- `user_company_access_granted_by_fkey`: granted_by → users(id)
- `user_company_access_user_id_fkey`: user_id → users(id)

### Unique Constraints
- `user_company_access_user_id_company_id_key`: UNIQUE (user_id, company_id)

## Indexes

- `user_company_access_pkey`
  ```sql
  CREATE UNIQUE INDEX user_company_access_pkey ON public.user_company_access USING btree (id)
  ```
- `user_company_access_user_id_company_id_key`
  ```sql
  CREATE UNIQUE INDEX user_company_access_user_id_company_id_key ON public.user_company_access USING btree (user_id, company_id)
  ```

## RLS Policies

### 1. Allow authenticated users to insert own user_company_access (INSERT)

- **Roles**: {authenticated}
- **With Check**: `(auth.uid() = user_id)`

### 2. Allow service_role to manage user_company_access (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 3. select_own_access (SELECT)

- **Roles**: {authenticated}
- **Using**: `(user_id = auth.uid())`

---

[← Back to Schema Overview](../database-schema-overview.md)
