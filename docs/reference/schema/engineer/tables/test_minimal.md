# test_minimal Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-10T12:28:46.954Z
**Rows**: 0
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (1 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | - | - |

## Constraints

### Primary Key
- `test_minimal_pkey`: PRIMARY KEY (id)

## Indexes

- `test_minimal_pkey`
  ```sql
  CREATE UNIQUE INDEX test_minimal_pkey ON public.test_minimal USING btree (id)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
