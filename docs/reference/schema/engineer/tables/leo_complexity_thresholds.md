# leo_complexity_thresholds Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2025-10-28T12:24:22.172Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (5 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| factor_name | `character varying(100)` | **NO** | - | - |
| threshold_config | `jsonb` | **NO** | - | - |
| active | `boolean` | YES | `true` | - |
| created_at | `timestamp with time zone` | YES | `CURRENT_TIMESTAMP` | - |

## Constraints

### Primary Key
- `leo_complexity_thresholds_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `leo_complexity_thresholds_factor_name_key`: UNIQUE (factor_name)

## Indexes

- `leo_complexity_thresholds_factor_name_key`
  ```sql
  CREATE UNIQUE INDEX leo_complexity_thresholds_factor_name_key ON public.leo_complexity_thresholds USING btree (factor_name)
  ```
- `leo_complexity_thresholds_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_complexity_thresholds_pkey ON public.leo_complexity_thresholds USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_leo_complexity_thresholds (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_leo_complexity_thresholds (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
