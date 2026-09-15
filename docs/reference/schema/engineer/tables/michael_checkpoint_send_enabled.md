# michael_checkpoint_send_enabled Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-09-15T16:18:27.599Z
**Rows**: 2
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| config_key | `text` | **NO** | - | - |
| enabled | `boolean` | **NO** | `true` | - |
| updated_by | `text` | YES | - | - |
| reason | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `michael_checkpoint_send_enabled_pkey`: PRIMARY KEY (id)

## Indexes

- `michael_checkpoint_send_enabled_config_key_uniq`
  ```sql
  CREATE UNIQUE INDEX michael_checkpoint_send_enabled_config_key_uniq ON public.michael_checkpoint_send_enabled USING btree (config_key)
  ```
- `michael_checkpoint_send_enabled_pkey`
  ```sql
  CREATE UNIQUE INDEX michael_checkpoint_send_enabled_pkey ON public.michael_checkpoint_send_enabled USING btree (id)
  ```

## RLS Policies

### 1. michael_checkpoint_send_enabled_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### michael_checkpoint_send_enabled_set_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION michael_set_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
