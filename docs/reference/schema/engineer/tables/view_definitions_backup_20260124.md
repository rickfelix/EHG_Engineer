# view_definitions_backup_20260124 Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-08T23:40:59.484Z
**Rows**: 10
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (4 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| view_name | `text` | **NO** | - | - |
| view_type | `text` | YES | - | - |
| view_definition | `text` | YES | - | - |
| backed_up_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `view_definitions_backup_20260124_pkey`: PRIMARY KEY (view_name)

## Indexes

- `view_definitions_backup_20260124_pkey`
  ```sql
  CREATE UNIQUE INDEX view_definitions_backup_20260124_pkey ON public.view_definitions_backup_20260124 USING btree (view_name)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
