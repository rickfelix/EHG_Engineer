# quarantine_meta_qparity20260610 Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 19
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (3 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| source_table | `text` | **NO** | - | - |
| quarantined | `bigint(64)` | **NO** | - | - |
| captured_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `quarantine_meta_qparity20260610_pkey`: PRIMARY KEY (source_table)

## Indexes

- `quarantine_meta_qparity20260610_pkey`
  ```sql
  CREATE UNIQUE INDEX quarantine_meta_qparity20260610_pkey ON public.quarantine_meta_qparity20260610 USING btree (source_table)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
