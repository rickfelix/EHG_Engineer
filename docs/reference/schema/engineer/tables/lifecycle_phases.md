# lifecycle_phases Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-06-04T16:54:13.112Z
**Rows**: 6
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

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

## RLS Policies

### 1. lifecycle_phases_select (SELECT)

- **Roles**: {public}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
