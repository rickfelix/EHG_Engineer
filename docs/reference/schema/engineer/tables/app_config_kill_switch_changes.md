# app_config_kill_switch_changes Table

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

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| key | `text` | **NO** | - | - |
| old_value | `jsonb` | YES | - | - |
| new_value | `jsonb` | **NO** | - | - |
| changed_at | `timestamp with time zone` | **NO** | `now()` | - |
| changed_by | `text` | YES | - | - |
| source | `text` | YES | - | - |
| metadata | `jsonb` | **NO** | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `app_config_kill_switch_changes_pkey`: PRIMARY KEY (id)

## Indexes

- `app_config_kill_switch_changes_pkey`
  ```sql
  CREATE UNIQUE INDEX app_config_kill_switch_changes_pkey ON public.app_config_kill_switch_changes USING btree (id)
  ```
- `idx_app_config_kill_switch_changes_key_changed_at`
  ```sql
  CREATE INDEX idx_app_config_kill_switch_changes_key_changed_at ON public.app_config_kill_switch_changes USING btree (key, changed_at DESC)
  ```

## RLS Policies

### 1. service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
