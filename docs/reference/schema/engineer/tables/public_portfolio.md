# public_portfolio Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-23T15:19:57.449Z
**Rows**: 2
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (6 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| sort_order | `integer(32)` | YES | `0` | - |
| is_published | `boolean` | YES | `true` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `public_portfolio_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `public_portfolio_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `public_portfolio_venture_id_key`: UNIQUE (venture_id)

## Indexes

- `idx_public_portfolio_published`
  ```sql
  CREATE INDEX idx_public_portfolio_published ON public.public_portfolio USING btree (is_published) WHERE (is_published = true)
  ```
- `idx_public_portfolio_sort`
  ```sql
  CREATE INDEX idx_public_portfolio_sort ON public.public_portfolio USING btree (sort_order)
  ```
- `public_portfolio_pkey`
  ```sql
  CREATE UNIQUE INDEX public_portfolio_pkey ON public.public_portfolio USING btree (id)
  ```
- `public_portfolio_venture_id_key`
  ```sql
  CREATE UNIQUE INDEX public_portfolio_venture_id_key ON public.public_portfolio USING btree (venture_id)
  ```

## RLS Policies

### 1. Authenticated can view all portfolio (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. Chairman can manage portfolio (ALL)

- **Roles**: {authenticated}
- **Using**: `fn_is_chairman()`
- **With Check**: `fn_is_chairman()`

### 3. Public can view published portfolio (SELECT)

- **Roles**: {anon}
- **Using**: `(is_published = true)`

### 4. Service role full access (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
