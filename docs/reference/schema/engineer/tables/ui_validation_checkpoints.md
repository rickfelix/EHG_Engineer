# ui_validation_checkpoints Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-02T15:39:22.640Z
**Rows**: 6
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| checkpoint_name | `character varying(255)` | **NO** | - | - |
| checkpoint_type | `character varying(50)` | **NO** | - | - |
| required_tests | `jsonb` | YES | `'[]'::jsonb` | - |
| required_coverage | `numeric(5,2)` | YES | `80.0` | - |
| required_screenshots | `integer(32)` | YES | `3` | - |
| block_on_failure | `boolean` | YES | `true` | - |
| active | `boolean` | YES | `true` | - |
| created_at | `timestamp with time zone` | YES | `CURRENT_TIMESTAMP` | - |
| updated_at | `timestamp with time zone` | YES | `CURRENT_TIMESTAMP` | - |

## Constraints

### Primary Key
- `ui_validation_checkpoints_pkey`: PRIMARY KEY (id)

## Indexes

- `ui_validation_checkpoints_pkey`
  ```sql
  CREATE UNIQUE INDEX ui_validation_checkpoints_pkey ON public.ui_validation_checkpoints USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_ui_validation_checkpoints (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_ui_validation_checkpoints (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
