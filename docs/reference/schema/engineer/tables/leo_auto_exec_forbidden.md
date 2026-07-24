# leo_auto_exec_forbidden Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 5
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (4 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| action_class | `text` | **NO** | - | - |
| reason | `text` | YES | - | - |
| outward_facing | `boolean` | YES | `false` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `leo_auto_exec_forbidden_pkey`: PRIMARY KEY (action_class)

## Indexes

- `leo_auto_exec_forbidden_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_auto_exec_forbidden_pkey ON public.leo_auto_exec_forbidden USING btree (action_class)
  ```

## RLS Policies

### 1. engine_ro_select_leo_auto_exec_forbidden (SELECT)

- **Roles**: {leo_engine_ro}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
