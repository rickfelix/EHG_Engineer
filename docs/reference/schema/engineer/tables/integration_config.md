# integration_config Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-27T22:03:40.633Z
**Rows**: 2
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| config_key | `text` | **NO** | - | - |
| config_value | `jsonb` | **NO** | `'{}'::jsonb` | - |
| description | `text` | YES | - | - |
| is_active | `boolean` | **NO** | `true` | - |

## Constraints

### Primary Key
- `integration_config_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `uq_integration_config_key`: UNIQUE (config_key)

## Indexes

- `idx_integration_config_active`
  ```sql
  CREATE INDEX idx_integration_config_active ON public.integration_config USING btree (is_active, config_key)
  ```
- `integration_config_pkey`
  ```sql
  CREATE UNIQUE INDEX integration_config_pkey ON public.integration_config USING btree (id)
  ```
- `uq_integration_config_key`
  ```sql
  CREATE UNIQUE INDEX uq_integration_config_key ON public.integration_config USING btree (config_key)
  ```

## RLS Policies

### 1. Service role full access to integration_config (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`
- **With Check**: `(auth.role() = 'service_role'::text)`

## Triggers

### trg_integration_config_update_timestamp

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION integration_config_update_timestamp()`

---

[← Back to Schema Overview](../database-schema-overview.md)
