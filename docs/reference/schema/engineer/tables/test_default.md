# test_default Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-11T14:23:09.756Z
**Rows**: 0
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (1 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |

## Constraints

### Primary Key
- `test_default_pkey`: PRIMARY KEY (id)

## Indexes

- `test_default_pkey`
  ```sql
  CREATE UNIQUE INDEX test_default_pkey ON public.test_default USING btree (id)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
