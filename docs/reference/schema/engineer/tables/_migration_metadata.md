---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-03-01
tags: [reference, auto-generated]
---
# _migration_metadata Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-01T00:41:31.291Z
**Rows**: 2
**RLS**: Enabled (0 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (2 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| key | `text` | **NO** | - | - |
| value | `timestamp with time zone` | **NO** | - | - |

## Constraints

### Primary Key
- `_migration_metadata_pkey`: PRIMARY KEY (key)

## Indexes

- `_migration_metadata_pkey`
  ```sql
  CREATE UNIQUE INDEX _migration_metadata_pkey ON public._migration_metadata USING btree (key)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
