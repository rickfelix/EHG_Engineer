# rca_auto_trigger_config Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-13T20:27:15.571Z
**Rows**: 8
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| trigger_type | `text` | **NO** | - | - |
| enabled | `boolean` | YES | `true` | - |
| rate_limit_per_minute | `integer(32)` | YES | `3` | - |
| auto_create_fix_sd | `boolean` | YES | `false` | - |
| recurrence_threshold | `integer(32)` | YES | `3` | - |
| recurrence_window_days | `integer(32)` | YES | `14` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `rca_auto_trigger_config_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `rca_auto_trigger_config_trigger_type_key`: UNIQUE (trigger_type)

## Indexes

- `rca_auto_trigger_config_pkey`
  ```sql
  CREATE UNIQUE INDEX rca_auto_trigger_config_pkey ON public.rca_auto_trigger_config USING btree (id)
  ```
- `rca_auto_trigger_config_trigger_type_key`
  ```sql
  CREATE UNIQUE INDEX rca_auto_trigger_config_trigger_type_key ON public.rca_auto_trigger_config USING btree (trigger_type)
  ```

## RLS Policies

### 1. authenticated_read_rca_config (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_rca_config (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
