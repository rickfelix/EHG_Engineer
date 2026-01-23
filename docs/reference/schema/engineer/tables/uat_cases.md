# uat_cases Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-23T15:02:05.180Z
**Rows**: 81
**RLS**: Enabled (7 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `text` | **NO** | - | - |
| section | `character varying(50)` | **NO** | - | - |
| priority | `character varying(20)` | YES | `'high'::character varying` | - |
| title | `text` | **NO** | - | - |
| description | `text` | YES | - | - |
| test_type | `character varying(20)` | YES | `'automatic'::character varying` | - |
| sort_order | `integer(32)` | YES | `0` | Defines the logical order for test execution/assessment. Lower numbers appear first. |

## Constraints

### Primary Key
- `uat_cases_pkey`: PRIMARY KEY (id)

## Indexes

- `idx_uat_cases_sort_order`
  ```sql
  CREATE INDEX idx_uat_cases_sort_order ON public.uat_cases USING btree (sort_order)
  ```
- `uat_cases_pkey`
  ```sql
  CREATE UNIQUE INDEX uat_cases_pkey ON public.uat_cases USING btree (id)
  ```

## RLS Policies

### 1. Anon users can create uat_cases (INSERT)

- **Roles**: {public}
- **With Check**: `true`

### 2. Anon users can delete uat_cases (DELETE)

- **Roles**: {public}
- **Using**: `true`

### 3. Anon users can update uat_cases (UPDATE)

- **Roles**: {public}
- **Using**: `true`
- **With Check**: `true`

### 4. Anon users can view all uat_cases (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 5. uat_cases_auth_read (SELECT)

- **Roles**: {public}
- **Using**: `(auth.role() = 'authenticated'::text)`

### 6. uat_cases_chairman_read (SELECT)

- **Roles**: {public}
- **Using**: `(((auth.jwt() ->> 'role'::text) = 'chairman'::text) OR ((auth.jwt() ->> 'email'::text) ~~ '%@chairman%'::text))`

### 7. uat_cases_service_all (ALL)

- **Roles**: {public}
- **Using**: `(((auth.jwt() ->> 'role'::text) = 'service_role'::text) OR (CURRENT_USER = 'service_role'::name))`

---

[← Back to Schema Overview](../database-schema-overview.md)
