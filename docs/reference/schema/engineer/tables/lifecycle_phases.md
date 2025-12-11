# lifecycle_phases Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2025-12-10T16:10:41.778Z
**Rows**: 6
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (5 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| phase_number | `integer(32)` | **NO** | - | - |
| phase_name | `character varying(50)` | **NO** | - | - |
| description | `text` | YES | - | - |
| stages | `ARRAY` | **NO** | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `lifecycle_phases_pkey`: PRIMARY KEY (phase_number)

## Indexes

- `lifecycle_phases_pkey`
  ```sql
  CREATE UNIQUE INDEX lifecycle_phases_pkey ON public.lifecycle_phases USING btree (phase_number)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
