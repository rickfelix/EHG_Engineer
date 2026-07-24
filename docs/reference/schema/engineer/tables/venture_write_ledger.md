# venture_write_ledger Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| operation_type | `character varying(50)` | **NO** | - | - |
| write_count | `integer(32)` | **NO** | `1` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| created_by | `text` | YES | `'eva-write-tracker'::text` | - |

## Constraints

### Primary Key
- `venture_write_ledger_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_write_ledger_venture_id_fkey`: venture_id → ventures(id)

## Indexes

- `idx_venture_write_ledger_created_at`
  ```sql
  CREATE INDEX idx_venture_write_ledger_created_at ON public.venture_write_ledger USING btree (created_at)
  ```
- `idx_venture_write_ledger_venture`
  ```sql
  CREATE INDEX idx_venture_write_ledger_venture ON public.venture_write_ledger USING btree (venture_id)
  ```
- `venture_write_ledger_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_write_ledger_pkey ON public.venture_write_ledger USING btree (id)
  ```

## RLS Policies

### 1. vwl_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`

### 2. vwl_venture_access (ALL)

- **Roles**: {authenticated}
- **Using**: `(venture_id IN ( SELECT v.id
   FROM ventures v
  WHERE (v.company_id IN ( SELECT user_company_access.company_id
           FROM user_company_access
          WHERE (user_company_access.user_id = auth.uid())))))`

---

[← Back to Schema Overview](../database-schema-overview.md)
