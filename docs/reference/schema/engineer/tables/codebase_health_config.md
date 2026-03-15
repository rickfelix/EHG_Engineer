# codebase_health_config Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-15T02:45:15.846Z
**Rows**: N/A (RLS restricted)
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| dimension | `text` | **NO** | - | - |
| enabled | `boolean` | **NO** | `true` | - |
| threshold_warning | `numeric(5,2)` | **NO** | `70` | - |
| threshold_critical | `numeric(5,2)` | **NO** | `50` | - |
| min_occurrences | `integer(32)` | **NO** | `2` | - |
| max_sds_per_cycle | `integer(32)` | **NO** | `2` | - |
| allowlist | `jsonb` | YES | `'[]'::jsonb` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `codebase_health_config_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `codebase_health_config_dimension_key`: UNIQUE (dimension)

## Indexes

- `codebase_health_config_dimension_key`
  ```sql
  CREATE UNIQUE INDEX codebase_health_config_dimension_key ON public.codebase_health_config USING btree (dimension)
  ```
- `codebase_health_config_pkey`
  ```sql
  CREATE UNIQUE INDEX codebase_health_config_pkey ON public.codebase_health_config USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_config (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_config (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
