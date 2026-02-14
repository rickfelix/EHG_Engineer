# archetype_benchmarks Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-14T13:05:36.627Z
**Rows**: 7
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| archetype | `character varying(50)` | **NO** | - | - |
| display_name | `character varying(100)` | **NO** | - | - |
| margin_target | `numeric(4,2)` | **NO** | - | - |
| margin_acceptable | `numeric(4,2)` | **NO** | - | - |
| breakeven_months | `integer(32)` | **NO** | - | - |
| cac_ltv_ratio | `numeric(4,2)` | **NO** | - | - |
| description | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `archetype_benchmarks_pkey`: PRIMARY KEY (archetype)

## Indexes

- `archetype_benchmarks_pkey`
  ```sql
  CREATE UNIQUE INDEX archetype_benchmarks_pkey ON public.archetype_benchmarks USING btree (archetype)
  ```

## RLS Policies

### 1. archetype_benchmarks_admin (ALL)

- **Roles**: {public}
- **Using**: `(EXISTS ( SELECT 1
   FROM auth.users
  WHERE ((auth.uid() = users.id) AND ((users.raw_user_meta_data ->> 'role'::text) = ANY (ARRAY['admin'::text, 'chairman'::text])))))`

### 2. archetype_benchmarks_select (SELECT)

- **Roles**: {public}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
