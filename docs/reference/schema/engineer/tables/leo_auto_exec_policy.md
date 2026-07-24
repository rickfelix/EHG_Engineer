# leo_auto_exec_policy Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| action_class | `text` | **NO** | - | - |
| preconditions | `jsonb` | YES | - | - |
| canary | `jsonb` | YES | - | - |
| rollback | `jsonb` | YES | - | - |
| blast_radius | `jsonb` | YES | - | - |
| observe_window | `jsonb` | YES | - | - |
| escalation | `jsonb` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `leo_auto_exec_policy_pkey`: PRIMARY KEY (action_class)

## Indexes

- `leo_auto_exec_policy_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_auto_exec_policy_pkey ON public.leo_auto_exec_policy USING btree (action_class)
  ```

## RLS Policies

### 1. engine_ro_select_leo_auto_exec_policy (SELECT)

- **Roles**: {leo_engine_ro}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
