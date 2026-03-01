# leo_kill_switches Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-01T00:41:31.291Z
**Rows**: 1
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| switch_key | `text` | **NO** | - | Kill switch identifier (e.g., CONST-009 for feature flags) |
| display_name | `text` | **NO** | - | - |
| description | `text` | YES | - | - |
| is_active | `boolean` | **NO** | `false` | When true, all associated features are disabled |
| activated_at | `timestamp with time zone` | YES | - | - |
| activated_by | `text` | YES | - | - |
| deactivated_at | `timestamp with time zone` | YES | - | - |
| deactivated_by | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `leo_kill_switches_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `leo_kill_switches_switch_key_key`: UNIQUE (switch_key)

## Indexes

- `leo_kill_switches_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_kill_switches_pkey ON public.leo_kill_switches USING btree (id)
  ```
- `leo_kill_switches_switch_key_key`
  ```sql
  CREATE UNIQUE INDEX leo_kill_switches_switch_key_key ON public.leo_kill_switches USING btree (switch_key)
  ```

## RLS Policies

### 1. leo_kill_switches_authenticated_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. leo_kill_switches_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### set_updated_at_leo_kill_switches

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION trigger_set_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
