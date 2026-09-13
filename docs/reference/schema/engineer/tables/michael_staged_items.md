# michael_staged_items Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-09-13T06:31:02.341Z
**Rows**: 2
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| kind | `text` | **NO** | - | - |
| payload | `jsonb` | **NO** | `'{}'::jsonb` | - |
| staged_at | `timestamp with time zone` | **NO** | `now()` | - |
| dispositioned_at | `timestamp with time zone` | YES | - | - |
| disposition | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `michael_staged_items_pkey`: PRIMARY KEY (id)

## Indexes

- `michael_staged_items_kind_open_idx`
  ```sql
  CREATE INDEX michael_staged_items_kind_open_idx ON public.michael_staged_items USING btree (kind) WHERE (dispositioned_at IS NULL)
  ```
- `michael_staged_items_pkey`
  ```sql
  CREATE UNIQUE INDEX michael_staged_items_pkey ON public.michael_staged_items USING btree (id)
  ```

## RLS Policies

### 1. michael_staged_items_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### michael_staged_items_set_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION michael_set_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
