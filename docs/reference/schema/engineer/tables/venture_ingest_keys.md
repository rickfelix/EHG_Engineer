# venture_ingest_keys Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-08-22T17:33:48.904Z
**Rows**: 0
**RLS**: Enabled (0 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (4 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| venture_id | `uuid` | **NO** | - | - |
| ingest_secret_hash | `text` | **NO** | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| rotated_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `venture_ingest_keys_pkey`: PRIMARY KEY (venture_id)

### Foreign Keys
- `venture_ingest_keys_venture_id_fkey`: venture_id → ventures(id)

## Indexes

- `venture_ingest_keys_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_ingest_keys_pkey ON public.venture_ingest_keys USING btree (venture_id)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
