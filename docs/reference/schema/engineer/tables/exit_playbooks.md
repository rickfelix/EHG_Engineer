# exit_playbooks Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-16T10:01:05.770Z
**Rows**: N/A (RLS restricted)
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| name | `text` | **NO** | - | - |
| exit_type | `text` | **NO** | - | - |
| description | `text` | YES | - | - |
| prerequisites | `ARRAY` | YES | `'{}'::text[]` | - |
| timeline_months | `integer(32)` | YES | - | - |
| target_multiple_range | `numrange` | YES | - | - |
| applicable_archetypes | `ARRAY` | YES | `'{}'::text[]` | - |
| steps | `jsonb` | YES | `'[]'::jsonb` | - |
| created_by | `text` | YES | `'system'::text` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `exit_playbooks_pkey`: PRIMARY KEY (id)

## Indexes

- `exit_playbooks_pkey`
  ```sql
  CREATE UNIQUE INDEX exit_playbooks_pkey ON public.exit_playbooks USING btree (id)
  ```

## RLS Policies

### 1. all_exit_playbooks_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. select_exit_playbooks_authenticated (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

## Triggers

### set_updated_at_exit_playbooks

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION trg_set_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
