# uat_cases Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-16T20:19:17.442Z
**Rows**: 81
**RLS**: Enabled (2 policies)

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

### 1. authenticated_select_uat_cases (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_uat_cases (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
