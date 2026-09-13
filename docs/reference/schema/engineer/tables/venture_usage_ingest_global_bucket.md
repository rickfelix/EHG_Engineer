# venture_usage_ingest_global_bucket Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-09-13T06:31:02.341Z
**Rows**: 0
**RLS**: Enabled (0 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (2 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| bucket_hour | `timestamp with time zone` | **NO** | - | - |
| event_count | `bigint(64)` | **NO** | `0` | - |

## Constraints

### Primary Key
- `venture_usage_ingest_global_bucket_pkey`: PRIMARY KEY (bucket_hour)

## Indexes

- `venture_usage_ingest_global_bucket_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_usage_ingest_global_bucket_pkey ON public.venture_usage_ingest_global_bucket USING btree (bucket_hour)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
