# global_competitors Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-23T20:56:03.959Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| name | `text` | **NO** | - | - |
| website | `text` | YES | - | - |
| description | `text` | YES | - | - |
| founded_year | `integer(32)` | YES | - | - |
| employee_range | `text` | YES | - | - |
| funding_stage | `text` | YES | - | - |
| headquarters | `text` | YES | - | - |
| industries | `ARRAY` | YES | `'{}'::text[]` | - |
| canonical_id | `uuid` | YES | - | - |
| created_by | `text` | YES | `'system'::text` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `global_competitors_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `global_competitors_canonical_id_fkey`: canonical_id → global_competitors(id)

## Indexes

- `global_competitors_pkey`
  ```sql
  CREATE UNIQUE INDEX global_competitors_pkey ON public.global_competitors USING btree (id)
  ```
- `idx_global_competitors_canonical`
  ```sql
  CREATE UNIQUE INDEX idx_global_competitors_canonical ON public.global_competitors USING btree (name, COALESCE(website, ''::text)) WHERE (canonical_id IS NULL)
  ```

## RLS Policies

### 1. all_global_competitors_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. select_global_competitors_authenticated (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

## Triggers

### set_updated_at_global_competitors

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION trg_set_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
