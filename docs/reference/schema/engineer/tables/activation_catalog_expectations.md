# activation_catalog_expectations Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-05-22T02:08:53.107Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (5 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| sd_id | `character varying(50)` | **NO** | - | FK to strategic_directives_v2.id (CASCADE on delete). Type=varchar(50) to match PK. |
| table_name | `text` | **NO** | - | Catalog/registry table that must be non-empty after migration |
| seed_migration_path | `text` | **NO** | - | Relative path to the seed migration script (reported in CI failure for actionable remediation) |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_by | `text` | YES | - | - |

## Constraints

### Primary Key
- `activation_catalog_expectations_pkey`: PRIMARY KEY (sd_id, table_name)

### Foreign Keys
- `activation_catalog_expectations_sd_id_fkey`: sd_id → strategic_directives_v2(id)

## Indexes

- `activation_catalog_expectations_pkey`
  ```sql
  CREATE UNIQUE INDEX activation_catalog_expectations_pkey ON public.activation_catalog_expectations USING btree (sd_id, table_name)
  ```
- `idx_activation_catalog_expectations_table`
  ```sql
  CREATE INDEX idx_activation_catalog_expectations_table ON public.activation_catalog_expectations USING btree (table_name)
  ```

## RLS Policies

### 1. authenticated_read_activation_catalog (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_write_activation_catalog (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
